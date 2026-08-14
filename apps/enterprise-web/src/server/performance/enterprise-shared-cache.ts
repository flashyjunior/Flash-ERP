import crypto from "node:crypto";

import { Prisma } from "@prisma/client";
import { createClient } from "redis";

type RedisClient = ReturnType<typeof createClient>;

type SharedCacheRecord<T> = {
  value: T;
  expiresAt: number;
  staleUntil: number;
};

type SharedCacheResult<T> = SharedCacheRecord<T> & {
  source: "redis" | "loader";
};

type SharedCacheState = {
  client?: RedisClient;
  subscriber?: RedisClient;
  connection?: Promise<RedisClient | null>;
  subscription?: Promise<void>;
  disabledUntil: number;
  localInvalidator?: (prefix?: string) => void;
  metrics: {
    hits: number;
    misses: number;
    staleHits: number;
    writes: number;
    invalidations: number;
    lockAcquired: number;
    lockContended: number;
    lockTimeouts: number;
    fallbackLoads: number;
    errors: number;
    lastErrorAt: string | null;
  };
};

type TaggedValue = {
  __flashErpCacheType: "bigint" | "buffer" | "date" | "decimal";
  value: string;
};

const globalForSharedCache = globalThis as unknown as {
  flashErpEnterpriseSharedCache?: SharedCacheState;
};

const state = globalForSharedCache.flashErpEnterpriseSharedCache ?? {
  disabledUntil: 0,
  metrics: {
    hits: 0,
    misses: 0,
    staleHits: 0,
    writes: 0,
    invalidations: 0,
    lockAcquired: 0,
    lockContended: 0,
    lockTimeouts: 0,
    fallbackLoads: 0,
    errors: 0,
    lastErrorAt: null
  }
};

globalForSharedCache.flashErpEnterpriseSharedCache = state;

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function redisUrl() {
  return process.env.FLASH_ERP_REDIS_URL?.trim() ?? "";
}

function redisPrefix() {
  return (process.env.FLASH_ERP_REDIS_PREFIX?.trim() || "flash-erp:enterprise").replace(/:+$/, "");
}

function commandTimeoutMs() {
  return positiveInteger(process.env.FLASH_ERP_REDIS_COMMAND_TIMEOUT_MS, 2_000);
}

function cacheNamespace(key: string) {
  const parts = key.split(":").filter(Boolean);
  if ((parts[0] === "ecommerce" || parts[0] === "hq") && parts[1]) {
    return `${parts[0]}:${parts[1]}`;
  }
  return parts[0] || "default";
}

function keyHash(key: string) {
  return crypto.createHash("sha256").update(key).digest("hex");
}

function generationKeys(key: string) {
  const prefix = redisPrefix();
  return {
    global: `${prefix}:generation:global`,
    namespace: `${prefix}:generation:${cacheNamespace(key)}`
  };
}

function sharedKeys(key: string, globalGeneration: string, namespaceGeneration: string) {
  const prefix = redisPrefix();
  const version = `${globalGeneration || "0"}:${namespaceGeneration || "0"}`;
  const hash = keyHash(key);
  return {
    value: `${prefix}:cache:${version}:${hash}`,
    lock: `${prefix}:lock:${version}:${hash}`
  };
}

function encode(value: unknown) {
  return JSON.stringify(value, function cacheReplacer(key, jsonValue) {
    const original = key === "" ? value : (this as Record<string, unknown>)[key];
    if (original instanceof Date) {
      return { __flashErpCacheType: "date", value: original.toISOString() } satisfies TaggedValue;
    }
    if (typeof original === "bigint") {
      return { __flashErpCacheType: "bigint", value: original.toString() } satisfies TaggedValue;
    }
    if (Buffer.isBuffer(original)) {
      return { __flashErpCacheType: "buffer", value: original.toString("base64") } satisfies TaggedValue;
    }
    if (Prisma.Decimal.isDecimal(original)) {
      return { __flashErpCacheType: "decimal", value: original.toString() } satisfies TaggedValue;
    }
    return jsonValue;
  });
}

function decode<T>(value: string) {
  return JSON.parse(value, (_key, jsonValue: unknown) => {
    if (!jsonValue || typeof jsonValue !== "object" || !("__flashErpCacheType" in jsonValue)) {
      return jsonValue;
    }
    const tagged = jsonValue as TaggedValue;
    if (tagged.__flashErpCacheType === "date") return new Date(tagged.value);
    if (tagged.__flashErpCacheType === "bigint") return BigInt(tagged.value);
    if (tagged.__flashErpCacheType === "buffer") return Buffer.from(tagged.value, "base64");
    if (tagged.__flashErpCacheType === "decimal") return new Prisma.Decimal(tagged.value);
    return jsonValue;
  }) as T;
}

async function withTimeout<T>(operation: Promise<T>, label: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`Redis ${label} exceeded ${commandTimeoutMs()}ms.`)),
          commandTimeoutMs()
        );
      })
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function recordError() {
  state.metrics.errors += 1;
  state.metrics.lastErrorAt = new Date().toISOString();
}

async function ensureSubscriber(client: RedisClient) {
  if (state.subscriber?.isReady || state.subscription) return state.subscription;

  state.subscription = (async () => {
    const subscriber = client.duplicate();
    state.subscriber = subscriber;
    subscriber.on("error", recordError);
    await withTimeout(subscriber.connect(), "subscriber connection");
    await withTimeout(
      subscriber.subscribe(`${redisPrefix()}:invalidate`, (message) => {
        try {
          const payload = JSON.parse(message) as { prefix?: string };
          state.localInvalidator?.(payload.prefix);
        } catch {
          recordError();
        }
      }),
      "invalidation subscription"
    );
  })().catch(() => {
    recordError();
    state.subscription = undefined;
    state.subscriber?.destroy();
    state.subscriber = undefined;
  });

  return state.subscription;
}

async function getClient() {
  if (!redisUrl() || Date.now() < state.disabledUntil) return null;
  if (state.client?.isReady) return state.client;
  if (state.connection) return state.connection;

  state.connection = (async () => {
    const client = createClient({
      url: redisUrl(),
      disableOfflineQueue: true,
      socket: {
        connectTimeout: positiveInteger(process.env.FLASH_ERP_REDIS_CONNECT_TIMEOUT_MS, 2_000),
        reconnectStrategy(retries) {
          if (retries >= 5) return new Error("Redis reconnect limit reached.");
          return Math.min(100 * 2 ** retries, 1_000);
        }
      }
    });
    state.client = client;
    client.on("error", recordError);
    try {
      await withTimeout(client.connect(), "connection");
      void ensureSubscriber(client);
      return client;
    } catch {
      recordError();
      state.disabledUntil = Date.now() + positiveInteger(process.env.FLASH_ERP_REDIS_RETRY_MS, 10_000);
      client.destroy();
      state.client = undefined;
      return null;
    } finally {
      state.connection = undefined;
    }
  })();

  return state.connection;
}

async function versionedKeys(client: RedisClient, key: string) {
  const generations = generationKeys(key);
  const [globalGeneration, namespaceGeneration] = await withTimeout(
    client.mGet([generations.global, generations.namespace]),
    "generation read"
  );
  return sharedKeys(key, globalGeneration ?? "0", namespaceGeneration ?? "0");
}

async function readRecord<T>(client: RedisClient, valueKey: string) {
  const cached = await withTimeout(client.get(valueKey), "cache read");
  if (!cached) return null;
  return decode<SharedCacheRecord<T>>(cached);
}

async function writeRecord<T>(
  client: RedisClient,
  valueKey: string,
  value: T,
  ttlMs: number,
  staleWhileRevalidateMs: number
) {
  const loadedAt = Date.now();
  const record: SharedCacheRecord<T> = {
    value,
    expiresAt: loadedAt + ttlMs,
    staleUntil: loadedAt + ttlMs + staleWhileRevalidateMs
  };
  await withTimeout(
    client.set(valueKey, encode(record), { PX: Math.max(1_000, ttlMs + staleWhileRevalidateMs) }),
    "cache write"
  );
  state.metrics.writes += 1;
  return record;
}

async function releaseLock(client: RedisClient, lockKey: string, token: string) {
  await withTimeout(
    client.eval(
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
      { keys: [lockKey], arguments: [token] }
    ),
    "lock release"
  ).catch(recordError);
}

async function loadAndWrite<T>(
  client: RedisClient,
  keys: { value: string; lock: string },
  token: string,
  loader: () => Promise<T>,
  ttlMs: number,
  staleWhileRevalidateMs: number
) {
  try {
    const value = await loader();
    return await writeRecord(client, keys.value, value, ttlMs, staleWhileRevalidateMs);
  } finally {
    await releaseLock(client, keys.lock, token);
  }
}

async function acquireLock(client: RedisClient, lockKey: string) {
  const token = crypto.randomUUID();
  const acquired = await withTimeout(
    client.set(lockKey, token, {
      NX: true,
      PX: positiveInteger(process.env.FLASH_ERP_REDIS_LOAD_LOCK_MS, 30_000)
    }),
    "lock acquisition"
  );
  if (acquired) {
    state.metrics.lockAcquired += 1;
    return token;
  }
  state.metrics.lockContended += 1;
  return null;
}

async function waitForRecord<T>(client: RedisClient, valueKey: string) {
  const deadline = Date.now() + positiveInteger(process.env.FLASH_ERP_REDIS_LOAD_WAIT_MS, 10_000);
  const pollMs = positiveInteger(process.env.FLASH_ERP_REDIS_LOAD_POLL_MS, 50);
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, pollMs));
    const record = await readRecord<T>(client, valueKey);
    if (record) return record;
  }
  state.metrics.lockTimeouts += 1;
  return null;
}

export function registerEnterpriseSharedCacheInvalidator(invalidator: (prefix?: string) => void) {
  state.localInvalidator = invalidator;
}

export async function getEnterpriseSharedCachedRead<T>(
  key: string,
  loader: () => Promise<T>,
  ttlMs: number,
  staleWhileRevalidateMs: number
): Promise<SharedCacheResult<T>> {
  const client = await getClient();
  if (!client) {
    state.metrics.fallbackLoads += 1;
    const value = await loader();
    const loadedAt = Date.now();
    return {
      value,
      expiresAt: loadedAt + ttlMs,
      staleUntil: loadedAt + ttlMs + staleWhileRevalidateMs,
      source: "loader"
    };
  }

  try {
    const keys = await versionedKeys(client, key);
    const existing = await readRecord<T>(client, keys.value);
    const now = Date.now();
    if (existing && existing.expiresAt > now) {
      state.metrics.hits += 1;
      return { ...existing, source: "redis" };
    }

    if (existing && existing.staleUntil > now) {
      state.metrics.staleHits += 1;
      const token = await acquireLock(client, keys.lock);
      if (token) {
        void loadAndWrite(client, keys, token, loader, ttlMs, staleWhileRevalidateMs).catch(recordError);
      }
      return {
        ...existing,
        expiresAt: Math.min(existing.staleUntil, now + 250),
        source: "redis"
      };
    }

    state.metrics.misses += 1;
    const token = await acquireLock(client, keys.lock);
    if (token) {
      const loaded = await loadAndWrite(client, keys, token, loader, ttlMs, staleWhileRevalidateMs);
      return { ...loaded, source: "loader" };
    }

    const loaded = await waitForRecord<T>(client, keys.value);
    if (loaded) {
      state.metrics.hits += 1;
      return { ...loaded, source: "redis" };
    }
  } catch {
    recordError();
  }

  state.metrics.fallbackLoads += 1;
  const value = await loader();
  const loadedAt = Date.now();
  return {
    value,
    expiresAt: loadedAt + ttlMs,
    staleUntil: loadedAt + ttlMs + staleWhileRevalidateMs,
    source: "loader"
  };
}

export async function invalidateEnterpriseSharedCache(prefix?: string) {
  const client = await getClient();
  if (!client) return false;

  try {
    if (!prefix) {
      await withTimeout(client.incr(generationKeys("").global), "global invalidation");
    } else if (prefix.endsWith(":")) {
      await withTimeout(
        client.incr(generationKeys(prefix).namespace),
        "namespace invalidation"
      );
    } else {
      const keys = await versionedKeys(client, prefix);
      await withTimeout(client.del(keys.value), "cache invalidation");
    }
    await withTimeout(
      client.publish(`${redisPrefix()}:invalidate`, JSON.stringify({ prefix })),
      "invalidation publish"
    );
    state.metrics.invalidations += 1;
    return true;
  } catch {
    recordError();
    return false;
  }
}

export function getEnterpriseSharedCacheSnapshot() {
  return {
    enabled: Boolean(redisUrl()),
    connected: Boolean(state.client?.isReady),
    subscriberConnected: Boolean(state.subscriber?.isReady),
    fallbackActive: !redisUrl() || Date.now() < state.disabledUntil,
    ...state.metrics
  };
}

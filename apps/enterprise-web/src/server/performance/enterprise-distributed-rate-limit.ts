import crypto from "node:crypto";

import { createClient } from "redis";

type RedisClient = ReturnType<typeof createClient>;

export type EnterpriseRateLimitPolicy = {
  scope: string;
  limit: number;
  windowMs: number;
};

export type EnterpriseRateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
  resetAt: string;
  source: "redis" | "memory";
};

type LocalCounter = {
  count: number;
  expiresAt: number;
};

type RateLimitState = {
  client?: RedisClient;
  connection?: Promise<RedisClient | null>;
  disabledUntil: number;
  localCounters: Map<string, LocalCounter>;
  metrics: {
    accepted: number;
    rejected: number;
    redisChecks: number;
    memoryChecks: number;
    errors: number;
    lastErrorAt: string | null;
  };
};

const globalForRateLimit = globalThis as unknown as {
  flashErpEnterpriseRateLimit?: RateLimitState;
};

const state = globalForRateLimit.flashErpEnterpriseRateLimit ?? {
  disabledUntil: 0,
  localCounters: new Map<string, LocalCounter>(),
  metrics: {
    accepted: 0,
    rejected: 0,
    redisChecks: 0,
    memoryChecks: 0,
    errors: 0,
    lastErrorAt: null
  }
};

globalForRateLimit.flashErpEnterpriseRateLimit = state;

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

function rateLimitPepper() {
  return (
    process.env.FLASH_ERP_RATE_LIMIT_PEPPER?.trim() ||
    process.env.FLASH_ERP_AUTH_SECRET?.trim() ||
    "flash-erp-rate-limit"
  );
}

function hashIdentity(identity: string) {
  return crypto.createHmac("sha256", rateLimitPepper()).update(identity).digest("hex");
}

function recordError() {
  state.metrics.errors += 1;
  state.metrics.lastErrorAt = new Date().toISOString();
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
      await withTimeout(client.connect(), "rate-limit connection");
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

function normalizedPolicy(policy: EnterpriseRateLimitPolicy) {
  const envScope = policy.scope.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  return {
    scope: policy.scope.trim().toLowerCase().replace(/[^a-z0-9:-]+/g, "-"),
    limit: positiveInteger(process.env[`FLASH_ERP_RATE_LIMIT_${envScope}_MAX`], policy.limit),
    windowMs: positiveInteger(
      process.env[`FLASH_ERP_RATE_LIMIT_${envScope}_WINDOW_MS`],
      policy.windowMs
    )
  };
}

function buildResult(
  allowed: boolean,
  limit: number,
  count: number,
  ttlMs: number,
  source: EnterpriseRateLimitResult["source"]
): EnterpriseRateLimitResult {
  if (allowed) state.metrics.accepted += 1;
  else state.metrics.rejected += 1;
  return {
    allowed,
    limit,
    remaining: Math.max(0, limit - count),
    retryAfterSeconds: Math.max(1, Math.ceil(ttlMs / 1_000)),
    resetAt: new Date(Date.now() + Math.max(1, ttlMs)).toISOString(),
    source
  };
}

function enforceLocal(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const maxEntries = positiveInteger(process.env.FLASH_ERP_RATE_LIMIT_LOCAL_MAX_ENTRIES, 10_000);
  if (state.localCounters.size >= maxEntries) {
    for (const [candidateKey, counter] of state.localCounters) {
      if (counter.expiresAt <= now) state.localCounters.delete(candidateKey);
    }
    while (state.localCounters.size >= maxEntries) {
      const oldestKey = state.localCounters.keys().next().value as string | undefined;
      if (!oldestKey) break;
      state.localCounters.delete(oldestKey);
    }
  }

  const existing = state.localCounters.get(key);
  const counter = !existing || existing.expiresAt <= now
    ? { count: 1, expiresAt: now + windowMs }
    : { count: existing.count + 1, expiresAt: existing.expiresAt };
  state.localCounters.delete(key);
  state.localCounters.set(key, counter);
  state.metrics.memoryChecks += 1;
  return buildResult(
    counter.count <= limit,
    limit,
    counter.count,
    counter.expiresAt - now,
    "memory"
  );
}

export async function enforceEnterpriseRateLimit(
  policyInput: EnterpriseRateLimitPolicy,
  identity: string
): Promise<EnterpriseRateLimitResult> {
  const policy = normalizedPolicy(policyInput);
  const hashedIdentity = hashIdentity(identity.trim() || "unresolved-client");
  const key = `${redisPrefix()}:rate-limit:${policy.scope}:${hashedIdentity}`;
  const client = await getClient();

  if (client) {
    try {
      const result = await withTimeout(
        client.eval(
          "local count = redis.call('INCR', KEYS[1]); " +
            "if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]); end; " +
            "local ttl = redis.call('PTTL', KEYS[1]); return { count, ttl };",
          { keys: [key], arguments: [String(policy.windowMs)] }
        ),
        "rate-limit check"
      );
      const [countValue, ttlValue] = result as [number | string, number | string];
      const count = Number(countValue);
      const ttlMs = Math.max(1, Number(ttlValue));
      state.metrics.redisChecks += 1;
      return buildResult(count <= policy.limit, policy.limit, count, ttlMs, "redis");
    } catch {
      recordError();
    }
  }

  return enforceLocal(key, policy.limit, policy.windowMs);
}

export function getEnterpriseRateLimitSnapshot() {
  return {
    enabled: process.env.FLASH_ERP_RATE_LIMIT_ENABLED !== "false",
    distributed: Boolean(redisUrl()),
    connected: Boolean(state.client?.isReady),
    localEntries: state.localCounters.size,
    ...state.metrics
  };
}

export async function closeEnterpriseRateLimit() {
  const client = state.client;
  state.client = undefined;
  state.connection = undefined;
  state.localCounters.clear();
  if (client?.isOpen) await client.quit().catch(() => client.destroy());
}

type CacheEntry<T> = {
  value?: T;
  expiresAt: number;
  staleUntil: number;
  lastAccessedAt: number;
  pending?: Promise<T>;
};

type CacheState = {
  entries: Map<string, CacheEntry<unknown>>;
  hits: number;
  misses: number;
  staleHits: number;
  coalesced: number;
  loads: number;
  loadFailures: number;
  evictions: number;
};

type CacheOptions = {
  ttlMs?: number;
  staleWhileRevalidateMs?: number;
  maxEntries?: number;
};

const globalForReadCache = globalThis as unknown as {
  flashErpEnterpriseReadCache?: CacheState;
};

const state = globalForReadCache.flashErpEnterpriseReadCache ?? {
  entries: new Map<string, CacheEntry<unknown>>(),
  hits: 0,
  misses: 0,
  staleHits: 0,
  coalesced: 0,
  loads: 0,
  loadFailures: 0,
  evictions: 0
};

globalForReadCache.flashErpEnterpriseReadCache = state;

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function trimCache(maxEntries: number) {
  if (state.entries.size < maxEntries) return;

  const oldest = [...state.entries.entries()]
    .filter(([, entry]) => !entry.pending)
    .sort((left, right) => left[1].lastAccessedAt - right[1].lastAccessedAt)[0];

  if (oldest) {
    state.entries.delete(oldest[0]);
    state.evictions += 1;
  }
}

async function loadEntry<T>(
  key: string,
  entry: CacheEntry<T>,
  loader: () => Promise<T>,
  ttlMs: number,
  staleWhileRevalidateMs: number
) {
  state.loads += 1;
  const pending = getEnterpriseSharedCachedRead(
    key,
    loader,
    ttlMs,
    staleWhileRevalidateMs
  )
    .then((loaded) => {
      entry.value = loaded.value;
      entry.expiresAt = loaded.expiresAt;
      entry.staleUntil = loaded.staleUntil;
      entry.lastAccessedAt = Date.now();
      entry.pending = undefined;
      return loaded.value;
    })
    .catch((error) => {
      state.loadFailures += 1;
      entry.pending = undefined;
      if (entry.value === undefined) state.entries.delete(key);
      throw error;
    });

  entry.pending = pending;
  state.entries.set(key, entry as CacheEntry<unknown>);
  return pending;
}

export async function getEnterpriseCachedRead<T>(
  key: string,
  loader: () => Promise<T>,
  options: CacheOptions = {}
): Promise<T> {
  const ttlMs = options.ttlMs ?? positiveInteger(process.env.FLASH_ERP_READ_CACHE_TTL_MS, 15_000);
  const staleWhileRevalidateMs =
    options.staleWhileRevalidateMs ??
    positiveInteger(process.env.FLASH_ERP_READ_CACHE_STALE_MS, 60_000);
  const maxEntries =
    options.maxEntries ?? positiveInteger(process.env.FLASH_ERP_READ_CACHE_MAX_ENTRIES, 500);
  const now = Date.now();
  const existing = state.entries.get(key) as CacheEntry<T> | undefined;

  if (existing?.value !== undefined && existing.expiresAt > now) {
    existing.lastAccessedAt = now;
    state.hits += 1;
    return existing.value;
  }

  if (existing?.value !== undefined && existing.staleUntil > now) {
    existing.lastAccessedAt = now;
    state.staleHits += 1;
    if (!existing.pending) {
      void loadEntry(key, existing, loader, ttlMs, staleWhileRevalidateMs).catch(() => undefined);
    }
    return existing.value;
  }

  if (existing?.pending) {
    state.coalesced += 1;
    return existing.pending;
  }

  state.misses += 1;
  trimCache(maxEntries);
  return loadEntry(
    key,
    existing ?? { expiresAt: 0, staleUntil: 0, lastAccessedAt: now },
    loader,
    ttlMs,
    staleWhileRevalidateMs
  );
}

export function getEnterpriseHqCachedRead<T>(
  key: string,
  loader: () => Promise<T>,
  options: CacheOptions = {}
) {
  return getEnterpriseCachedRead(`hq:${key}`, loader, {
    ttlMs:
      options.ttlMs ?? positiveInteger(process.env.FLASH_ERP_HQ_READ_CACHE_TTL_MS, 5_000),
    staleWhileRevalidateMs:
      options.staleWhileRevalidateMs ??
      positiveInteger(process.env.FLASH_ERP_HQ_READ_CACHE_STALE_MS, 20_000),
    maxEntries: options.maxEntries
  });
}

export function invalidateEnterpriseReadCache(prefix?: string) {
  let invalidated = 0;

  for (const key of state.entries.keys()) {
    if (!prefix || key.startsWith(prefix)) {
      state.entries.delete(key);
      invalidated += 1;
    }
  }

  void invalidateEnterpriseSharedCache(prefix);

  return invalidated;
}

registerEnterpriseSharedCacheInvalidator((prefix) => {
  for (const key of state.entries.keys()) {
    if (!prefix || key.startsWith(prefix)) state.entries.delete(key);
  }
});

export function getEnterpriseReadCacheSnapshot() {
  return {
    entries: state.entries.size,
    hits: state.hits,
    misses: state.misses,
    staleHits: state.staleHits,
    coalesced: state.coalesced,
    loads: state.loads,
    loadFailures: state.loadFailures,
    evictions: state.evictions
  };
}
import {
  getEnterpriseSharedCachedRead,
  invalidateEnterpriseSharedCache,
  registerEnterpriseSharedCacheInvalidator
} from "@/server/performance/enterprise-shared-cache";

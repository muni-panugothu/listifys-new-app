/**
 * Tiered cache facade — L1 (memory) + L2 (AsyncStorage) with SWR.
 *
 * Read flow:
 *   1. L1 memory hit + fresh    → return synchronously
 *   2. L1 memory hit + stale    → return stale, kick off revalidate
 *   3. L2 disk hit               → return (sync via Promise), promote to L1
 *   4. Network fetch             → write to L1 + L2
 *
 * Write flow (on mutations):
 *   1. Write through to L1 + L2
 *   2. Invalidate family on Redis via API event (server-side, see cache.service.js)
 *   3. Broadcast `tieredCache:invalidate` so subscribers (React Query-like
 *      consumers) re-render.
 *
 * Anti-stampede:
 *   - In-flight Map dedupes concurrent fetches by key.
 *   - SWR refreshes are throttled per-key (minRefreshIntervalMs).
 */

import {
  deletePersistent,
  deletePersistentByPrefix,
  readPersistent,
  wipePersistentCache,
  writePersistent,
  type ReadResult,
} from "@/lib/cache/persistent-cache";

import { ALL_FAMILY_PREFIXES } from "@/lib/cache/cache-keys";

// ── L1: in-memory ────────────────────────────────────────────────────────────

type MemoryEntry<T> = {
  data: T;
  storedAt: number;
  ttl: number;
};

const memory = new Map<string, MemoryEntry<unknown>>();
const MAX_MEMORY_ENTRIES = 300;

function memoryRead<T>(key: string): MemoryEntry<T> | null {
  const e = memory.get(key) as MemoryEntry<T> | undefined;
  if (!e) return null;
  return e;
}

function memoryWrite<T>(key: string, data: T, ttl: number) {
  if (memory.size >= MAX_MEMORY_ENTRIES) {
    // Drop oldest 10% — cheap LRU-ish behavior without sort cost on every write.
    const dropCount = Math.ceil(MAX_MEMORY_ENTRIES * 0.1);
    let dropped = 0;
    for (const k of memory.keys()) {
      memory.delete(k);
      if (++dropped >= dropCount) break;
    }
  }
  memory.set(key, { data, storedAt: Date.now(), ttl });
}

// ── In-flight dedupe + refresh throttle ──────────────────────────────────────

const inFlight = new Map<string, Promise<unknown>>();
const lastRefreshedAt = new Map<string, number>();

// ── Subscriptions ────────────────────────────────────────────────────────────

type Listener = (event: { type: "invalidate" | "set"; key: string }) => void;
const listeners = new Set<Listener>();

export function subscribeCache(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(event: { type: "invalidate" | "set"; key: string }) {
  for (const l of listeners) l(event);
}

// ── Public API ───────────────────────────────────────────────────────────────

export type SwrOptions<T> = {
  /** Soft TTL — after this the cached value is `stale` but still returned. */
  ttlMs: number;
  /** Hard expiration on disk. Default 14 days. */
  maxAgeMs?: number;
  /** Minimum time between background refresh attempts for the same key. */
  minRefreshIntervalMs?: number;
  /** Persist to L2. Defaults to true. */
  persist?: boolean;
  /** Map raw fetch result before caching (e.g. strip large fields). */
  serialize?: (data: T) => T;
};

/**
 * Stale-while-revalidate read.
 *
 * Returns `{ data, source }` where source is:
 *   - "memory-fresh"   : L1 hit, within TTL — no network at all
 *   - "memory-stale"   : L1 hit, past TTL — fired background refresh
 *   - "disk-fresh"     : L2 hit, within TTL — promoted to L1
 *   - "disk-stale"     : L2 hit, past TTL — fired background refresh
 *   - "network"        : cache miss — awaited fetch
 *
 * Subscribers can subscribe to `subscribeCache` to be notified when a
 * background refresh writes new data for `key`.
 */
export async function swrGet<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: SwrOptions<T>,
): Promise<{ data: T; source: "memory-fresh" | "memory-stale" | "disk-fresh" | "disk-stale" | "network" }> {
  const { ttlMs, maxAgeMs, persist = true, minRefreshIntervalMs = 5_000, serialize } = options;

  const finalize = (raw: T): T => (serialize ? serialize(raw) : raw);

  // L1 path
  const mem = memoryRead<T>(key);
  if (mem) {
    const stale = Date.now() - mem.storedAt > mem.ttl;
    if (!stale) return { data: mem.data, source: "memory-fresh" };
    void revalidate(key, fetcher, { ttlMs, maxAgeMs, persist, minRefreshIntervalMs, serialize });
    return { data: mem.data, source: "memory-stale" };
  }

  // L2 path
  if (persist) {
    const disk = (await readPersistent<T>(key)) as ReadResult<T>;
    if (disk.hit) {
      memoryWrite(key, disk.data, ttlMs);
      if (disk.stale) {
        void revalidate(key, fetcher, { ttlMs, maxAgeMs, persist, minRefreshIntervalMs, serialize });
        return { data: disk.data, source: "disk-stale" };
      }
      return { data: disk.data, source: "disk-fresh" };
    }
  }

  // Network path — dedupe concurrent callers
  const existing = inFlight.get(key) as Promise<T> | undefined;
  const promise = existing ?? fetcher().then((d) => finalize(d));
  if (!existing) inFlight.set(key, promise);

  try {
    const data = await promise;
    memoryWrite(key, data, ttlMs);
    if (persist) writePersistent(key, data, { ttlMs, maxAgeMs });
    emit({ type: "set", key });
    return { data, source: "network" };
  } finally {
    inFlight.delete(key);
  }
}

async function revalidate<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: SwrOptions<T>,
): Promise<void> {
  const { ttlMs, maxAgeMs, persist = true, minRefreshIntervalMs = 5_000, serialize } = options;
  const now = Date.now();
  const last = lastRefreshedAt.get(key) ?? 0;
  if (now - last < minRefreshIntervalMs) return;
  if (inFlight.has(key)) return;

  lastRefreshedAt.set(key, now);
  const promise = fetcher();
  inFlight.set(key, promise);

  try {
    const raw = await promise;
    const data = serialize ? serialize(raw) : raw;
    memoryWrite(key, data, ttlMs);
    if (persist) writePersistent(key, data, { ttlMs, maxAgeMs });
    emit({ type: "set", key });
  } catch {
    /* network error — keep stale value */
  } finally {
    inFlight.delete(key);
  }
}

/** Write-through (use after mutations to update cache without an extra fetch). */
export function setCache<T>(key: string, data: T, ttlMs: number, persist = true): void {
  memoryWrite(key, data, ttlMs);
  if (persist) writePersistent(key, data, { ttlMs });
  emit({ type: "set", key });
}

/** Invalidate by exact key. */
export function invalidate(key: string): void {
  memory.delete(key);
  lastRefreshedAt.delete(key);
  void deletePersistent(key);
  emit({ type: "invalidate", key });
}

/** Invalidate by prefix — e.g. familyPrefix("feed"). */
export function invalidateByPrefix(prefix: string): void {
  for (const k of memory.keys()) {
    if (k.startsWith(prefix)) {
      memory.delete(k);
      lastRefreshedAt.delete(k);
    }
  }
  void deletePersistentByPrefix(prefix);
  emit({ type: "invalidate", key: prefix });
}

/** Full cache wipe — call on sign-out. */
export async function clearAllCaches(): Promise<void> {
  memory.clear();
  lastRefreshedAt.clear();
  inFlight.clear();
  await wipePersistentCache();
  for (const prefix of ALL_FAMILY_PREFIXES) {
    emit({ type: "invalidate", key: prefix });
  }
}

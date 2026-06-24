/**
 * L2 cache: AsyncStorage-backed, namespaced, with TTL + soft-expiration.
 *
 * Design:
 *   - One AsyncStorage key per entry. Reads are O(1) and never block the JS
 *     thread because AsyncStorage is async by nature.
 *   - Soft expiration: entries stay readable past `ttlMs` (returns `stale: true`)
 *     so callers can implement stale-while-revalidate without a network gap.
 *   - Hard expiration: a separate `maxAgeMs` removes entries permanently when
 *     they are *very* old (default 14 days).
 *   - Schema version embedded in each entry: bump on breaking changes.
 *   - All writes go through a write-coalescing queue to avoid hammering
 *     AsyncStorage during bursty navigation.
 *
 * Use via `tieredCache.swr(...)` — do not call directly from screens.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

const NAMESPACE = "@listify/v1/";
const ENTRY_SCHEMA = 2;

type Envelope<T> = {
  v: number; // schema version
  d: T; // data
  t: number; // stored timestamp (ms)
  ttl: number; // soft TTL (ms)
  exp?: number; // hard expiration (ms epoch)
};

export type ReadResult<T> =
  | { hit: true; data: T; stale: boolean; storedAt: number }
  | { hit: false };

function namespacedKey(key: string) {
  return `${NAMESPACE}${key}`;
}

// ── Write coalescing ─────────────────────────────────────────────────────────
// Many screens write the same keys back-to-back (e.g. paginating feed). We
// batch writes per microtask via setImmediate / queueMicrotask so AsyncStorage
// sees one multiSet instead of N setItem calls.

const pendingWrites = new Map<string, string>();
let flushScheduled = false;

function scheduleFlush() {
  if (flushScheduled) return;
  flushScheduled = true;
  // Use setTimeout(0) — works on both Hermes and JSC.
  setTimeout(async () => {
    flushScheduled = false;
    const entries = [...pendingWrites.entries()];
    pendingWrites.clear();
    if (entries.length === 0) return;
    try {
      await AsyncStorage.multiSet(entries);
    } catch {
      // Storage is non-critical — fail silently. Memory cache still holds.
    }
  }, 0);
}

// ── API ───────────────────────────────────────────────────────────────────────

export async function readPersistent<T>(key: string): Promise<ReadResult<T>> {
  try {
    const raw = await AsyncStorage.getItem(namespacedKey(key));
    if (!raw) return { hit: false };

    const env = JSON.parse(raw) as Envelope<T>;
    if (!env || env.v !== ENTRY_SCHEMA) {
      // Stale schema — drop.
      void deletePersistent(key);
      return { hit: false };
    }

    const now = Date.now();
    if (env.exp != null && now > env.exp) {
      void deletePersistent(key);
      return { hit: false };
    }

    const age = now - env.t;
    return { hit: true, data: env.d, stale: age > env.ttl, storedAt: env.t };
  } catch {
    return { hit: false };
  }
}

export function writePersistent<T>(
  key: string,
  data: T,
  options: { ttlMs: number; maxAgeMs?: number },
): void {
  const { ttlMs, maxAgeMs = 14 * 24 * 60 * 60 * 1000 } = options;
  const env: Envelope<T> = {
    v: ENTRY_SCHEMA,
    d: data,
    t: Date.now(),
    ttl: ttlMs,
    exp: Date.now() + maxAgeMs,
  };
  pendingWrites.set(namespacedKey(key), JSON.stringify(env));
  scheduleFlush();
}

export async function deletePersistent(key: string): Promise<void> {
  pendingWrites.delete(namespacedKey(key));
  try {
    await AsyncStorage.removeItem(namespacedKey(key));
  } catch {
    /* ignore */
  }
}

/** Remove all entries whose namespaced key starts with the given prefix. */
export async function deletePersistentByPrefix(prefix: string): Promise<number> {
  try {
    const all = await AsyncStorage.getAllKeys();
    const ns = namespacedKey(prefix);
    const matched = all.filter((k) => k.startsWith(ns));
    if (matched.length === 0) return 0;
    await AsyncStorage.multiRemove(matched);
    // Also drop pending writes for the same prefix
    for (const k of pendingWrites.keys()) {
      if (k.startsWith(ns)) pendingWrites.delete(k);
    }
    return matched.length;
  } catch {
    return 0;
  }
}

/** Hard wipe — used on logout. */
export async function wipePersistentCache(): Promise<void> {
  try {
    const all = await AsyncStorage.getAllKeys();
    const ours = all.filter((k) => k.startsWith(NAMESPACE));
    if (ours.length > 0) {
      await AsyncStorage.multiRemove(ours);
    }
    pendingWrites.clear();
  } catch {
    /* ignore */
  }
}

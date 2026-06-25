/**
 * Simple in-memory cache with TTL, modeled after the Redis caching
 * strategy in the backend (server/services/listingcache.service.js).
 *
 * Used on the React Native client to avoid redundant API calls for
 * frequently accessed listing data (feed, category listings, detail).
 */

type CacheEntry<T> = {
  data: T;
  timestamp: number;
  ttl: number;
};

const store = new Map<string, CacheEntry<unknown>>();
const MAX_ENTRIES = 200;

// In-flight request map. Prevents duplicate network calls when two screens
// (or a remount) request the same key concurrently.
const inFlight = new Map<string, Promise<unknown>>();

// Subscribers fire whenever a key's value changes. Used by useSwrListing for
// SWR-style background refresh: the screen renders cached data instantly,
// and re-renders when the fresh response arrives.
type Subscriber = () => void;
const subscribers = new Map<string, Set<Subscriber>>();

function notify(key: string) {
  const set = subscribers.get(key);
  if (!set) return;
  for (const s of set) s();
}

export function subscribeCache(key: string, fn: Subscriber): () => void {
  let set = subscribers.get(key);
  if (!set) {
    set = new Set();
    subscribers.set(key, set);
  }
  set.add(fn);
  return () => {
    set?.delete(fn);
    if (set && set.size === 0) subscribers.delete(key);
  };
}

function evictExpired() {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now - entry.timestamp > entry.ttl) {
      store.delete(key);
    }
  }
}

function evictOldest() {
  if (store.size <= MAX_ENTRIES) return;
  // Delete oldest entries until we're under the limit
  const entries = Array.from(store.entries()).sort(
    ([, a], [, b]) => a.timestamp - b.timestamp,
  );
  const toRemove = entries.slice(0, store.size - MAX_ENTRIES + 10);
  for (const [key] of toRemove) {
    store.delete(key);
  }
}

/** Get cached value. Returns undefined if expired or missing. */
export function getCached<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.timestamp > entry.ttl) {
    store.delete(key);
    return undefined;
  }
  return entry.data as T;
}

/** Set a value in cache with a TTL in milliseconds. Notifies subscribers. */
export function setCache<T>(key: string, data: T, ttlMs: number) {
  evictExpired();
  evictOldest();
  store.set(key, { data, timestamp: Date.now(), ttl: ttlMs });
  notify(key);
}

/**
 * Get a value if present, even if expired. Useful for stale-while-revalidate:
 * we want to render stale data instantly while a fresh fetch runs in the
 * background.
 */
export function getCachedStale<T>(key: string): { data: T; isStale: boolean } | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  const isStale = Date.now() - entry.timestamp > entry.ttl;
  return { data: entry.data as T, isStale };
}

/** Invalidate a specific cache key or all keys matching a prefix. */
export function invalidateCache(keyOrPrefix: string) {
  if (store.has(keyOrPrefix)) {
    store.delete(keyOrPrefix);
    notify(keyOrPrefix);
    return;
  }
  // Prefix match
  for (const key of store.keys()) {
    if (key.startsWith(keyOrPrefix)) {
      store.delete(key);
      notify(key);
    }
  }
}

/** Clear all cached data. */
export function clearAllCache() {
  store.clear();
}

/**
 * Wrap an async function with caching. If the cache has a fresh value,
 * return it immediately. Otherwise, call the fetcher, cache the result,
 * and return it.
 */
export async function withCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs = 60_000,
): Promise<T> {
  const cached = getCached<T>(key);
  if (cached !== undefined) return cached;

  // Deduplicate concurrent fetches for the same key.
  const existing = inFlight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const promise = fetcher()
    .then((data) => {
      setCache(key, data, ttlMs);
      return data;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, promise);
  return promise;
}

/**
 * Stale-while-revalidate fetch. Fires the network in the background and
 * pushes results into the cache (which notifies subscribers). Returns the
 * current cache state synchronously so a screen can render instantly.
 *
 * Use with `subscribeCache(key, ...)` for live updates.
 */
export function swrFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs = 60_000,
): { data: T | undefined; isStale: boolean; refresh: () => Promise<T> } {
  const cached = getCachedStale<T>(key);

  const refresh = (): Promise<T> => {
    const existing = inFlight.get(key) as Promise<T> | undefined;
    if (existing) return existing;

    const promise = fetcher()
      .then((data) => {
        setCache(key, data, ttlMs);
        return data;
      })
      .finally(() => {
        inFlight.delete(key);
      });

    inFlight.set(key, promise);
    return promise;
  };

  if (!cached) {
    // No cache yet — kick off network. Subscribers will receive the value
    // once it lands.
    void refresh().catch(() => {});
    return { data: undefined, isStale: false, refresh };
  }

  if (cached.isStale) {
    void refresh().catch(() => {});
  }
  return { data: cached.data, isStale: cached.isStale, refresh };
}

// ── Cache key builders (match backend cache key patterns) ─────────────────────

export const cacheKeys = {
  feed: (page?: number) => `feed:home:${page ?? 1}`,
  categoryList: (slug: string, page?: number) => `list:${slug}:${page ?? 1}`,
  listingDetail: (slug: string, id: string) => `detail:${slug}:${id}`,
  myListings: () => "my-listings",
  savedListings: () => "saved-listings",
  conversations: () => "conversations",
  conversation: (id: string) => `conv:${id}`,
  threadMessages: (threadId: string) => `messages:${threadId}`,
  eventsCalendar: (queryKey: string) => `events:calendar:${queryKey}`,
  eventsUpcoming: (queryKey: string) => `events:upcoming:${queryKey}`,
};

// ── Cross-screen seed bridge ──────────────────────────────────────────────────
// The feed/search already has full ListingItem objects. When the user taps a
// card, we promote that item into the detail cache so the detail screen can
// render instantly. The detail screen then revalidates in the background.
//
// We accept a structurally-typed listing (must have `_id`) to avoid circular
// imports with the listing-api types.

export function seedListingDetail<L extends { _id: string }>(
  categorySlug: string,
  id: string,
  listing: L,
  ttlMs = 120_000,
) {
  const key = cacheKeys.listingDetail(categorySlug, id);
  const existing = getCachedStale<{ listing?: L }>(key);
  if (existing && !existing.isStale) return;
  setCache(key, { success: true, listing }, ttlMs);
}

export function seedListingsBatch<L extends { _id: string }>(
  pairs: Array<{ category: string; listing: L }>,
  ttlMs = 60_000,
) {
  for (const { category, listing } of pairs) {
    if (!listing?._id) continue;
    seedListingDetail(category, listing._id, listing, ttlMs);
  }
}

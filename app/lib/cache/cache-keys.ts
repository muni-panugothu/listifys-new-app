/**
 * Centralized cache key registry.
 *
 * Every cached resource MUST go through this file so we can:
 *   - bump a per-namespace version to instantly invalidate stale entries
 *     after a breaking response shape change
 *   - invalidate a whole family ("listings:*") in O(1) via prefix scan
 *   - keep keys identical across L1 (memory) and L2 (AsyncStorage)
 *
 * Schema:
 *   <family>:v<version>:<scope>
 *   e.g. "feed:v3:home:1:US"
 *
 * Bumping a family version is the canonical way to ship a server change
 * that requires the client to drop old cached responses.
 */

const VERSIONS = {
  feed: 3,
  listing: 4,
  category: 3,
  search: 2,
  seller: 2,
  reviews: 2,
  services: 1,
  saved: 2,
  recentlyViewed: 2,
  conversations: 2,
  notifications: 2,
} as const;

type Family = keyof typeof VERSIONS;

function key(family: Family, ...scope: (string | number | undefined | null)[]) {
  const tail = scope
    .filter((s) => s != null && s !== "")
    .map((s) => String(s))
    .join(":");
  return `${family}:v${VERSIONS[family]}${tail ? `:${tail}` : ""}`;
}

/**
 * Prefix used for invalidation by family. Match L1 + L2 store entries.
 */
export function familyPrefix(family: Family): string {
  return `${family}:v${VERSIONS[family]}`;
}

export const CacheKeys = {
  // Home feed (paged), keyed by page + country
  homeFeed: (page = 1, countryCode?: string | null) =>
    key("feed", "home", page, countryCode?.toUpperCase()),

  // Category list page
  categoryList: (slug: string, page = 1, countryCode?: string | null, sort?: string) =>
    key("category", slug, page, sort, countryCode?.toUpperCase()),

  // Listing detail (per category + id)
  listingDetail: (slug: string, id: string) => key("listing", slug, id),

  // Search results
  search: (qHash: string, page = 1, countryCode?: string | null) =>
    key("search", qHash, page, countryCode?.toUpperCase()),

  // Service hub
  servicesHub: (sub: string, sort?: string, countryCode?: string | null) =>
    key("services", sub || "all", sort, countryCode?.toUpperCase()),

  // Reviews for a listing
  serviceReviews: (listingId: string) => key("reviews", "service", listingId),
  sellerReviews: (sellerId: string) => key("reviews", "seller", sellerId),

  // Seller public profile
  sellerProfile: (sellerId: string) => key("seller", sellerId),

  // User scopes
  savedListings: () => key("saved", "me"),
  recentlyViewed: () => key("recentlyViewed", "me"),
  conversations: () => key("conversations", "me"),
  notifications: () => key("notifications", "me"),
} as const;

/** List of all family prefixes — used by sign-out / cache wipes. */
export const ALL_FAMILY_PREFIXES = (Object.keys(VERSIONS) as Family[]).map(familyPrefix);

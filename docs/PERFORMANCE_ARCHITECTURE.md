# Enterprise Performance Architecture

Production performance playbook for Listify, scoped to the actual stack:

- **Client**: Expo / React Native 0.81, expo-router, Redux Toolkit, AsyncStorage, expo-image
- **Backend**: Node + Express, MongoDB, Upstash Redis, Elasticsearch, RabbitMQ, S3
- **Targets**: 10M+ users · 1M DAU · 100K concurrent · 100M req/day

The targets below are perceived, not network. We win by never letting the
network sit on the critical render path.

| Surface          | Target P95 (perceived) | Mechanism                                    |
| ---------------- | ---------------------- | -------------------------------------------- |
| Navigation       | < 100 ms               | Synchronous push + L1 cache + intent prefetch|
| Feed open        | < 150 ms               | SWR from L1/L2, revalidate in background     |
| Product page     | < 100 ms               | Skeleton in 0 ms, cached body in 20 ms       |
| Search           | < 100 ms (each keystroke) | Debounce + L1 result cache + ES warm queries |
| API P95          | < 200 ms               | Redis SWR + Mongo indexes + connection pool  |
| Cache hit rate   | > 95%                  | L1+L2+L3 tiered cache + tag invalidation     |
| Scroll FPS       | 60+                    | Reanimated worklets + image priority + windowSize |

---

## 1. Topology

```text
                          ┌────────────────────────────┐
                          │       Mobile Clients       │
                          │  (Expo / React Native)     │
                          └──────────┬─────────────────┘
                                     │ HTTPS / WSS
                                     ▼
                          ┌────────────────────────────┐
                          │       CDN Edge (Image)     │
                          │   S3 + CloudFront /        │
                          │   Cloudflare Images        │
                          └──────────┬─────────────────┘
                                     │
                  ┌──────────────────┼──────────────────┐
                  ▼                  ▼                  ▼
        ┌─────────────────┐ ┌────────────────┐ ┌──────────────────┐
        │  API Gateway /  │ │   Socket.IO    │ │  Push (FCM /     │
        │   Express ALB   │ │  Realtime      │ │   APNs / Notifee)│
        └────────┬────────┘ └───────┬────────┘ └────────┬─────────┘
                 │                  │                   │
        ┌────────▼─────────────────▼───────────────────▼───────────┐
        │            Node Workers (PM2 / Cluster, N≥cpu)            │
        │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
        │  │ Auth         │  │ Listings     │  │ Search Hub   │    │
        │  │ Controller   │  │ Controller   │  │ (ES proxy)   │    │
        │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘    │
        └─────────┼─────────────────┼─────────────────┼────────────┘
                  │                 │                 │
                  ▼                 ▼                 ▼
        ┌────────────────────────────────────────────────────────┐
        │  L3 Cache: Upstash Redis (cache-aside + SWR + tags)    │
        └─────────────────┬────────────────────┬─────────────────┘
                          │                    │
                ┌─────────▼─────────┐ ┌────────▼──────────┐
                │   MongoDB Atlas   │ │  Elasticsearch    │
                │  (primary + RS)   │ │   (search)        │
                └───────────────────┘ └───────────────────┘
                          │
                ┌─────────▼─────────┐
                │   RabbitMQ        │
                │  (workers, bg     │
                │   feed rebuild,   │
                │   indexing, ML)   │
                └───────────────────┘
```

---

## 2. Multi-Layer Cache (L1–L5)

```text
┌───────────────────────────────────────────────────────┐
│ L1  In-memory (Map)         app/lib/cache/tiered-cache│  ≤1 ms
├───────────────────────────────────────────────────────┤
│ L2  AsyncStorage (disk)     app/lib/cache/persistent  │  5–20 ms
├───────────────────────────────────────────────────────┤
│ L3  Upstash Redis           server/services/cache     │  20–60 ms
├───────────────────────────────────────────────────────┤
│ L4  CDN Edge (images)       CloudFront / Cloudflare   │  20–100 ms
├───────────────────────────────────────────────────────┤
│ L5  Mongo / ES query cache  Indexes + agg + replica   │  20–80 ms
└───────────────────────────────────────────────────────┘
```

### 2.1 Tier ownership

| Layer | Owner                  | Source of truth | TTL strategy       |
| ----- | ---------------------- | --------------- | ------------------ |
| L1    | Client process memory  | derived         | Soft 30–60s        |
| L2    | Client AsyncStorage    | derived         | Soft 5m, hard 14d  |
| L3    | Upstash Redis          | derived         | Soft 60s, hard 10m |
| L4    | CDN edge cache         | S3 object       | 1–30 days (immut.) |
| L5    | Mongo working set / RS | authoritative   | n/a                |

### 2.2 Read path (client)

```ts
import { swrGet } from "@/lib/cache/tiered-cache";
import { CacheKeys } from "@/lib/cache/cache-keys";

const { data, source } = await swrGet(
  CacheKeys.homeFeed(1, "US"),
  () => fetchHomeFeed({ page: 1 }),
  { ttlMs: 30_000, maxAgeMs: 7 * 24 * 60 * 60 * 1000 },
);
// `source` ∈ memory-fresh | memory-stale | disk-fresh | disk-stale | network
```

Flow: L1 → L2 → network. SWR always returns the cached value first and
revalidates in the background.

### 2.3 Read path (server)

```js
const cacheService = require('../services/cache.service');

const feed = await cacheService.swr({
  key: `feed:v3:home:${userId}:${countryCode}`,
  softTtl: 60,          // SWR window
  hardTtl: 600,         // Redis eviction
  tags: ['feed', `user:${userId}`],
  loader: () => buildHomeFeedFromMongo(userId, countryCode),
});
```

### 2.4 Write path & invalidation

| Mutation                       | Action                                                                 |
| ------------------------------ | ---------------------------------------------------------------------- |
| User creates listing           | `invalidateByTag('feed')`, `invalidateByTag(\`user:${ownerId}\`)`     |
| Seller edits product           | `invalidateByTag(\`listing:${id}\`)`, `invalidateByTag('feed')`        |
| Review posted                  | `invalidateByTag(\`reviews:${listingId}\`)`                            |
| User signs out                 | client: `clearAllCaches()`                                             |
| Schema-breaking server change  | bump `VERSIONS.feed` in `cache-keys.ts` → all clients drop old values  |

### 2.5 Cache versioning

`app/lib/cache/cache-keys.ts` holds per-family integers. Bumping
`VERSIONS.feed` from `3` to `4` means every cache key changes, so
clients with stale on-disk data simply miss L2 and refetch — no manual
purge needed.

### 2.6 Cache warming

Use the background sync controller (`app/lib/background-sync.ts`) to
warm the L1 cache for the next probable screen as soon as the user
foregrounds the app:

```ts
import { initBackgroundSync, registerSyncTask } from "@/lib/background-sync";

initBackgroundSync();

registerSyncTask({
  key: 'feed:home',
  minIntervalMs: 60_000,
  run: () => fetchHomeFeed({ page: 1 }),
});
registerSyncTask({
  key: 'notifications',
  minIntervalMs: 30_000,
  run: () => fetchUnreadCount(),
});
```

---

## 3. Predictive Prefetching

Three trigger surfaces map to the four queue priorities:

```text
priority 1  "intent"    onPressIn / long-press   →  detail screen
priority 2  "visible"   onViewableItemsChanged   →  list cards
priority 3  "scroll"    onScroll ≥ 70%           →  next page
priority 4  "idle"      AppState 'active' + 1.5s →  side panels
```

### 3.1 Intent prefetch on card press

```tsx
import { useIntentPrefetch } from "@/lib/prefetch/use-predictive-prefetch";
import { CacheKeys } from "@/lib/cache/cache-keys";
import { swrGet } from "@/lib/cache/tiered-cache";

function ListingCard({ item }) {
  const intent = useIntentPrefetch();
  const onPressIn = () =>
    intent(CacheKeys.listingDetail(item.category, item._id), () =>
      swrGet(
        CacheKeys.listingDetail(item.category, item._id),
        () => fetchListingDetail(item.category, item._id),
        { ttlMs: 60_000 },
      ),
    );
  return <SafePressable onPressIn={onPressIn} onPress={openDetail}>...</SafePressable>;
}
```

The detail screen reads the same key and renders instantly because the
prefetch already filled L1.

### 3.2 Viewable items prefetch (FlatList)

```tsx
const visibility = useVisibilityPrefetch();

<FlatList
  onViewableItemsChanged={({ viewableItems }) =>
    visibility(
      viewableItems.map((v) => ({
        key: CacheKeys.listingDetail(v.item.category, v.item._id),
        run: () =>
          swrGet(
            CacheKeys.listingDetail(v.item.category, v.item._id),
            () => fetchListingDetail(v.item.category, v.item._id),
            { ttlMs: 60_000 },
          ),
      })),
    )
  }
  viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
/>
```

### 3.3 Pagination prefetch

```tsx
const onScroll = useScrollPagePrefetch({
  key: `feed:next:${page + 1}`,
  loadNextPage: () => loadFeed(page + 1),
  thresholdPct: 0.7,
});

<FlatList onScroll={onScroll} scrollEventThrottle={64} ... />
```

### 3.4 Bandwidth & battery awareness

The queue already inspects NetInfo and reduces concurrency to 1 on 2G
and 2 on 3G. To extend this to Save-Data / Low Power Mode:

```ts
// In prefetch-queue.ts, after the NetInfo listener:
if (NativeModules.PowerManager?.isLowPowerMode?.()) maxConcurrency = 1;
```

---

## 4. Redis (L3) Architecture

We run Upstash, which is HTTP-fronted Redis. The "cluster" abstraction
is internal — for our purposes the relevant primitives are:

- **Replication / failover**: Upstash global handles this.
- **Sharding**: per-region Upstash DBs, sticky-routed by user region.
- **Multi-region read replicas**: use Upstash Global database for
  high-traffic keys (feed, recommendations).
- **Eviction**: `allkeys-lru` is the platform default; we never store
  authoritative data there.

### 4.1 Key namespaces

```text
feed:v3:home:{userId}                          # personalized feed page
feed:v3:trending:{countryCode}                 # public trending
feed:v3:nearby:{geohash5}                      # nearby (geohash, prefix 5)
feed:v3:discovery:{cohort}                     # discovery cohorts

listing:v4:{slug}:{id}                         # full detail
listing:v4:{slug}:{id}:images                  # CDN image array
listing:v4:{slug}:{id}:reviews                 # paginated reviews

seller:v2:{sellerId}                           # public profile
seller:v2:{sellerId}:listings                  # seller's products

search:v2:{queryHash}:{page}:{countryCode}     # ES result hydrated
search:v2:suggestions:{prefix}                 # autocomplete

recommendations:v1:{userId}                    # personalised recs

tag:feed                                       # SET of keys tagged "feed"
tag:user:{userId}                              # SET of keys tagged user
__cmeta__:<key>                                # envelope (stored time, soft ttl)
lock:<key>                                     # single-flight rebuild lock
```

### 4.2 TTL strategy

```text
softTtl  =  natural refresh interval         (e.g. 60s for feed)
hardTtl  =  ~10x softTtl, capped at 10–30m   (Redis eviction)
jitter   =  ±15% on every set                (avoids thundering herd)
```

Stale-while-revalidate is enforced by `cache.service.js`:

1. Read key + envelope.
2. If envelope says `age > softTtl` → serve old value AND fire a
   background loader under `lock:<key>`. Only one worker holds the
   lock so origin sees `O(1)` rebuilds.
3. If key missing → acquire lock + load + write. Other workers poll
   the lock for 500 ms before falling back to a direct load.

### 4.3 Tag-based invalidation

When a mutation touches a seller, we don't enumerate keys — we just:

```js
await cacheService.invalidateByTag(`user:${sellerId}`);
await cacheService.invalidateByTag('feed');
```

Each `set()` adds the key to all named tag sets, so invalidation is
`SMEMBERS` + `DEL` — O(N) in the touched keys only.

---

## 5. CDN Architecture (images)

```text
Client ─► CloudFront / Cloudflare ─► S3 (origin)
            │
            ├─ /thumb/{id}_{w}.webp      (thumbnail, 30d cache)
            ├─ /card/{id}_{w}.webp       (card image, 30d cache)
            └─ /full/{id}_{w}.webp       (detail, 30d cache)
```

Rules:

1. **Immutable URLs**: every upload gets a content hash. New uploads
   produce a new URL — no purges needed.
2. **WebP/AVIF**: server-side encode at upload time, store all three
   resolutions (`thumb 144`, `card 480`, `full 1080`) once.
3. **Cache headers**: `Cache-Control: public, max-age=2592000, immutable`.
4. **Client image policy**: `<Image cachePolicy="memory-disk" priority="high" />`
   for above-the-fold, `priority="low"` for below.
5. **Blur placeholder**: encode a 4-byte BlurHash at upload, ship in
   listing payload. RN displays it before the network image arrives.

---

## 6. Cache-Aside Pattern (canonical)

### Client read

```ts
// 1. memory
const mem = memoryRead(key);
if (mem && !mem.stale) return mem.data;

// 2. disk
const disk = await readPersistent(key);
if (disk.hit) {
  memoryWrite(key, disk.data, ttl);
  if (disk.stale) revalidateBg();
  return disk.data;
}

// 3. network
const data = await fetch();
memoryWrite(key, data, ttl);
writePersistent(key, data, { ttlMs });
return data;
```

### Server write (mutation)

```js
// 1. authoritative write
const updated = await Listing.findByIdAndUpdate(id, patch, { new: true });

// 2. invalidate caches
await cacheService.invalidateByTag(`listing:${id}`);
await cacheService.invalidateByTag(`user:${updated.userId}`);
await cacheService.invalidateByTag('feed');

// 3. fan out via RabbitMQ for downstream consumers (search index, recs)
await rabbit.publish('listings.updated', { id, fields: Object.keys(patch) });

// 4. ack
res.json({ success: true, data: updated });
```

---

## 7. Real-Time Feed Engine

Feeds are **precomputed**, not built per request. A request only does
key lookups.

### 7.1 Feed flavors

```text
Personalized  feed:v3:home:{userId}             — rebuilt every 5 min by worker
Trending      feed:v3:trending:{country}        — rebuilt every 60s
Fresh         feed:v3:fresh:{country}           — rebuilt every 30s
Nearby        feed:v3:nearby:{geohash5}         — rebuilt every 2 min
Discovery     feed:v3:discovery:{cohort}        — rebuilt every 15 min
```

### 7.2 Builder (RabbitMQ worker)

```js
// server/queues/consumers/feed-builder.consumer.js (sketch)
rabbit.consume('feed.rebuild', async ({ userId, scope }) => {
  const scored = await scoreCandidates(userId);  // Mongo agg + ML lookup
  const page = scored.slice(0, 60);
  await cacheService.set(
    `feed:v3:${scope}:${userId}`,
    page,
    { softTtl: 60, hardTtl: 900, tags: ['feed', `user:${userId}`] },
  );
});
```

Trigger rebuild:

- on listing create / update / delete (event-driven)
- on user follow / save (lazy, debounced 30s)
- on cron every 5 min for active users

### 7.3 Read path

The HTTP handler is dumb on purpose:

```js
router.get('/feeds/home', async (req, res) => {
  const key = `feed:v3:home:${req.user.id}:${req.country}`;
  const data = await cacheService.swr({
    key,
    softTtl: 60,
    hardTtl: 900,
    tags: ['feed', `user:${req.user.id}`],
    loader: () => buildHomeFeed(req.user.id, req.country),
  });
  res.json({ success: true, data });
});
```

---

## 8. Search

### 8.1 Client

```ts
// 250ms debounce + 100ms throttle inside the search bar
const debounced = useDebouncedValue(query, 250);

const { data, isFetching } = useSwrQuery({
  key: CacheKeys.search(hash(debounced), page, country),
  fetcher: () => searchApi(debounced, { page }),
  ttlMs: 30_000,
  enabled: debounced.length >= 2,
});

// Show recents/trending while query is empty — load them once at boot
```

### 8.2 Server

```js
router.get('/search', async (req, res) => {
  const key = `search:v2:${cacheService.fingerprint({ q, filters, page })}`;
  const result = await cacheService.swr({
    key,
    softTtl: 30,
    hardTtl: 300,
    tags: ['search'],
    loader: async () => {
      const hits = await es.search({ ... });
      return hydrateListings(hits.body.hits.hits);
    },
  });
  res.json({ success: true, data: result });
});
```

Common-prefix autocompletes are precomputed nightly into:
```text
search:v2:suggestions:{prefix}  →  ["nanny", "nanny job", ...]
```

---

## 9. Navigation Optimization

Already in place (`app/lib/safe-router.ts`, `navigation-guard.ts`,
`use-safe-press.ts`). Production rules:

- **Never await** in a press handler before `router.push`. Move the
  await into the next screen.
- **Skeleton first**: screens render a skeleton in their first paint,
  then `useSwrQuery` resolves either from L1 (zero-network) or fires
  a revalidate.
- **Intent prefetch** fires on `onPressIn` so the data is already in
  L1 by the time the new screen mounts.
- **Back navigation** is free — never refetch on back. Screens read
  from cache and only revalidate via SWR.

---

## 10. Instant Product Opening (Amazon-style)

```text
T+  0 ms   User taps card
T+  0 ms   safe-router.push() ─► screen mounts with skeleton
T+ 20 ms   useSwrQuery reads L1 (filled by intent prefetch onPressIn)
T+ 20 ms   Above-the-fold renders with cached title, hero image, price
T+ 50 ms   Background revalidate fires for fresh stats
T+150 ms   Reviews + recommendations resolve from prefetched L1
T+300 ms   Stale-revalidated payload updates UI seamlessly (no flash)
```

Implementation skeleton:

```tsx
function ProductScreen({ slug, id }) {
  const { data, source, isFetching } = useSwrQuery({
    key: CacheKeys.listingDetail(slug, id),
    fetcher: () => fetchListingDetail(slug, id),
    ttlMs: 60_000,
  });
  if (!data) return <ProductSkeleton />;   // ~5 ms first paint
  return <ProductView data={data} refreshing={isFetching} />;
}
```

---

## 11. Background Sync

`app/lib/background-sync.ts` runs on:

- foreground after >30s background
- network reconnect
- idle (1.5s after mount)

Recommended task set:

```ts
registerSyncTask({ key: 'feed:home', minIntervalMs: 60_000, run: refetchHomeFeed });
registerSyncTask({ key: 'notifications', minIntervalMs: 30_000, run: refetchUnread });
registerSyncTask({ key: 'conversations', minIntervalMs: 60_000, run: refetchConversations });
registerSyncTask({ key: 'saved', minIntervalMs: 300_000, run: refetchSaved });
registerSyncTask({ key: 'recs', minIntervalMs: 600_000, run: refetchRecs });
```

Each task respects the global navigation lock so syncs never collide
with active navigation.

---

## 12. Database (MongoDB)

The architecture asked for PostgreSQL but the repo runs Mongo. The same
rules apply:

### Indexes (already declared in models — verify in Atlas)

```js
// Listings
{ category: 1, status: 1, createdAt: -1 }                  // category list
{ countryCode: 1, status: 1, createdAt: -1 }               // country feed
{ userId: 1, status: 1, createdAt: -1 }                    // seller listings
{ "location.coordinates": "2dsphere" }                     // nearby
{ price: 1, category: 1 }                                  // price filters
{ title: "text", description: "text" }                     // fulltext fallback
```

### Aggregation hygiene

- Always `$match` before `$lookup` and `$sort`.
- Cap `$lookup` results with `$limit` inside the sub-pipeline.
- Use `$project` to strip large fields (description, gallery) before
  shipping to ES / cache.

### Connection pool

```env
MONGO_POOL_SIZE=50      # per worker; sized for ~8 worker cluster
MONGO_TIMEOUT_MS=10000
MONGO_READ_PREFERENCE=secondaryPreferred  # for non-critical reads
```

### Materialized "views" (precomputed collections)

- `feed_home_personal` — built by RabbitMQ worker every 5 min.
- `seller_aggregates` — review count + avg rating, rebuilt nightly.

---

## 13. Event-Driven Architecture

Use the existing RabbitMQ topology. Add the following exchanges:

```text
exchange: listings (topic)
  binding: listings.created       → search-indexer, feed-builder
  binding: listings.updated.*     → search-indexer, feed-builder, image-resizer
  binding: listings.deleted       → search-indexer, feed-builder

exchange: users (topic)
  binding: users.followed         → feed-builder, notification
  binding: users.saved            → recs-trainer

exchange: search (topic)
  binding: search.performed       → analytics, recs-trainer

exchange: cache (fanout)
  binding: cache.invalidate       → all workers (in-memory L1 invalidate)
```

Pattern: every controller emits domain events; consumers do the slow
work (ES indexing, feed precompute, notifications). The HTTP handler
returns in < 50ms because all heavy work is deferred.

---

## 14. Observability

We're already producing structured logs. The next layer:

```text
OpenTelemetry SDK ─► OTel Collector ─► Tempo (traces)
                                    ─► Prometheus (metrics)
                                    ─► Loki (logs)

Client crashes / soft errors ─► Sentry (RN)
```

Required spans / metrics:

- Server: `req.duration`, `cache.hit`, `cache.miss`, `cache.stale`,
  `mongo.duration`, `es.duration`, `rabbit.publish.duration`.
- Client: `nav.duration` (from `onPress` to first paint of next
  screen), `swr.source.{memory,disk,network}`, `image.first-byte`,
  `image.first-frame`, scroll FPS (Reanimated profiling hooks).
- Dashboards: per-route P50/P95/P99, cache hit % by family,
  prefetch queue depth, RabbitMQ backlog, Mongo slow queries.

Alerting thresholds:

| Signal                      | Page  | Warn  |
| --------------------------- | ----- | ----- |
| API P95                     | 500ms | 300ms |
| Cache hit % (feed family)   | <80%  | <90%  |
| RabbitMQ backlog            | 5k    | 1k    |
| Mongo slow query rate       | 5/s   | 1/s   |
| Client `nav.duration` P95   | 250ms | 150ms |

---

## 15. Production Targets — How Each Is Hit

| Target              | Hit by                                                  |
| ------------------- | ------------------------------------------------------- |
| Nav < 100 ms        | safe-router (no async in handler) + intent prefetch     |
| Feed < 150 ms       | SWR returns L1, revalidate in background                |
| Product < 100 ms    | Skeleton + onPressIn intent prefetch fills L1           |
| Search < 100 ms     | 250ms debounce + L1 result cache + ES warm queries      |
| API P95 < 200 ms    | Redis SWR (95% hit) + indexed Mongo reads + RabbitMQ    |
| Cache hit > 95%     | Tag invalidation (no nuclear flushes) + cache warming   |
| FPS 60+             | expo-image cache, FlatList windowSize, Reanimated worklets |

---

## 16. Integration Checklist

1. **Wire `initBackgroundSync()`** in `app/app/_layout.tsx` (after auth
   bootstrap). Register tasks for home feed, notifications, conversations.
2. **Replace direct `fetch + setState` patterns** in:
   - `home-feed-root-screen.tsx`
   - `listing-detail-template-screen.tsx`
   - `service-detail-screen.tsx`
   - `services-category-hub-screen.tsx`
   - `search` screens
   with `useSwrQuery({ key: CacheKeys.X, fetcher, ttlMs })`.
3. **Add `onPressIn={intentPrefetch}`** to card components:
   - `ListingItemsGridCard`
   - `ServiceProviderListCard`
   - search result cards
4. **Server**: wrap heavy read controllers (`feeds`, `listings/:id`,
   `search`, `seller/:id`) in `cacheService.swr({...})`.
5. **Server**: on every write controller, call
   `cacheService.invalidateByTag(...)` for the touched tags.
6. **Image uploads**: ensure server emits 3 variants (thumb/card/full)
   with hashed URLs + `Cache-Control: immutable`.
7. **Observability**: add `cache_hit` / `cache_miss` Prometheus
   counters in `cache.service.js` (already emitting stats — wire them
   to a metrics route).
8. **Logout flow**: call `clearAllCaches()` from `app/lib/cache/tiered-cache.ts`
   to wipe L1+L2.

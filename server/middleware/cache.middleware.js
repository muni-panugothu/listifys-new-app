/**
 * Redis Cache Middleware & Utilities
 *
 * - Automatic response caching for GET endpoints
 * - ETag-based conditional requests (304 Not Modified)
 * - Cache invalidation on write operations
 * - Stale-while-revalidate support
 * - Per-entity & per-list cache keys
 */
const crypto = require('crypto');
const redis = require('../config/redis');
const { logger } = require('../utils/logger');
const { responseCache } = require('../services/memorycache.service.js');

// ══════════════════════════════════════════════════════════
//  Cache key builders
// ══════════════════════════════════════════════════════════

// Whitelist of known query parameters to prevent cache key poisoning
const ALLOWED_QUERY_KEYS = new Set([
  'page', 'limit', 'search', 'sort', 'category', 'subcategory', 'condition',
  'minPrice', 'maxPrice', 'lat', 'lng', 'radius', 'location', 'gender',
  'type', 'status', 'featured', 'slug', 'id', 'year', 'brand', 'model',
  'propertyType', 'bedrooms', 'bathrooms', 'furnished', 'listingType',
  'serviceType', 'availability', 'rating', 'priceRange', 'skill',
  'countryCode', 'activeOnly', 'city',
  'date', 'days',
]);

const buildListKey = (entity, query = {}) => {
  const sorted = Object.keys(query)
    .sort()
    .filter((k) => ALLOWED_QUERY_KEYS.has(k) && query[k] !== undefined && query[k] !== '')
    .map((k) => `${k}=${query[k]}`)
    .join('&');
  return `cache:${entity}:list:${sorted || 'all'}`;
};

const buildDetailKey = (entity, id) => `cache:${entity}:detail:${id}`;

const buildPatternKey = (entity) => `cache:${entity}:*`;

// ══════════════════════════════════════════════════════════
//  Cache middleware factory
// ══════════════════════════════════════════════════════════

/**
 * Caches GET responses in Redis.
 *
 * @param {string} entity       – e.g. "electronics", "vehicles"
 * @param {number} ttlSeconds   – cache TTL (default 120s = 2 min)
 * @param {string} type         – "list" | "detail"
 */
const cacheResponse = (entity, ttlSeconds = 120, type = 'list') => {
  return async (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET') return next();

    try {
      const cacheKey =
        type === 'detail'
          ? buildDetailKey(entity, req.params.id)
          : buildListKey(entity, req.query);

      const cached = await redis.get(cacheKey);

      if (cached) {
        const raw = typeof cached === 'string' ? cached : JSON.stringify(cached);
        const data = typeof cached === 'string' ? JSON.parse(cached) : cached;

        const etag = `"${crypto.createHash('md5').update(raw).digest('hex')}"`;

        if (req.headers['if-none-match'] === etag) {
          res.setHeader('X-Cache', 'HIT');
          res.setHeader('ETag', etag);
          return res.status(304).end();
        }

        res.setHeader('X-Cache', 'HIT');
        res.setHeader('ETag', etag);
        return res.status(200).json(data);
      }

      // Cache MISS — intercept res.json to store the response
      res.setHeader('X-Cache', 'MISS');
      const originalJson = res.json.bind(res);

      res.json = (body) => {
        res.json = originalJson; // Restore immediately to prevent double-cache
        // Only cache successful responses
        if (res.statusCode >= 200 && res.statusCode < 300 && body?.success) {
          const bodyStr = JSON.stringify(body);
          const etag = `"${crypto.createHash('md5').update(bodyStr).digest('hex')}"`;
          res.setHeader('ETag', etag);

          redis
            .setex(cacheKey, ttlSeconds, bodyStr)
            .catch((err) => logger.error('Cache write error:', err.message));
        }
        return originalJson(body);
      };

      next();
    } catch (error) {
      logger.error('Cache middleware error — bypassing:', error.message);
      next();
    }
  };
};

// ══════════════════════════════════════════════════════════
//  Cache invalidation helpers
// ══════════════════════════════════════════════════════════

/**
 * Invalidates response caches for an entity after a write operation.
 *
 * Strategy:
 *  - If `id` is provided, delete that specific detail cache.
 *  - Always clear list/search response caches so fresh data is served.
 *  - Do NOT delete other listings' detail caches — they are still valid.
 *  - Activity-log keys (posted:, edited:, etc.) are never touched.
 */
const invalidateEntityCache = async (entity, id = null) => {
  try {
    // 0. Clear L1 memory cache for this entity
    responseCache.delByPrefix(`cache:${entity}:`);

    // 1. Delete the specific detail response cache if id provided
    if (id) {
      await redis.del(buildDetailKey(entity, id));
    }

    // 2. Only clear LIST response caches, keep other detail caches alive
    const indexKey = `cache:${entity}:index`;
    const keys = await redis.smembers(indexKey);

    if (keys && keys.length > 0) {
      const listKeys = keys.filter(k => k.includes(':list:'));
      if (listKeys.length > 0) {
        await Promise.all([
          ...listKeys.map(key => redis.del(key)),
          ...listKeys.map(key => redis.srem(indexKey, key)),
        ]);
      }
    }

    // 3. Also clear the common "all" key
    await redis.del(`cache:${entity}:list:all`);

    logger.info(`[Cache] Response cache invalidated for ${entity}${id ? `:${id}` : ''} (list caches cleared)`);
  } catch (error) {
    logger.error('Cache invalidation error:', error.message);
  }
};

/**
 * Enhanced cacheResponse that also tracks keys in a set for bulk invalidation.
 */
const cacheResponseTracked = (entity, ttlSeconds = 120, type = 'list') => {
  return async (req, res, next) => {
    if (req.method !== 'GET') return next();

    try {
      const cacheKey =
        type === 'detail'
          ? buildDetailKey(entity, req.params.id)
          : buildListKey(entity, req.query);

      // ── L1: Check in-memory cache first (sub-millisecond) ──
      const memCached = responseCache.get(cacheKey);
      if (memCached) {
        const etag = memCached.etag;
        if (req.headers['if-none-match'] === etag) {
          res.setHeader('X-Cache', 'HIT');
          res.setHeader('X-Cache-Layer', 'L1-memory');
          res.setHeader('ETag', etag);
          return res.status(304).end();
        }
        res.setHeader('X-Cache', 'HIT');
        res.setHeader('X-Cache-Layer', 'L1-memory');
        res.setHeader('ETag', etag);
        return res.status(200).json(memCached.data);
      }

      // ── L2: Check Upstash Redis ──
      const cached = await redis.get(cacheKey);

      if (cached) {
        const raw = typeof cached === 'string' ? cached : JSON.stringify(cached);
        const data = typeof cached === 'string' ? JSON.parse(cached) : cached;

        // Generate ETag from cached content
        const etag = `"${crypto.createHash('md5').update(raw).digest('hex')}"`;

        // Promote to L1 memory cache (half the Redis TTL)
        responseCache.set(cacheKey, { data, etag }, Math.floor(ttlSeconds / 2));

        // 304 Not Modified — client already has this version
        if (req.headers['if-none-match'] === etag) {
          res.setHeader('X-Cache', 'HIT');
          res.setHeader('X-Cache-Layer', 'L2-redis');
          res.setHeader('ETag', etag);
          return res.status(304).end();
        }

        res.setHeader('X-Cache', 'HIT');
        res.setHeader('X-Cache-Layer', 'L2-redis');
        res.setHeader('ETag', etag);
        return res.status(200).json(data);
      }

      res.setHeader('X-Cache', 'MISS');
      const originalJson = res.json.bind(res);

      res.json = (body) => {
        res.json = originalJson; // Restore immediately
        if (res.statusCode >= 200 && res.statusCode < 300 && body?.success) {
          const bodyStr = JSON.stringify(body);
          const etag = `"${crypto.createHash('md5').update(bodyStr).digest('hex')}"`;
          res.setHeader('ETag', etag);

          // Write to L1 memory cache
          responseCache.set(cacheKey, { data: body, etag }, Math.floor(ttlSeconds / 2));

          // Write to L2 Redis
          const indexKey = `cache:${entity}:index`;
          Promise.all([
            redis.setex(cacheKey, ttlSeconds, bodyStr),
            redis.sadd(indexKey, cacheKey),
            redis.expire(indexKey, ttlSeconds + 60),
          ]).catch((err) => logger.error('Cache write error:', err.message));
        }
        return originalJson(body);
      };

      next();
    } catch (error) {
      logger.error('Cache middleware error — bypassing:', error.message);
      next();
    }
  };
};

/**
 * Middleware that invalidates cache after a write operation succeeds.
 * Use as: router.post("/", protect, invalidateAfter("electronics"), createElectronics)
 */
const invalidateAfter = (entity) => {
  return (req, res, next) => {
    const originalJson = res.json.bind(res);

    res.json = (body) => {
      res.json = originalJson; // Restore immediately
      if (res.statusCode >= 200 && res.statusCode < 300 && body?.success) {
        // Invalidate asynchronously — don't block response
        const id = req.params?.id || body?.listing?._id || body?.data?._id;
        invalidateEntityCache(entity, id).catch(() => {});
      }
      return originalJson(body);
    };

    next();
  };
};

module.exports = {
  buildListKey,
  buildDetailKey,
  cacheResponse,
  cacheResponseTracked,
  invalidateEntityCache,
  invalidateAfter,
};

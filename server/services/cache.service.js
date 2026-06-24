/**
 * Generic Redis cache-aside + stale-while-revalidate helper.
 *
 * Use this from any controller that needs to wrap a slow DB/ES read with
 * caching. Provides:
 *   - cache-aside read with soft+hard TTL
 *   - jitter so TTLs don't synchronize and stampede
 *   - single-flight lock per key (anti-stampede)
 *   - background revalidation when entry is "soft expired"
 *   - tag-based invalidation (one entity touching many keys at once)
 *   - hit/miss/stale telemetry
 *
 * Conventions:
 *   - Keys MUST be namespaced: `feed:v3:home:{userId}`
 *   - Values are JSON-stringified
 *   - Tags are short strings: `["feed", "user:abc"]`
 *
 * Usage:
 *   const data = await cacheService.swr({
 *     key: `feed:v3:home:${userId}:${countryCode}`,
 *     softTtl: 60,
 *     hardTtl: 600,
 *     tags: ['feed', `user:${userId}`],
 *     loader: () => buildHomeFeed(userId),
 *   });
 */

const crypto = require('crypto');
const redis = require('../config/redis');
const { logger } = require('../utils/logger');

const META_PREFIX = '__cmeta__:';
const TAG_PREFIX = 'tag:';
const LOCK_PREFIX = 'lock:';
const STATS_KEY = 'cache:stats';

function jitter(seconds, pct = 0.15) {
  const delta = Math.floor(seconds * pct);
  return seconds + Math.floor(Math.random() * (delta * 2)) - delta;
}

function hashKey(key) {
  return crypto.createHash('sha1').update(key).digest('hex').slice(0, 12);
}

async function bumpStats(field) {
  try {
    await redis.hset(STATS_KEY, { [field]: Date.now() });
    await redis.incr(`${STATS_KEY}:${field}:count`);
  } catch {
    /* stats are best-effort */
  }
}

async function readEnvelope(key) {
  try {
    const raw = await redis.get(key);
    if (!raw) return null;
    const meta = await redis.get(META_PREFIX + key);
    let storedAt = 0;
    let softTtl = 0;
    if (meta) {
      const parsed = typeof meta === 'string' ? JSON.parse(meta) : meta;
      storedAt = Number(parsed.t) || 0;
      softTtl = Number(parsed.s) || 0;
    }
    const data = typeof raw === 'string' ? safeJsonParse(raw) : raw;
    const ageMs = storedAt ? Date.now() - storedAt : 0;
    const stale = softTtl > 0 ? ageMs > softTtl * 1000 : false;
    return { data, stale, storedAt };
  } catch (err) {
    logger.warn('cache.service read failed', { key, err: err.message });
    return null;
  }
}

function safeJsonParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

async function writeEnvelope(key, data, { softTtl, hardTtl, tags }) {
  const softJ = jitter(softTtl);
  const hardJ = Math.max(softJ + 30, jitter(hardTtl));
  try {
    await redis.set(key, JSON.stringify(data), { ex: hardJ });
    await redis.set(
      META_PREFIX + key,
      JSON.stringify({ t: Date.now(), s: softJ }),
      { ex: hardJ },
    );
    if (Array.isArray(tags) && tags.length) {
      for (const tag of tags) {
        await redis.sadd(TAG_PREFIX + tag, key);
        // Tag sets never expire automatically — bound them by also setting
        // an expiration matching the longest cached entry under the tag.
        await redis.expire(TAG_PREFIX + tag, hardJ * 2);
      }
    }
  } catch (err) {
    logger.warn('cache.service write failed', { key, err: err.message });
  }
}

async function acquireLock(key, ttlSeconds = 5) {
  const lockKey = LOCK_PREFIX + key;
  try {
    const ok = await redis.set(lockKey, '1', { ex: ttlSeconds, nx: true });
    return ok === 'OK' || ok === true || ok === 1;
  } catch {
    return false;
  }
}

async function releaseLock(key) {
  try {
    await redis.del(LOCK_PREFIX + key);
  } catch {
    /* ignore */
  }
}

/**
 * Stale-while-revalidate read.
 *
 * @param {Object} args
 * @param {string} args.key           Cache key (must include version prefix).
 * @param {number} args.softTtl       Soft TTL in seconds — used for SWR.
 * @param {number} args.hardTtl       Hard TTL in seconds — Redis evicts after this.
 * @param {string[]} [args.tags]      Tags for bulk invalidation.
 * @param {() => Promise<any>} args.loader  Function to fetch from origin on miss.
 * @param {boolean} [args.allowStale=true]  When true, return stale value while
 *                                          revalidating. When false, await loader.
 * @returns {Promise<any>}
 */
async function swr(args) {
  const {
    key,
    softTtl,
    hardTtl,
    tags,
    loader,
    allowStale = true,
  } = args;

  const env = await readEnvelope(key);

  // Fresh hit
  if (env && !env.stale) {
    void bumpStats('hits');
    return env.data;
  }

  // Stale hit → revalidate in background under a lock
  if (env && env.stale && allowStale) {
    void bumpStats('stale');
    queueMicrotask(async () => {
      const got = await acquireLock(key);
      if (!got) return;
      try {
        const fresh = await loader();
        await writeEnvelope(key, fresh, { softTtl, hardTtl, tags });
      } catch (err) {
        logger.warn('cache.service background revalidate failed', { key, err: err.message });
      } finally {
        await releaseLock(key);
      }
    });
    return env.data;
  }

  // Miss → single-flight load
  const got = await acquireLock(key, 10);
  if (!got) {
    // Another worker is loading — poll briefly for the value
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 50));
      const retry = await readEnvelope(key);
      if (retry && !retry.stale) return retry.data;
    }
    // Fallback: load directly
    void bumpStats('miss_no_lock');
    return loader();
  }

  try {
    void bumpStats('misses');
    const data = await loader();
    await writeEnvelope(key, data, { softTtl, hardTtl, tags });
    return data;
  } finally {
    await releaseLock(key);
  }
}

/** Write-through (use after mutations). */
async function set(key, data, opts) {
  await writeEnvelope(key, data, opts);
}

/** Direct invalidation. */
async function invalidate(keyOrKeys) {
  const keys = Array.isArray(keyOrKeys) ? keyOrKeys : [keyOrKeys];
  if (keys.length === 0) return 0;
  try {
    const metaKeys = keys.map((k) => META_PREFIX + k);
    await redis.del(...keys, ...metaKeys);
    return keys.length;
  } catch (err) {
    logger.warn('cache.service invalidate failed', { err: err.message });
    return 0;
  }
}

/** Bulk invalidation by tag — e.g. when seller data changes. */
async function invalidateByTag(tag) {
  try {
    const members = await redis.smembers(TAG_PREFIX + tag);
    if (!members || members.length === 0) return 0;
    await invalidate(members);
    await redis.del(TAG_PREFIX + tag);
    return members.length;
  } catch (err) {
    logger.warn('cache.service tag invalidate failed', { tag, err: err.message });
    return 0;
  }
}

/** Hash a complex object into a key suffix. */
function fingerprint(obj) {
  const json = JSON.stringify(obj, Object.keys(obj || {}).sort());
  return hashKey(json);
}

module.exports = {
  swr,
  set,
  invalidate,
  invalidateByTag,
  fingerprint,
  // Exposed for tests / diagnostics
  _internal: { readEnvelope, writeEnvelope, acquireLock, releaseLock },
};

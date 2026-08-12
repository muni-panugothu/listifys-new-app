'use strict';
/**
 * ── MongoDB Compound Index Optimization ─────────────────────────────────────
 * Ensures optimal compound indexes exist for all hot query patterns.
 *
 * At 10k+ concurrent users, missing indexes cause full collection scans
 * that saturate MongoDB's CPU and kill latency for everyone.
 *
 * Run on startup (idempotent — createIndex is a no-op if index exists).
 *
 * Index Strategy:
 *   - Every getAll() query uses: { status: 1, createdAt: -1 }
 *   - Search queries use: { status: 1, title: 'text', description: 'text' }
 *   - Geo queries use: { status: 1, location: '2dsphere' }
 *   - Category filters use: { status: 1, category: 1, createdAt: -1 }
 *   - Price range queries use: { status: 1, price: 1 }
 *   - Seller queries use: { seller: 1, status: 1, createdAt: -1 }
 *   - Slug lookups use: { slug: 1 } (unique)
 */
const mongoose = require('mongoose');
const { logger } = require('../utils/logger');

// ── Index definitions per collection ──
// Each entry: { collection, indexes: [{ fields, options }] }
const INDEX_DEFINITIONS = [
  // ── Common pattern for ALL listing collections ──
  ...([
    'forsales', 'electronics', 'mobiles', 'furnitures', 'fashions',
    'sports', 'collectibles', 'pets', 'books', 'beauties', 'others',
    'toys', 'jobs', 'vehicles', 'takecares', 'events', 'properties',
  ].map(collection => ({
    collection,
    indexes: [
      // Primary listing query: active listings, newest first
      { fields: { status: 1, createdAt: -1 }, options: { name: 'idx_status_created', background: true } },
      // Home feed query: active listings scoped to the user's country
      { fields: { status: 1, countryCode: 1, createdAt: -1 }, options: { name: 'idx_status_country_created', background: true } },
      // Seller's listings (my-listings page)
      { fields: { seller: 1, status: 1, createdAt: -1 }, options: { name: 'idx_seller_status_created', background: true } },
      // Slug lookup (detail page)
      { fields: { slug: 1 }, options: { name: 'idx_slug', unique: true, sparse: true, background: true } },
      // Price range queries
      { fields: { status: 1, price: 1, createdAt: -1 }, options: { name: 'idx_status_price_created', background: true } },
      // View count for popular/trending
      { fields: { status: 1, views: -1 }, options: { name: 'idx_status_views', background: true } },
      // Geo queries (location-based search)
      { fields: { 'location.coordinates': '2dsphere' }, options: { name: 'idx_location_geo', background: true, sparse: true } },
    ],
  }))),

  // ── Users collection ──
  {
    collection: 'users',
    indexes: [
      // email index is managed by ensureUserEmailIndex (sparse — phone-only users have no email)
      { fields: { status: 1, createdAt: -1 }, options: { name: 'idx_status_created', background: true } },
      { fields: { role: 1, status: 1 }, options: { name: 'idx_role_status', background: true } },
    ],
  },

  // ── Chat messages ──
  {
    collection: 'messages',
    indexes: [
      { fields: { chatRoom: 1, createdAt: -1 }, options: { name: 'idx_chatroom_created', background: true } },
      { fields: { sender: 1, createdAt: -1 }, options: { name: 'idx_sender_created', background: true } },
    ],
  },

  // ── Chat rooms ──
  {
    collection: 'chatrooms',
    indexes: [
      { fields: { participants: 1, updatedAt: -1 }, options: { name: 'idx_participants_updated', background: true } },
    ],
  },

  // ── Notifications ──
  {
    collection: 'notifications',
    indexes: [
      { fields: { recipient: 1, read: 1, createdAt: -1 }, options: { name: 'idx_recipient_read_created', background: true } },
      { fields: { recipient: 1, createdAt: -1 }, options: { name: 'idx_recipient_created', background: true } },
    ],
  },
];

/**
 * Phone-only users omit email entirely. Legacy non-sparse unique indexes on
 * email treat multiple null/absent values as duplicates (E11000 on register).
 */
async function ensureUserEmailIndex(db) {
  const coll = db.collection('users');
  try {
    const collections = await db.listCollections({ name: 'users' }).toArray();
    if (collections.length === 0) return;

    const indexes = await coll.indexes();
    for (const idx of indexes) {
      if (idx.key?.email !== 1) continue;
      if (idx.name === 'idx_email_sparse' && idx.sparse) continue;
      logger.info('[Indexes] Dropping legacy email index', { name: idx.name, sparse: !!idx.sparse });
      try {
        await coll.dropIndex(idx.name);
      } catch (dropErr) {
        logger.warn('[Indexes] Could not drop email index', { name: idx.name, error: dropErr.message });
      }
    }

    await coll.createIndex(
      { email: 1 },
      { name: 'idx_email_sparse', unique: true, sparse: true, background: true },
    );

    const unsetResult = await coll.updateMany({ email: null }, { $unset: { email: '' } });
    if (unsetResult.modifiedCount > 0) {
      logger.info('[Indexes] Removed null email from users', { count: unsetResult.modifiedCount });
    }
  } catch (err) {
    logger.warn('[Indexes] User email index migration failed (non-fatal)', { error: err.message });
  }
}

/**
 * Ensure all compound indexes exist. Idempotent — safe to run on every startup.
 * Runs in background so it doesn't block server startup.
 */
async function ensureIndexes() {
  if (mongoose.connection.readyState !== 1) {
    logger.warn('[Indexes] MongoDB not ready — skipping index optimization');
    return;
  }

  const db = mongoose.connection.db;
  let created = 0;
  let skipped = 0;
  let errors = 0;

  await ensureUserEmailIndex(db);

  for (const { collection, indexes } of INDEX_DEFINITIONS) {
    for (const { fields, options } of indexes) {
      try {
        // Check if collection exists first
        const collections = await db.listCollections({ name: collection }).toArray();
        if (collections.length === 0) {
          skipped++;
          continue;
        }

        await db.collection(collection).createIndex(fields, options);
        created++;
      } catch (err) {
        // Ignore "index already exists with different options" errors
        if (err.code === 85 || err.code === 86) {
          skipped++;
        } else {
          errors++;
          logger.warn(`[Indexes] Failed to create index on ${collection}`, {
            fields: JSON.stringify(fields),
            error: err.message,
          });
        }
      }
    }
  }

  logger.info(`[Indexes] Optimization complete: ${created} created, ${skipped} skipped, ${errors} errors`);
}

module.exports = { ensureIndexes };

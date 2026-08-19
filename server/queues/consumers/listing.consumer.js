'use strict';
/**
 * ── Listing Events Consumer ───────────────────────────────────────────────────
 * Processes: listing_events_queue
 * Handles post-CRUD ops: Elasticsearch re-indexing, cache invalidation,
 * follower notifications, and product audit logging.
 * 
 * Decoupled from the API request so controllers return < 30ms.
 */
const { consume, QUEUES } = require('../rabbitmq');
const { logger } = require('../../utils/logger');

// Lazy requires — prevents startup crashes if services are temporarily down
const getSearchService = () => require('../../services/search.service');
const getListingCache  = () => require('../../services/listingcache.service');
const getNotifyService = () => require('../../services/notifyfollowers.service.js');
const getRedis         = () => require('../../config/redis');
const getResponseCache = () => require('../../services/memorycache.service').responseCache;

const invalidateSellerListingsCache = async (userId) => {
  if (!userId) return;

  const prefix = `seller_listings:${userId}:`;
  getResponseCache().delByPrefix(prefix);

  const redis = getRedis();
  const keys = await redis.keys(`${prefix}*`);
  if (keys.length > 0) await redis.del(...keys);
};

const handleListingEvent = async (payload) => {
  const { type, entity, listing, oldListing, listingId, changes, userId } = payload;

  switch (type) {
    // ── CREATE ────────────────────────────────────────────────────────────────
    case 'listing_created': {
      const [ListingCache, SearchService, NotifyService] = [
        getListingCache(),
        getSearchService(),
        getNotifyService(),
      ];
      const isDraft = listing?.status === 'draft';
      const notifyOnCreate = !isDraft && entity !== 'events';
      await Promise.allSettled([
        ListingCache.cacheListing(entity, listing),
        ListingCache.logProductPosted(entity, listing),
        ListingCache.invalidateListCaches(entity),
        isDraft ? null : SearchService.indexListing(entity, listing),
        notifyOnCreate && userId
          ? NotifyService.notifyFollowersOfNewListing(userId, listing, entity)
          : null,
        userId ? invalidateSellerListingsCache(userId) : null,
      ]);
      logger.info(`[ListingConsumer] Listing created processed`, { entity, id: listing?._id, isDraft });
      break;
    }

    // ── PUBLISHED (draft → live, events publish pipeline) ─────────────────────
    case 'listing_published': {
      const [ListingCache, SearchService, NotifyService] = [
        getListingCache(),
        getSearchService(),
        getNotifyService(),
      ];
      await Promise.allSettled([
        ListingCache.cacheListing(entity, listing),
        ListingCache.invalidateListCaches(entity),
        SearchService.indexListing(entity, listing),
        userId
          ? NotifyService.notifyFollowersOfNewListing(userId, listing, entity, {
              notificationType: entity === 'events' ? 'organizer_new_event' : 'new_listing',
            })
          : null,
        userId ? invalidateSellerListingsCache(userId) : null,
      ]);
      logger.info(`[ListingConsumer] Listing published processed`, { entity, id: listing?._id });
      break;
    }

    // ── UPDATE ────────────────────────────────────────────────────────────────
    case 'listing_updated': {
      const [ListingCache, SearchService] = [getListingCache(), getSearchService()];
      await Promise.allSettled([
        ListingCache.cacheListing(entity, listing),
        ListingCache.invalidateListCaches(entity),
        ListingCache.logProductEdited(entity, oldListing, listing),
        SearchService.indexListing(entity, listing),
        userId ? invalidateSellerListingsCache(userId) : null,
      ]);
      logger.info(`[ListingConsumer] Listing updated processed`, { entity, id: listing?._id });
      break;
    }

    // ── DELETE ────────────────────────────────────────────────────────────────
    case 'listing_deleted': {
      const [ListingCache, SearchService] = [getListingCache(), getSearchService()];
      await Promise.allSettled([
        ListingCache.logProductDeleted(entity, listing),
        ListingCache.invalidateListingCache(entity, listingId),
        SearchService.removeListing(entity, listingId),
        userId ? invalidateSellerListingsCache(userId) : null,
      ]);
      logger.info(`[ListingConsumer] Listing deleted processed`, { entity, listingId });
      break;
    }

    default:
      logger.warn(`[ListingConsumer] Unknown type: ${type}`);
  }
};

// ── Search Index Consumer ─────────────────────────────────────────────────────
const handleSearchIndex = async (payload) => {
  const { action, entity, listing } = payload;

  // Search analytics tracking
  if (action === 'search_analytics') {
    await handleSearchAnalytics(payload);
    return;
  }

  const SearchService = getSearchService();

  if (action === 'remove') {
    await SearchService.removeListing(entity, listing?._id || payload.listingId);
  } else {
    await SearchService.indexListing(entity, listing);
  }
  logger.info(`[SearchConsumer] ${action} processed`, { entity });
};

// ── Search Analytics Handler ──────────────────────────────────────────────────
const handleSearchAnalytics = async (payload) => {
  const { query, entity, resultCount, source, userId, timestamp } = payload;

  try {
    const mongoose = require('mongoose');

    // Upsert into a lightweight search_analytics collection
    const SearchAnalytics = mongoose.models.SearchAnalytics || mongoose.model(
      'SearchAnalytics',
      new mongoose.Schema({
        query:       { type: String, required: true, index: true },
        entity:      { type: String, default: 'all' },
        searchCount: { type: Number, default: 0 },
        lastSearched:{ type: Date, default: Date.now },
        avgResults:  { type: Number, default: 0 },
        sources:     { type: Map, of: Number, default: {} },
        userIds:     { type: [String], default: [] },
      }, {
        collection: 'search_analytics',
        timestamps: true,
      })
    );

    // Ensure TTL index (auto-expire after 90 days of no searches)
    SearchAnalytics.collection.createIndex(
      { lastSearched: 1 },
      { expireAfterSeconds: 90 * 24 * 60 * 60 }
    ).catch(() => {}); // Ignore if already exists

    await SearchAnalytics.findOneAndUpdate(
      { query: query.toLowerCase(), entity },
      {
        $inc: { searchCount: 1, [`sources.${source}`]: 1 },
        $set: { lastSearched: new Date(timestamp || Date.now()) },
        $push: {
          userIds: {
            $each: userId ? [userId] : [],
            $slice: -50, // Keep last 50 user IDs only
          },
        },
        // Running average of result counts
        ...(resultCount != null ? {
          $set: { avgResults: resultCount },
        } : {}),
      },
      { upsert: true, new: true }
    );

    logger.debug(`[SearchAnalytics] Tracked: "${query}" (${resultCount} results via ${source})`);
  } catch (err) {
    logger.error('[SearchAnalytics] Failed to track:', err.message);
  }
};

// ── Image Cleanup Consumer ────────────────────────────────────────────────────
const handleImageCleanup = async (payload) => {
  const { imageUrls } = payload;
  if (!imageUrls || imageUrls.length === 0) return;

  const S3Service = require('../../services/s3.service');
  await S3Service.deleteImagesByUrls(imageUrls);
  logger.info(`[ImageCleanupConsumer] Deleted ${imageUrls.length} S3 images`);
};

// ── Start All Listing Consumers ───────────────────────────────────────────────
const startListingConsumers = async () => {
  await consume(QUEUES.LISTING_EVENTS.name, handleListingEvent, { maxRetries: 3 });
  await consume(QUEUES.SEARCH_INDEX.name,   handleSearchIndex,  { maxRetries: 5 });
  await consume(QUEUES.IMAGE_CLEANUP.name,  handleImageCleanup, { maxRetries: 3 });

  logger.info('[ListingConsumer] ✅ All listing consumers started');
};

module.exports = {
  startListingConsumers,
  handleListingEvent,
  handleSearchIndex,
  handleImageCleanup,
};

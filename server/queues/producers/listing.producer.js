'use strict';
/**
 * ── Listing Producer ─────────────────────────────────────────────────────────
 * Handles all async side-effects after listing CRUD operations:
 *   - Elasticsearch indexing / removal
 *   - Cache invalidation
 *   - Follower notifications
 *   - Product activity audit log
 *
 * All controllers call these instead of doing it in-process via Promise.all.
 */

const { publish, QUEUES } = require('../rabbitmq');
const { logger } = require('../../utils/logger');
const {
  handleListingEvent,
  handleSearchIndex,
  handleImageCleanup,
} = require('../consumers/listing.consumer');

// ── 1. New Listing Created ─────────────────────────────────────────────────────
const publishListingCreated = async ({ entity, listing, userId, ip, userAgent }) => {
  const payload = {
    type:      'listing_created',
    entity,    // 'forsale' | 'electronics' | 'vehicles' | 'events'
    listing,
    userId,
    ip,
    userAgent,
    timestamp: new Date().toISOString(),
  };

  const queued = await publish(QUEUES.LISTING_EVENTS.name, payload);
  if (queued) return true;

  logger.warn('[ListingProducer] Queue unavailable, processing listing_created in-process', {
    entity,
    listingId: listing?._id,
  });
  await handleListingEvent(payload);
  return true;
};

// ── 2. Listing Updated ────────────────────────────────────────────────────────
const publishListingUpdated = async ({ entity, listing, oldListing, changes, userId, ip }) => {
  const payload = {
    type: 'listing_updated',
    entity,
    listing,
    oldListing,
    changes,
    userId,
    ip,
    timestamp: new Date().toISOString(),
  };

  const queued = await publish(QUEUES.LISTING_EVENTS.name, payload);
  if (queued) return true;

  logger.warn('[ListingProducer] Queue unavailable, processing listing_updated in-process', {
    entity,
    listingId: listing?._id,
  });
  await handleListingEvent(payload);
  return true;
};

// ── 3. Listing Deleted ────────────────────────────────────────────────────────
const publishListingDeleted = async ({ entity, listingId, listing, userId }) => {
  const payload = {
    type: 'listing_deleted',
    entity,
    listingId,
    listing,
    userId,
    timestamp: new Date().toISOString(),
  };

  const queued = await publish(QUEUES.LISTING_EVENTS.name, payload);
  if (queued) return true;

  logger.warn('[ListingProducer] Queue unavailable, processing listing_deleted in-process', {
    entity,
    listingId,
  });
  await handleListingEvent(payload);
  return true;
};

// ── 4. Search Re-Index Request ────────────────────────────────────────────────
const publishSearchIndex = async ({ entity, listing, action = 'index' }) => {
  const payload = {
    action, // 'index' | 'remove'
    entity,
    listing,
    timestamp: new Date().toISOString(),
  };

  const queued = await publish(QUEUES.SEARCH_INDEX.name, payload);
  if (queued) return true;

  logger.warn('[ListingProducer] Queue unavailable, processing search index in-process', {
    entity,
    action,
    listingId: listing?._id,
  });
  await handleSearchIndex(payload);
  return true;
};

// ── 5. S3 Image Cleanup (orphaned images after listing update/delete) ─────────
const publishImageCleanup = async ({ imageUrls }) => {
  if (!imageUrls || imageUrls.length === 0) return true;
  const payload = {
    type: 'delete_images',
    imageUrls,
    timestamp: new Date().toISOString(),
  };

  const queued = await publish(QUEUES.IMAGE_CLEANUP.name, payload);
  if (queued) return true;

  logger.warn('[ListingProducer] Queue unavailable, processing image cleanup in-process', {
    imageCount: imageUrls.length,
  });
  await handleImageCleanup(payload);
  return true;
};

// ── 6. Listing Published (draft → live) ───────────────────────────────────────
const publishListingPublished = async ({ entity, listing, userId, ip, userAgent }) => {
  const payload = {
    type: 'listing_published',
    entity,
    listing,
    userId,
    ip,
    userAgent,
    timestamp: new Date().toISOString(),
  };

  const queued = await publish(QUEUES.LISTING_EVENTS.name, payload);
  if (queued) return true;

  logger.warn('[ListingProducer] Queue unavailable, processing listing_published in-process', {
    entity,
    listingId: listing?._id,
  });
  await handleListingEvent(payload);
  return true;
};

module.exports = {
  publishListingCreated,
  publishListingUpdated,
  publishListingDeleted,
  publishListingPublished,
  publishSearchIndex,
  publishImageCleanup,
};

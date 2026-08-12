/**
 * Generic Listing Routes Factory
 *
 * Generates standard CRUD + save + upload routes for any listing entity.
 * Eliminates route boilerplate across 12 categories.
 *
 * Usage:
 *   const router = createListingRoutes({
 *     entity: 'electronics',
 *     controller: electronicsController,
 *     validationMiddleware: validateListingInput, // optional
 *   });
 *   module.exports = router;
 */

const express = require('express');
const { protect } = require('../middleware/auth.middleware');
const upload = require('../middleware/upload.middleware');
const { optimiseImages } = require('../middleware/upload.middleware');
const videoUpload = require('../middleware/upload-video.middleware');
const { createUploadVideosHandler } = require('./listing-upload.handlers');
const { postingLimiter, uploadLimiter, saveLimiter, searchLimiter } = require('../middleware/ratelimiter.middleware');
const { cacheResponseTracked, invalidateAfter } = require('../middleware/cache.middleware');
const { validateListingInput } = require('../middleware/validation.middleware');

/**
 * @param {Object} opts
 * @param {string} opts.entity            - Entity name (e.g. "electronics")
 * @param {Object} opts.controller        - Controller with getAll, getById, createListing, etc.
 * @param {Function} [opts.validation]    - Validation middleware for create/update
 * @param {number} [opts.cacheTTL=300]    - Cache TTL in seconds for list endpoints
 * @param {number} [opts.detailTTL=300]   - Cache TTL in seconds for detail endpoints
 */
function createListingRoutes({ entity, controller, validation, cacheTTL = 300, detailTTL = 300 }) {
  const router = express.Router();
  const validate = validation || validateListingInput;

  // Public cached routes
  router.get('/', searchLimiter, cacheResponseTracked(entity, cacheTTL, 'list'), controller.getAll);

  // Private routes (before /:id to prevent shadowing)
  router.get('/my-listings', protect, controller.getMyListings);
  router.get('/saved', protect, controller.getSaved);

  // Create
  if (controller.createListing) {
    router.post('/', protect, postingLimiter, validate, invalidateAfter(entity), controller.createListing);
  }

  // Upload images
  if (controller.uploadImages) {
    router.post('/upload-images', protect, uploadLimiter, upload.array('images', 6), optimiseImages, controller.uploadImages);
  }

  // Upload videos (shared handler — works for all listing categories)
  router.post(
    '/upload-videos',
    protect,
    uploadLimiter,
    videoUpload.array('videos', 3),
    createUploadVideosHandler(entity),
  );

  // Detail + update + delete + save
  router.get('/:id', searchLimiter, cacheResponseTracked(entity, detailTTL, 'detail'), controller.getById);

  if (controller.updateListing) {
    router.put('/:id', protect, postingLimiter, validate, invalidateAfter(entity), controller.updateListing);
  }
  if (controller.deleteListing) {
    router.delete('/:id', protect, invalidateAfter(entity), controller.deleteListing);
  }

  router.post('/:id/toggle-save', protect, saveLimiter, controller.toggleSave);

  return router;
}

module.exports = { createListingRoutes };

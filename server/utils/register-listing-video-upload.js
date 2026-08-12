/**
 * Register POST /upload-videos on a listing router.
 * Call after upload-images route setup.
 */
function registerListingVideoUpload(router, entity) {
  const videoUpload = require('../middleware/upload-video.middleware');
  const { protect } = require('../middleware/auth.middleware');
  const { uploadLimiter } = require('../middleware/ratelimiter.middleware');
  const { createUploadVideosHandler } = require('./listing-upload.handlers');

  router.post(
    '/upload-videos',
    protect,
    uploadLimiter,
    videoUpload.array('videos', 3),
    createUploadVideosHandler(entity),
  );
}

module.exports = { registerListingVideoUpload };

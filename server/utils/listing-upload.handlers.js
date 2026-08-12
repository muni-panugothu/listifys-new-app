const { logger } = require('./logger');
const S3Service = require('../services/s3.service');
const ListingCache = require('../services/listingcache.service');

/**
 * Shared listing image upload handler — used when a category controller
 * does not define its own uploadImages export.
 */
function createUploadImagesHandler(category) {
  return async (req, res) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No images provided',
        });
      }

      const imageUrls = [];
      for (const file of req.files) {
        const result = await S3Service.uploadListingImage(
          file.buffer,
          req.user._id.toString(),
          file.mimetype,
          category,
        );
        imageUrls.push(result.imageUrl);
      }

      await ListingCache.cacheUploadedImages(
        category,
        req.user._id.toString(),
        imageUrls,
      );

      res.status(200).json({
        success: true,
        imageUrls,
        images: imageUrls,
      });
    } catch (error) {
      logger.error(`Upload ${category} images error:`, error);
      res.status(500).json({
        success: false,
        message: 'Failed to upload images',
      });
    }
  };
}

/**
 * Shared listing video upload handler for all marketplace categories.
 */
function createUploadVideosHandler(category) {
  return async (req, res) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No videos provided',
        });
      }

      let metadata = [];
      if (req.body?.metadata) {
        try {
          metadata = JSON.parse(req.body.metadata);
        } catch (_) {
          metadata = [];
        }
      }

      const videos = [];
      for (let i = 0; i < req.files.length; i += 1) {
        const file = req.files[i];
        const meta = Array.isArray(metadata) ? metadata[i] : null;

        const result = await S3Service.uploadListingVideo(
          file.buffer,
          req.user._id.toString(),
          file.mimetype,
          category,
          file.originalname,
        );

        videos.push({
          url: result.videoUrl,
          mimeType: file.mimetype,
          size: file.buffer.length,
          ...(meta?.duration != null ? { duration: Number(meta.duration) } : {}),
          ...(meta?.order != null ? { order: Number(meta.order) } : { order: i }),
        });
      }

      res.status(200).json({
        success: true,
        videos,
      });
    } catch (error) {
      logger.error(`Upload ${category} videos error:`, error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to upload videos',
      });
    }
  };
}

module.exports = {
  createUploadImagesHandler,
  createUploadVideosHandler,
};

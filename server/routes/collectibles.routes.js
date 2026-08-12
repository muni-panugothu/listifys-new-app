const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth.middleware.js");
const upload = require("../middleware/upload.middleware.js");
const { optimiseImages } = require("../middleware/upload.middleware.js");
const {
  postingLimiter,
  uploadLimiter,
  saveLimiter,
  searchLimiter,
} = require("../middleware/ratelimiter.middleware.js");
const {
  cacheResponseTracked,
  invalidateAfter,
} = require("../middleware/cache.middleware.js");
const {
  validateCreateCollectible,
  validateUpdateCollectible,
  validateQueryCollectible,
  validateParamsId,
} = require("../validations/collectibles.validation");
const {
  createCollectible,
  getAllCollectibles,
  getCollectibleById,
  updateCollectible,
  deleteCollectible,
  getMyCollectibles,
  getSavedCollectibles,
  uploadImages,
  toggleSave,
} = require("../controllers/collectibles.controller.js");

router.get(
  "/",
  searchLimiter,
  validateQueryCollectible,
  cacheResponseTracked("collectibles", 120, "list"),
  getAllCollectibles,
);

router.get("/my-listings", protect, getMyCollectibles);
router.get("/saved", protect, getSavedCollectibles);

router.post(
  "/",
  protect,
  postingLimiter,
  validateCreateCollectible,
  invalidateAfter("collectibles"),
  createCollectible,
);
router.post(
  "/upload-images",
  protect,
  uploadLimiter,
  upload.array("images", 6),
  optimiseImages,
  uploadImages,
);


const { registerListingVideoUpload } = require("../utils/register-listing-video-upload.js");
registerListingVideoUpload(router, "collectibles");
router.get(
  "/:id",
  searchLimiter,
  validateParamsId,
  cacheResponseTracked("collectibles", 300, "detail"),
  getCollectibleById,
);
router.put(
  "/:id",
  protect,
  postingLimiter,
  validateParamsId,
  validateUpdateCollectible,
  invalidateAfter("collectibles"),
  updateCollectible,
);
router.delete(
  "/:id",
  protect,
  validateParamsId,
  invalidateAfter("collectibles"),
  deleteCollectible,
);
router.post(
  "/:id/toggle-save",
  protect,
  validateParamsId,
  saveLimiter,
  toggleSave,
);

module.exports = router;

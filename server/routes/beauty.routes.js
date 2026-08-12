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
  validateCreateBeauty,
  validateUpdateBeauty,
  validateQueryBeauty,
  validateParamsId,
} = require("../validations/beauty.validation");
const {
  createBeauty,
  getAllBeauty,
  getBeautyById,
  updateBeauty,
  deleteBeauty,
  getMyBeauty,
  getSavedBeauty,
  uploadImages,
  toggleSave,
} = require("../controllers/beauty.controller.js");

router.get(
  "/",
  searchLimiter,
  validateQueryBeauty,
  cacheResponseTracked("beauty", 120, "list"),
  getAllBeauty,
);

router.get("/my-listings", protect, getMyBeauty);
router.get("/saved", protect, getSavedBeauty);

router.post(
  "/",
  protect,
  postingLimiter,
  validateCreateBeauty,
  invalidateAfter("beauty"),
  createBeauty,
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
registerListingVideoUpload(router, "beauty");
router.get(
  "/:id",
  searchLimiter,
  validateParamsId,
  cacheResponseTracked("beauty", 300, "detail"),
  getBeautyById,
);
router.put(
  "/:id",
  protect,
  postingLimiter,
  validateParamsId,
  validateUpdateBeauty,
  invalidateAfter("beauty"),
  updateBeauty,
);
router.delete(
  "/:id",
  protect,
  validateParamsId,
  invalidateAfter("beauty"),
  deleteBeauty,
);
router.post(
  "/:id/toggle-save",
  protect,
  validateParamsId,
  saveLimiter,
  toggleSave,
);

module.exports = router;

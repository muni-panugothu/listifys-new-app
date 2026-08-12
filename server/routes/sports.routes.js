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
  validateCreateSports,
  validateUpdateSports,
  validateSportsQuery,
  validateSportsParams,
} = require("../validations/sports.validation");
const {
  createSports,
  getAllSports,
  getSportsById,
  updateSports,
  deleteSports,
  getMySports,
  getSavedSports,
  uploadImages,
  toggleSave,
} = require("../controllers/sports.controller.js");

router.get(
  "/",
  searchLimiter,
  validateSportsQuery,
  cacheResponseTracked("sports", 120, "list"),
  getAllSports,
);

router.get("/my-listings", protect, getMySports);
router.get("/saved", protect, getSavedSports);

router.post(
  "/",
  protect,
  postingLimiter,
  validateCreateSports,
  invalidateAfter("sports"),
  createSports,
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
registerListingVideoUpload(router, "sports");
router.get(
  "/:id",
  searchLimiter,
  validateSportsParams,
  cacheResponseTracked("sports", 300, "detail"),
  getSportsById,
);
router.put(
  "/:id",
  protect,
  postingLimiter,
  validateSportsParams,
  validateUpdateSports,
  invalidateAfter("sports"),
  updateSports,
);
router.delete(
  "/:id",
  protect,
  validateSportsParams,
  invalidateAfter("sports"),
  deleteSports,
);
router.post(
  "/:id/toggle-save",
  protect,
  validateSportsParams,
  saveLimiter,
  toggleSave,
);

module.exports = router;

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
  validateCreateMobile,
  validateUpdateMobile,
  validateMobileQuery,
  validateMobileParams,
} = require("../validations/mobile.validation");
const {
  createMobile,
  getAllMobiles,
  getMobileById,
  updateMobile,
  deleteMobile,
  getMyMobiles,
  getSavedMobiles,
  uploadImages,
  toggleSave,
} = require("../controllers/mobiles.controller.js");

router.get("/", searchLimiter, validateMobileQuery, cacheResponseTracked("mobiles", 300, "list"), getAllMobiles);

router.get("/my-listings", protect, getMyMobiles);
router.get("/saved", protect, getSavedMobiles);

router.post(
  "/",
  protect,
  postingLimiter,
  validateCreateMobile,
  invalidateAfter("mobiles"),
  createMobile,
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
registerListingVideoUpload(router, "mobiles");
router.get("/:id", searchLimiter, validateMobileParams, cacheResponseTracked("mobiles", 300, "detail"), getMobileById);
router.put(
  "/:id",
  protect,
  postingLimiter,
  validateMobileParams,
  validateUpdateMobile,
  invalidateAfter("mobiles"),
  updateMobile,
);
router.delete("/:id", protect, validateMobileParams, invalidateAfter("mobiles"), deleteMobile);
router.post("/:id/toggle-save", protect, validateMobileParams, saveLimiter, toggleSave);

module.exports = router;

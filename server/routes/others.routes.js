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
  validateCreateOther,
  validateUpdateOther,
  validateQueryOther,
  validateParamsId,
} = require("../validations/others.validation");
const {
  createOther,
  getAllOthers,
  getOtherById,
  updateOther,
  deleteOther,
  getMyOthers,
  getSavedOthers,
  uploadImages,
  toggleSave,
} = require("../controllers/others.controller.js");

router.get(
  "/",
  searchLimiter,
  validateQueryOther,
  cacheResponseTracked("others", 120, "list"),
  getAllOthers,
);

router.get("/my-listings", protect, getMyOthers);
router.get("/saved", protect, getSavedOthers);

router.post(
  "/",
  protect,
  postingLimiter,
  validateCreateOther,
  invalidateAfter("others"),
  createOther,
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
registerListingVideoUpload(router, "others");
router.get(
  "/:id",
  searchLimiter,
  validateParamsId,
  cacheResponseTracked("others", 300, "detail"),
  getOtherById,
);
router.put(
  "/:id",
  protect,
  postingLimiter,
  validateParamsId,
  validateUpdateOther,
  invalidateAfter("others"),
  updateOther,
);
router.delete(
  "/:id",
  protect,
  validateParamsId,
  invalidateAfter("others"),
  deleteOther,
);
router.post(
  "/:id/toggle-save",
  protect,
  validateParamsId,
  saveLimiter,
  toggleSave,
);

module.exports = router;

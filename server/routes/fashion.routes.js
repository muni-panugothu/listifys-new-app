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
  validateCreateFashion,
  validateUpdateFashion,
  validateFashionQuery,
  validateFashionParams,
} = require("../validations/fashion.validation");
const {
  createFashion,
  getAllFashion,
  getFashionById,
  updateFashion,
  deleteFashion,
  getMyFashion,
  getSavedFashion,
  uploadImages,
  toggleSave,
} = require("../controllers/fashion.controller.js");

router.get("/", searchLimiter, validateFashionQuery, cacheResponseTracked("fashion", 300, "list"), getAllFashion);

router.get("/my-listings", protect, getMyFashion);
router.get("/saved", protect, getSavedFashion);

router.post(
  "/",
  protect,
  postingLimiter,
  validateCreateFashion,
  invalidateAfter("fashion"),
  createFashion,
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
registerListingVideoUpload(router, "fashion");
router.get("/:id", searchLimiter, validateFashionParams, cacheResponseTracked("fashion", 300, "detail"), getFashionById);
router.put(
  "/:id",
  protect,
  postingLimiter,
  validateFashionParams,
  validateUpdateFashion,
  invalidateAfter("fashion"),
  updateFashion,
);
router.delete("/:id", protect, validateFashionParams, invalidateAfter("fashion"), deleteFashion);
router.post("/:id/toggle-save", protect, validateFashionParams, saveLimiter, toggleSave);

module.exports = router;

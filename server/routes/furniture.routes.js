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
  validateCreateFurniture,
  validateUpdateFurniture,
  validateFurnitureQuery,
  validateFurnitureParams,
} = require("../validations/furniture.validation");
const {
  createFurniture,
  getAllFurniture,
  getFurnitureById,
  updateFurniture,
  deleteFurniture,
  getMyFurniture,
  getSavedFurniture,
  uploadImages,
  toggleSave,
} = require("../controllers/furniture.controller.js");

router.get("/", searchLimiter, validateFurnitureQuery, cacheResponseTracked("furniture", 300, "list"), getAllFurniture);

router.get("/my-listings", protect, getMyFurniture);
router.get("/saved", protect, getSavedFurniture);

router.post(
  "/",
  protect,
  postingLimiter,
  validateCreateFurniture,
  invalidateAfter("furniture"),
  createFurniture,
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
registerListingVideoUpload(router, "furniture");
router.get("/:id", searchLimiter, validateFurnitureParams, cacheResponseTracked("furniture", 300, "detail"), getFurnitureById);
router.put(
  "/:id",
  protect,
  postingLimiter,
  validateFurnitureParams,
  validateUpdateFurniture,
  invalidateAfter("furniture"),
  updateFurniture,
);
router.delete("/:id", protect, validateFurnitureParams, invalidateAfter("furniture"), deleteFurniture);
router.post("/:id/toggle-save", protect, validateFurnitureParams, saveLimiter, toggleSave);

module.exports = router;

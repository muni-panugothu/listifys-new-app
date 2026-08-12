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
  validateCreateToy,
  validateUpdateToy,
  validateToyQuery,
  validateToyParams,
} = require("../validations/toys.validation");
const {
  createToy,
  getAllToys,
  getToyById,
  updateToy,
  deleteToy,
  getMyToys,
  getSavedToys,
  uploadImages,
  toggleSave,
} = require("../controllers/toys.controller.js");

router.get("/", searchLimiter, validateToyQuery, cacheResponseTracked("toys", 300, "list"), getAllToys);

router.get("/my-listings", protect, getMyToys);
router.get("/saved", protect, getSavedToys);

router.post(
  "/",
  protect,
  postingLimiter,
  validateCreateToy,
  invalidateAfter("toys"),
  createToy,
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
registerListingVideoUpload(router, "toys");
router.get("/:id", searchLimiter, validateToyParams, cacheResponseTracked("toys", 300, "detail"), getToyById);
router.put(
  "/:id",
  protect,
  postingLimiter,
  validateToyParams,
  validateUpdateToy,
  invalidateAfter("toys"),
  updateToy,
);
router.delete("/:id", protect, validateToyParams, invalidateAfter("toys"), deleteToy);
router.post("/:id/toggle-save", protect, validateToyParams, saveLimiter, toggleSave);

module.exports = router;

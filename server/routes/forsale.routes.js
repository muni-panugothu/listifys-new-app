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
const { validateListingInput } = require("../middleware/validation.middleware.js");
const {
  createForSale,
  getAllForSale,
  getForSaleById,
  updateForSale,
  deleteForSale,
  getMyForSale,
  getSavedForSale,
  uploadImages,
  toggleSave,
} = require("../controllers/forsale.controller.js");

// ── Public routes (cached + search-rate-limited) ──
router.get(
  "/",
  searchLimiter,
  cacheResponseTracked("forsale", 300, "list"),
  getAllForSale
);

// ── Private routes (must be before /:id to avoid conflicts) ──
router.get("/my-listings", protect, getMyForSale);
router.get("/saved", protect, getSavedForSale);

// Create — rate limited (10 posts/min) + validated + cache invalidated
router.post(
  "/",
  protect,
  postingLimiter,
  validateListingInput,
  invalidateAfter("forsale"),
  createForSale
);

// Upload — rate limited (20 uploads/5 min) + auto-optimised images
router.post(
  "/upload-images",
  protect,
  uploadLimiter,
  upload.array("images", 6),
  optimiseImages,
  uploadImages
);


const { registerListingVideoUpload } = require("../utils/register-listing-video-upload.js");
registerListingVideoUpload(router, "forsale");
// ── Routes with :id parameter ──
router.get(
  "/:id",
  searchLimiter,
  cacheResponseTracked("forsale", 300, "detail"),
  getForSaleById
);
router.put(
  "/:id",
  protect,
  postingLimiter,
  validateListingInput,
  invalidateAfter("forsale"),
  updateForSale
);
router.delete("/:id", protect, invalidateAfter("forsale"), deleteForSale);
router.post("/:id/toggle-save", protect, saveLimiter, toggleSave);

module.exports = router;

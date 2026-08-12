const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth.middleware.js");
const upload = require("../middleware/upload.middleware.js");
const { optimiseImages } = require("../middleware/upload.middleware.js");
const { postingLimiter, uploadLimiter, saveLimiter, searchLimiter } = require("../middleware/ratelimiter.middleware.js");
const { cacheResponseTracked, invalidateAfter } = require("../middleware/cache.middleware.js");
const { validateListingInput } = require("../middleware/validation.middleware.js");
const {
  createElectronics,
  getAllElectronics,
  getElectronicsById,
  updateElectronics,
  deleteElectronics,
  getMyElectronics,
  getSavedElectronics,
  uploadImages,
  toggleSave,
} = require("../controllers/electronics.controller.js");

// ── Public routes (cached + search-rate-limited) ──
router.get("/", searchLimiter, cacheResponseTracked("electronics", 300, "list"), getAllElectronics);

// ── Private routes (must be before /:id to avoid conflicts) ──
router.get("/my-listings", protect, getMyElectronics);
router.get("/saved", protect, getSavedElectronics);

// Create — rate limited (10 posts/min) + validated + cache invalidated
router.post("/", protect, postingLimiter, validateListingInput, invalidateAfter("electronics"), createElectronics);

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
registerListingVideoUpload(router, "electronics");
// ── Routes with :id parameter ──
router.get("/:id", searchLimiter, cacheResponseTracked("electronics", 300, "detail"), getElectronicsById);
router.put("/:id", protect, postingLimiter, validateListingInput, invalidateAfter("electronics"), updateElectronics);
router.delete("/:id", protect, invalidateAfter("electronics"), deleteElectronics);
router.post("/:id/toggle-save", protect, saveLimiter, toggleSave);

module.exports = router;

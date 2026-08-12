const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth.middleware.js");
const upload = require("../middleware/upload.middleware.js");
const { optimiseImages } = require("../middleware/upload.middleware.js");
const { postingLimiter, uploadLimiter, saveLimiter, searchLimiter } = require("../middleware/ratelimiter.middleware.js");
const { cacheResponseTracked, invalidateAfter } = require("../middleware/cache.middleware.js");
const { validateListingInput } = require("../middleware/validation.middleware.js");
const {
  createVehicle,
  getAllVehicles,
  getVehicleById,
  updateVehicle,
  deleteVehicle,
  getMyVehicles,
  getSavedVehicles,
  uploadImages,
  toggleSave,
} = require("../controllers/vehicles.controller.js");

// ── Public routes (cached + search-rate-limited) ──
router.get("/", searchLimiter, cacheResponseTracked("vehicles", 300, "list"), getAllVehicles);

// ── Private routes (must be before /:id) ──
router.get("/my-listings", protect, getMyVehicles);
router.get("/saved", protect, getSavedVehicles);

// Create — rate limited (10 posts/min) + validated + cache invalidated
router.post("/", protect, postingLimiter, validateListingInput, invalidateAfter("vehicles"), createVehicle);

// Upload — rate limited (20 uploads/5 min) + auto-optimised images
router.post("/upload-images", protect, uploadLimiter, upload.array("images", 6), optimiseImages, uploadImages);


const { registerListingVideoUpload } = require("../utils/register-listing-video-upload.js");
registerListingVideoUpload(router, "vehicles");
// ── Routes with :id parameter ──
router.get("/:id", searchLimiter, cacheResponseTracked("vehicles", 300, "detail"), getVehicleById);
router.put("/:id", protect, postingLimiter, validateListingInput, invalidateAfter("vehicles"), updateVehicle);
router.delete("/:id", protect, invalidateAfter("vehicles"), deleteVehicle);
router.post("/:id/toggle-save", protect, saveLimiter, toggleSave);

module.exports = router;

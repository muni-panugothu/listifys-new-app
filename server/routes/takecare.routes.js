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
  createTakeCare,
  getAllTakeCare,
  getTakeCareById,
  updateTakeCare,
  deleteTakeCare,
  getMyTakeCare,
  getSavedTakeCare,
  uploadImages,
  toggleSave,
} = require("../controllers/takecare.controller.js");

router.get("/", searchLimiter, cacheResponseTracked("takecare", 300, "list"), getAllTakeCare);

router.get("/my-listings", protect, getMyTakeCare);
router.get("/saved", protect, getSavedTakeCare);

router.post("/", protect, postingLimiter, validateListingInput, invalidateAfter("takecare"), createTakeCare);

router.post(
  "/upload-images",
  protect,
  uploadLimiter,
  upload.array("images", 6),
  optimiseImages,
  uploadImages
);


const { registerListingVideoUpload } = require("../utils/register-listing-video-upload.js");
registerListingVideoUpload(router, "takecare");
router.get("/:id", searchLimiter, cacheResponseTracked("takecare", 300, "detail"), getTakeCareById);
router.put("/:id", protect, postingLimiter, validateListingInput, invalidateAfter("takecare"), updateTakeCare);
router.delete("/:id", protect, invalidateAfter("takecare"), deleteTakeCare);
router.post("/:id/toggle-save", protect, saveLimiter, toggleSave);

module.exports = router;

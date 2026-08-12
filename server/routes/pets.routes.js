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
  validateCreatePet,
  validateUpdatePet,
  validateQueryPet,
  validateParamsId,
} = require("../validations/pets.validation");
const {
  createPet,
  getAllPets,
  getPetById,
  updatePet,
  deletePet,
  getMyPets,
  getSavedPets,
  uploadImages,
  toggleSave,
} = require("../controllers/pets.controller.js");

router.get(
  "/",
  searchLimiter,
  validateQueryPet,
  cacheResponseTracked("pets", 120, "list"),
  getAllPets,
);

router.get("/my-listings", protect, getMyPets);
router.get("/saved", protect, getSavedPets);

router.post(
  "/",
  protect,
  postingLimiter,
  validateCreatePet,
  invalidateAfter("pets"),
  createPet,
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
registerListingVideoUpload(router, "pets");
router.get(
  "/:id",
  searchLimiter,
  validateParamsId,
  cacheResponseTracked("pets", 300, "detail"),
  getPetById,
);
router.put(
  "/:id",
  protect,
  postingLimiter,
  validateParamsId,
  validateUpdatePet,
  invalidateAfter("pets"),
  updatePet,
);
router.delete(
  "/:id",
  protect,
  validateParamsId,
  invalidateAfter("pets"),
  deletePet,
);
router.post(
  "/:id/toggle-save",
  protect,
  validateParamsId,
  saveLimiter,
  toggleSave,
);

module.exports = router;

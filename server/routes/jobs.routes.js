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
const { validateCreateJob, validateUpdateJob, validateJobQuery } = require("../validations/jobs.validation.js");
const {
  createJob,
  getAllJobs,
  getJobById,
  updateJob,
  deleteJob,
  getMyJobs,
  getSavedJobs,
  uploadImages,
  uploadCompanyLogo,
  toggleSave,
  recordJobApply,
  getMyCompanyProfile,
  upsertMyCompanyProfile,
} = require("../controllers/jobs.controller.js");

router.get("/", searchLimiter, cacheResponseTracked("jobs", 300, "list"), getAllJobs);

router.get("/my-listings", protect, getMyJobs);
router.get("/saved", protect, getSavedJobs);
router.get("/company-profile/me", protect, getMyCompanyProfile);
router.put("/company-profile/me", protect, postingLimiter, validateListingInput, invalidateAfter("jobs"), upsertMyCompanyProfile);

router.post("/", protect, postingLimiter, validateListingInput, validateCreateJob, invalidateAfter("jobs"), createJob);

router.post(
  "/upload-images",
  protect,
  uploadLimiter,
  upload.array("images", 6),
  optimiseImages,
  uploadImages
);


const { registerListingVideoUpload } = require("../utils/register-listing-video-upload.js");
registerListingVideoUpload(router, "jobs");
router.post(
  "/company-profile/upload-logo",
  protect,
  uploadLimiter,
  upload.single("logo"),
  optimiseImages,
  uploadCompanyLogo
);

router.get("/:id", searchLimiter, cacheResponseTracked("jobs", 300, "detail"), getJobById);
router.put("/:id", protect, postingLimiter, validateListingInput, validateUpdateJob, invalidateAfter("jobs"), updateJob);
router.delete("/:id", protect, invalidateAfter("jobs"), deleteJob);
router.post("/:id/toggle-save", protect, saveLimiter, toggleSave);
router.post("/:id/apply", protect, saveLimiter, recordJobApply);

module.exports = router;

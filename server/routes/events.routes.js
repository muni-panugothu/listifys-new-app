const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth.middleware.js");
const upload = require("../middleware/upload.middleware.js");
const { optimiseImages } = require("../middleware/upload.middleware.js");
const { postingLimiter, uploadLimiter, saveLimiter, searchLimiter } = require("../middleware/ratelimiter.middleware.js");
const { cacheResponseTracked, invalidateAfter } = require("../middleware/cache.middleware.js");
const { validateListingInput } = require("../middleware/validation.middleware.js");
const {
  createEvent,
  getAllEvents,
  getEventById,
  updateEvent,
  deleteEvent,
  getMyEvents,
  getSavedEvents,
  uploadImages,
  toggleSave,
  getEventCalendarSummary,
  getUpcomingEvents,
} = require("../controllers/events.controller.js");

router.get("/calendar/summary", searchLimiter, getEventCalendarSummary);
router.get("/upcoming", searchLimiter, cacheResponseTracked("events", 60, "upcoming"), getUpcomingEvents);

router.get("/", searchLimiter, cacheResponseTracked("events", 300, "list"), getAllEvents);

router.get("/my-listings", protect, getMyEvents);
router.get("/saved", protect, getSavedEvents);

router.post("/", protect, postingLimiter, validateListingInput, invalidateAfter("events"), createEvent);

router.post(
  "/upload-images",
  protect,
  uploadLimiter,
  upload.array("images", 6),
  optimiseImages,
  uploadImages
);

router.get("/:id", searchLimiter, cacheResponseTracked("events", 300, "detail"), getEventById);
router.put("/:id", protect, postingLimiter, validateListingInput, invalidateAfter("events"), updateEvent);
router.delete("/:id", protect, invalidateAfter("events"), deleteEvent);
router.post("/:id/toggle-save", protect, saveLimiter, toggleSave);

module.exports = router;

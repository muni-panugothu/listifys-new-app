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
  validateCreateBook,
  validateUpdateBook,
  validateQueryBook,
  validateParamsId,
} = require("../validations/books.validation");
const {
  createBook,
  getAllBooks,
  getBookById,
  updateBook,
  deleteBook,
  getMyBooks,
  getSavedBooks,
  uploadImages,
  toggleSave,
} = require("../controllers/books.controller.js");

router.get(
  "/",
  searchLimiter,
  validateQueryBook,
  cacheResponseTracked("books", 120, "list"),
  getAllBooks,
);

router.get("/my-listings", protect, getMyBooks);
router.get("/saved", protect, getSavedBooks);

router.post(
  "/",
  protect,
  postingLimiter,
  validateCreateBook,
  invalidateAfter("books"),
  createBook,
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
registerListingVideoUpload(router, "books");
router.get(
  "/:id",
  searchLimiter,
  validateParamsId,
  cacheResponseTracked("books", 300, "detail"),
  getBookById,
);
router.put(
  "/:id",
  protect,
  postingLimiter,
  validateParamsId,
  validateUpdateBook,
  invalidateAfter("books"),
  updateBook,
);
router.delete(
  "/:id",
  protect,
  validateParamsId,
  invalidateAfter("books"),
  deleteBook,
);
router.post(
  "/:id/toggle-save",
  protect,
  validateParamsId,
  saveLimiter,
  toggleSave,
);

module.exports = router;

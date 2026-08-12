const ForSale = require("../models/forsale.model");
const mongoose = require("mongoose");
const { logger } = require("../utils/logger");
const { parsePagination, paginatedFind } = require("../utils/pagination");
const redis = require("../config/redis");
const ListingCache = require("../services/listingcache.service");
const SearchService = require("../services/search.service");
const { esHydratedSearch } = require("../utils/esSearch");
const S3Service = require("../services/s3.service");
const viewCounter = require("../services/viewcount.service.js");
const { notifyFollowersOfNewListing } = require("../services/notifyfollowers.service.js");

// ── RabbitMQ Producers ────────────────────────────────────────────────
const {
  publishListingCreated,
  publishListingUpdated,
  publishListingDeleted,
  publishImageCleanup,
} = require('../queues/producers/listing.producer');

// Query projection for list endpoints — only fetch needed fields
const LIST_PROJECTION = { currency: 1, slug: 1,
  title: 1, description: 1, price: 1, location: 1, condition: 1, category: 1,
  subcategory: 1, images: 1, sellerName: 1, seller: 1, views: 1,
  features: 1, phone: 1, status: 1, savedBy: 1, createdAt: 1,
  brand: 1, model: 1, coordinates: 1,
  countryCode: 1,
};

// Normalise all image URLs in a listing to proxy format
const normaliseImages = (listing) => {
  if (!listing) return listing;
  if (listing.images) {
    listing.images = listing.images.map(url => S3Service.toProxyUrl(url));
  }
  if (listing.seller?.profileImage) {
    listing.seller.profileImage = S3Service.toProxyUrl(listing.seller.profileImage);
  }
  return listing;
};

// ── Valid categories & subcategories (server-side enforcement) ────
const VALID_CATEGORIES = {
  Mobiles: ["Mobile Phones", "Accessories", "Tablets"],
  Furniture: [
    "Sofas & Dining",
    "Beds & Wardrobes",
    "Tables & Chairs",
    "Home Decor",
    "Office Furniture",
  ],
  Fashion: [
    "Men's Clothing",
    "Women's Clothing",
    "Kids Clothing",
    "Footwear",
    "Watches",
    "Accessories",
  ],
  Books: [
    "Fiction",
    "Non-Fiction",
    "Children's Books",
    "Textbooks",
    "Comics",
    "Magazines",
    "Academic & Study",
    "Self Help",
    "Biography & Memoir",
    "Science & Technology",
    "History & Politics",
    "Religion & Spirituality",
    "Art & Photography",
    "Travel & Adventure",
    "Other Books",
  ],
  Sports: [
    "Exercise & Gym",
    "Camping & Outdoors",
    "Bikes & Cycling",
    "Sports Equipment",
    "Hunting & Fishing",
    "Cricket",
    "Football",
    "Badminton",
    "Tennis",
    "Basketball",
    "Swimming",
    "Running",
    "Yoga & Fitness",
    "Boxing & Martial Arts",
    "Hockey",
    "Table Tennis",
    "Other Sports",
  ],
  "Books, Sports": [
    "Books",
    "Gym & Fitness",
    "Sports Equipment",
    "Musical Instruments",
    "Hobbies",
    "Cycling",
  ],
  "Toys & Games": [
    "Video Games",
    "Puzzles",
    "RC Toys",
    "Soft Toys & Dolls",
    "Building Toys",
    "Baby Toys",
    "Action Figures",
    "Board Games",
    "Outdoor Toys",
    "Arts & Crafts",
    "Educational Toys",
    "Toy Cars & Vehicles",
    "Other Toys",
  ],
  Collectibles: [
    "Coins & Currency",
    "Stamps",
    "Trading Cards",
    "Antiques",
    "Vintage Items",
    "Memorabilia",
    "Art & Prints",
    "Other Collectibles",
  ],
  Pets: [
    "Dogs",
    "Cats",
    "Birds",
    "Fish & Aquarium",
    "Small Animals",
    "Reptiles",
    "Pet Supplies",
    "Pet Services",
    "Pet Food & Treats",
    "Pet Accessories",
    "Pet Grooming",
    "Pet Health & Vet",
    "Pet Cages & Kennels",
    "Aquarium Supplies",
    "Pet Clothing",
    "Other Pets",
  ],
  Beauty: [
    "Makeup",
    "Skincare",
    "Hair Care",
    "Fragrance",
    "Vitamins",
    "Personal Care",
    "Nail Care",
    "Men's Grooming",
    "Bath & Body",
    "Sun Care",
    "Eye Care",
    "Lip Care",
    "Body Lotions & Oils",
    "Deodorants",
    "Other Beauty",
  ],
  Others: ["Other Items"],
};

const SUBCATEGORY_ALIASES = {
  "Mens Clothing": "Men's Clothing",
  "Womens Clothing": "Women's Clothing",
  "Childrens Books": "Children's Books",
};

/**
 * Validate category + subcategory combination server-side.
 */
const validateCategorySubcategory = (category, subcategory) => {
  const normalizedSubcategory = SUBCATEGORY_ALIASES[subcategory] || subcategory;
  const validSubs = VALID_CATEGORIES[category];
  if (!validSubs) {
    return `Invalid category: ${category}. Must be one of: ${Object.keys(VALID_CATEGORIES).join(", ")}`;
  }
  if (!validSubs.includes(normalizedSubcategory)) {
    return `Invalid subcategory "${subcategory}" for category "${category}". Must be one of: ${validSubs.join(", ")}`;
  }
  return null;
};

// @desc    Create a new for-sale listing
// @route   POST /api/forsale
// @access  Private
exports.createForSale = async (req, res) => {
  try {
    const {
      title,
      description,
      price,
      category,
      subcategory,
      condition,
      location,
      phone,
      phoneCode,
      currency,
      countryCode,
      features,
      images,
      // Mobiles
      brand,
      model,
      storage,
      ram,
      screenSize,
      batteryHealth,
      warranty,
      color,
      // Furniture
      material,
      dimensions,
      weight,
      assemblyRequired,
      numberOfPieces,
      // Fashion
      size,
      gender,
      fabricType,
      // Books, Sports
      author,
      isbn,
      publisher,
      edition,
      sportType,
      // Location coordinates (optional)
      lat,
      lng,
    } = req.body;

    // Server-side category validation
    const catError = validateCategorySubcategory(category, subcategory);
    if (catError) {
      return res.status(400).json({ success: false, message: catError });
    }

    const listing = await ForSale.create({
      title,
      description,
      price,
      category,
      subcategory,
      condition: condition || "Good",
      location,
      phone,
      phoneCode,
      currency,
      countryCode,
      features: features || [],
      images: images || [],
      videos: videos || [],
      // Mobiles
      brand,
      model,
      storage,
      ram,
      screenSize,
      batteryHealth,
      warranty,
      color,
      // Furniture
      material,
      dimensions,
      weight,
      assemblyRequired,
      numberOfPieces,
      // Fashion
      size,
      gender,
      fabricType,
      // Books, Sports
      author,
      isbn,
      publisher,
      edition,
      sportType,
      // Geo coordinates (for nearby search)
      ...(lat && lng && isFinite(Number(lat)) && isFinite(Number(lng)) && {
        coordinates: { type: "Point", coordinates: [Number(lng), Number(lat)] },
      }),
      // Seller
      seller: req.user._id,
      sellerName: req.user.firstName
        ? `${req.user.firstName} ${req.user.lastName || ""}`.trim()
        : req.user.email.split("@")[0],
    });

    const populated = await ForSale.findById(listing._id).populate(
      "seller",
      "name profileImage"
    );

    const listingObj = populated.toObject ? populated.toObject() : populated;

    normaliseImages(listingObj);

    res.status(201).json({
      success: true,
      message: "Listing created successfully",
      listing: listingObj,
    });

    // ── Product posting log (detailed) ──────────────────────
    logger.productLog('posted', 'forsale', listingObj, req, {
      brand: brand || undefined,
      model: model || undefined,
    });

    // ✅ Background via RabbitMQ (non-blocking)
    publishListingCreated({
      entity: 'forsale',
      listing: listingObj,
      userId:  req.user._id,
      ip:      req.ip,
      userAgent: req.get('user-agent'),
    }).catch(() => {});
  } catch (error) {
    logger.error("Create forsale error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create listing",
    });
  }
};

// @desc    Get all for-sale listings (public)
// @route   GET /api/forsale
// @access  Public
exports.getAllForSale = async (req, res) => {
  try {
    const {
      search,
      category,
      subcategory,
      condition,
      minPrice,
      maxPrice,
      sort,
      location: locationFilter,
      lat,
      lng,
      radius,
      countryCode,
      page = 1,
      limit = 50,
    } = req.query;

    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
    const safePage = Math.max(Number(page) || 1, 1);

    // Build cache key
    const queryKey = [
      search || "",
      category || "",
      subcategory || "",
      condition || "",
      minPrice || "",
      maxPrice || "",
      sort || "newest",
      locationFilter || "",
      lat || "",
      lng || "",
      radius || "",
      countryCode || "",
      page,
      limit,
    ].join("|");

    // Check listing cache first
    const cached = await ListingCache.getCachedListingList("forsale", queryKey);
    if (cached) {
      if (cached.listings) cached.listings.forEach(normaliseImages);
      res.setHeader("X-Cache", "HIT");
      res.setHeader("X-Cache-Source", "listing-cache");
      res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
      return res.status(200).json({
        success: true,
        listings: cached.listings,
        pagination: cached.pagination,
      });
    }

    // ── Elasticsearch-first search (MongoDB regex fallback below) ──
    if (search && !(lat && lng)) {
      const esResult = await esHydratedSearch({
        entity: 'forsale',
        searchParams: { query: search, category: subcategory, condition, minPrice, maxPrice, location: locationFilter, sort, page: safePage, limit: safeLimit },
        Model: ForSale,
        projection: LIST_PROJECTION,
      });

      if (esResult) {
        esResult.docs.forEach(normaliseImages);
        res.setHeader('X-Cache', 'MISS');
        res.setHeader('X-Search-Source', 'elasticsearch');
        res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=300');
        res.status(200).json({ success: true, listings: esResult.docs, pagination: esResult.pagination });

        Promise.all([
          ListingCache.cacheListingList('forsale', queryKey, esResult.docs, esResult.pagination),
          ListingCache.prefetchCategoryListings('forsale', esResult.docs),
          ListingCache.cacheSearchResults('forsale', search, esResult.docs, esResult.pagination),
        ]).catch(err => logger.error('[Cache] Background cache write error:', err.message));
        return;
      }
    }

    // Build filter (MongoDB fallback)
    const filter = { status: "active" };

    if (search) {
      const trimmedSearch = String(search).slice(0, 200);
      const escapedSearch = trimmedSearch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { title: { $regex: escapedSearch, $options: "i" } },
        { description: { $regex: escapedSearch, $options: "i" } },
      ];
    }

    // NOTE: client sends the subcategory value as ?category= (via fetchCategoryListings),
    // so we filter on the `subcategory` field, not `category`.
    if (category) {
      const cats = category.split(",").map((c) => c.trim());
      filter.subcategory = { $in: cats };
    }

    if (subcategory) {
      const subs = subcategory.split(",").map((s) => s.trim());
      filter.subcategory = { $in: subs };
    }

    if (condition) {
      const conds = condition.split(",").map((c) => c.trim());
      filter.condition = { $in: conds };
    }

    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = Number(minPrice);
      if (maxPrice) filter.price.$lte = Number(maxPrice);
    }

    // Nearby geo filter + location text
    const { applyGeoFilter, buildSortOption, buildLocationRegex, applyCountryFilter } = require('../utils/geoQuery');
    if (locationFilter) {
      filter.location = buildLocationRegex(locationFilter);
    }

    applyGeoFilter(filter, lat, lng, radius);
    applyCountryFilter(filter, countryCode);

    const sortOption = buildSortOption(sort, !!(lat && lng), !!search);

    const skip = (safePage - 1) * safeLimit;

    // Optimization: On page > 1, skip the expensive countDocuments query.
    let listings, total, pagination;
    if (safePage > 1) {
      listings = await ForSale.find(filter, LIST_PROJECTION)
        .sort(sortOption)
        .skip(skip)
        .limit(safeLimit + 1)
        .populate("seller", "name profileImage")
        .lean();

      const hasNextPage = listings.length > safeLimit;
      if (hasNextPage) listings = listings.slice(0, safeLimit);

      pagination = {
        page: safePage,
        limit: safeLimit,
        hasMore: hasNextPage,
      };
    } else {
      [listings, total] = await Promise.all([
        ForSale.find(filter, LIST_PROJECTION)
          .sort(sortOption)
          .limit(safeLimit)
          .populate("seller", "name profileImage")
          .lean(),
        ForSale.countDocuments(filter),
      ]);

      pagination = {
        total,
        page: safePage,
        pages: Math.ceil(total / safeLimit),
        limit: safeLimit,
      };
    }

    // Normalise image URLs to proxy format
    listings.forEach(normaliseImages);

    // Send response FIRST, then cache in background
    res.setHeader("X-Cache", "MISS");
    res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=300");
    res.status(200).json({
      success: true,
      listings,
      pagination,
    });

    // Background cache writes (non-blocking)
    Promise.all([
      ListingCache.cacheListingList("forsale", queryKey, listings, pagination),
      ListingCache.prefetchCategoryListings("forsale", listings),
      search
        ? ListingCache.cacheSearchResults("forsale", search, listings, pagination)
        : null,
    ]).catch((err) =>
      logger.error("[Cache] Background forsale cache error:", err.message)
    );
  } catch (error) {
    logger.error("Get all forsale error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch listings",
    });
  }
};

// @desc    Get single for-sale listing by ID
// @route   GET /api/forsale/:id
// @access  Public
exports.getForSaleById = async (req, res) => {
  try {
    const param = req.params.id;
    const isObjectId = mongoose.Types.ObjectId.isValid(param);

    if (isObjectId) {
      // Check listing cache
      const cached = await ListingCache.getCachedListing("forsale", param);
      if (cached) {
        viewCounter.recordView('forsale', param);
        normaliseImages(cached);
        res.setHeader("X-Cache", "HIT");
        res.setHeader("X-Cache-Source", "listing-cache");
        return res.status(200).json({ success: true, listing: cached });
      }
    }

    const listing = isObjectId
      ? await ForSale.findById(param).populate("seller", "name profileImage createdAt")
      : await ForSale.findOne({ slug: param, status: "active" }).populate("seller", "name profileImage createdAt");

    if (!listing) {
      return res.status(404).json({
        success: false,
        message: "Listing not found",
      });
    }

    const listingId = listing._id.toString();

    // Write-back view count (buffered, flushed to DB every 30s)
    viewCounter.recordView('forsale', listingId);

    // Send response FIRST, cache in background
    const listingObj = listing.toObject ? listing.toObject() : listing;
    normaliseImages(listingObj);
    res.setHeader("X-Cache", "MISS");
    res.status(200).json({
      success: true,
      listing: listingObj,
    });

    ListingCache.cacheListing("forsale", listingObj).catch((err) =>
      logger.error("[Cache] Background forsale cache error:", err.message)
    );
  } catch (error) {
    logger.error("Get forsale by ID error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch listing",
    });
  }
};

// @desc    Update for-sale listing
// @route   PUT /api/forsale/:id
// @access  Private (owner only)
exports.updateForSale = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid listing ID format",
      });
    }

    const listing = await ForSale.findById(req.params.id);

    if (!listing) {
      return res.status(404).json({
        success: false,
        message: "Listing not found",
      });
    }

    // Check ownership
    if (listing.seller.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to update this listing",
      });
    }

    const oldListingObj = listing.toObject ? listing.toObject() : { ...listing._doc };
    const oldImages = Array.isArray(oldListingObj.images) ? oldListingObj.images : [];

    // Server-side category validation if category/subcategory is being updated
    if (req.body.category || req.body.subcategory) {
      const cat = req.body.category || listing.category;
      const sub = req.body.subcategory || listing.subcategory;
      const catError = validateCategorySubcategory(cat, sub);
      if (catError) {
        return res.status(400).json({ success: false, message: catError });
      }
    }

    const allowedUpdates = [
      "title",
      "description",
      "price",
      "category",
      "subcategory",
      "condition",
      "location",
      "phone",
      "phoneCode",
      "currency",
      "features",
      "images",
      "status",
      // Mobiles
      "brand",
      "model",
      "storage",
      "ram",
      "screenSize",
      "batteryHealth",
      "warranty",
      "color",
      // Furniture
      "material",
      "dimensions",
      "weight",
      "assemblyRequired",
      "numberOfPieces",
      // Fashion
      "size",
      "gender",
      "fabricType",
      // Books, Sports
      "author",
      "isbn",
      "publisher",
      "edition",
      "sportType",
    ];

    allowedUpdates.forEach((field) => {
      if (req.body[field] !== undefined) {
        listing[field] = req.body[field];
      }
    });

    await listing.save();

    const updated = await ForSale.findById(listing._id).populate(
      "seller",
      "name email profileImage"
    );

    const updatedObj = updated.toObject ? updated.toObject() : updated;
    const newImages = Array.isArray(updatedObj.images) ? updatedObj.images : [];
    const removedImages = oldImages.filter((url) => !newImages.includes(url));

    normaliseImages(updatedObj);

    // Keep detail page fresh immediately and remove replaced images from S3.
    try {
      await Promise.all([
        ListingCache.cacheListing("forsale", updatedObj),
        ListingCache.invalidateListCaches("forsale"),
        removedImages.length > 0 ? S3Service.deleteImagesByUrls(removedImages) : Promise.resolve(),
      ]);
    } catch (cacheErr) {
      logger.error("[Cache/Image] ForSale immediate update sync error:", cacheErr.message);
    }

    res.status(200).json({
      success: true,
      message: "Listing updated successfully",
      listing: updatedObj,
    });

    // ── Product update log ──────────────────────────────────
    logger.productLog('updated', 'forsale', updatedObj, req, {
      changes: allowedUpdates.filter(f => req.body[f] !== undefined),
    });

    // ✅ Background via RabbitMQ (non-blocking)
    publishListingUpdated({
      entity:      'forsale',
      listing:     updatedObj,
      oldListing:  oldListingObj,
      changes:     allowedUpdates.filter(f => req.body[f] !== undefined),
      userId:      req.user._id,
      ip:          req.ip,
    }).catch(() => {});

    // ✅ S3 image cleanup via queue
    if (removedImages.length > 0) {
      publishImageCleanup({ imageUrls: removedImages }).catch(() => {});
    }
  } catch (error) {
    logger.error("Update forsale error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update listing",
    });
  }
};

// @desc    Delete for-sale listing
// @route   DELETE /api/forsale/:id
// @access  Private (owner only)
exports.deleteForSale = async (req, res) => {
  try {
    if (!require('mongoose').Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid listing ID" });
    }

    const listing = await ForSale.findById(req.params.id);

    if (!listing) {
      return res.status(404).json({
        success: false,
        message: "Listing not found",
      });
    }

    // Check ownership
    if (listing.seller.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to delete this listing",
      });
    }

    await ForSale.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: "Listing deleted successfully",
    });

    // ── Product deletion log ────────────────────────────────
    logger.productLog('deleted', 'forsale', listing, req);

    // ✅ Background via RabbitMQ (non-blocking)
    publishListingDeleted({
      entity:    'forsale',
      listingId: req.params.id,
      listing,
      userId:    req.user._id,
    }).catch(() => {});

    // ✅ S3 cleanup of listing images
    if (listing.images && listing.images.length > 0) {
      publishImageCleanup({ imageUrls: listing.images }).catch(() => {});
    }
  } catch (error) {
    logger.error("Delete forsale error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete listing",
    });
  }
};

// @desc    Get my for-sale listings
// @route   GET /api/forsale/my-listings
// @access  Private
exports.getMyForSale = async (req, res) => {
  try {
    const { page, limit } = parsePagination(req.query, { limit: 20 });
    const { items, pagination } = await paginatedFind({
      model: ForSale,
      filter: { seller: req.user._id },
      populate: [{ path: 'seller', select: 'name profileImage' }],
      page,
      limit,
    });

    items.forEach(normaliseImages);

    res.status(200).json({
      success: true,
      listings: items,
      pagination,
    });
  } catch (error) {
    logger.error("Get my forsale error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch your listings",
    });
  }
};

// @desc    Upload images for for-sale listing
// @route   POST /api/forsale/upload-images
// @access  Private
exports.uploadImages = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No images provided",
      });
    }

    const S3Service = require("../services/s3.service");
    const imageUrls = [];

    for (const file of req.files) {
      const result = await S3Service.uploadListingImage(
        file.buffer,
        req.user._id.toString(),
        file.mimetype,
        "forsale" // → S3 key: forsale/{userId}/{uuid}.webp
      );
      imageUrls.push(result.imageUrl);
    }

    // Cache uploaded image URLs in Redis
    await ListingCache.cacheUploadedImages(
      "forsale",
      req.user._id.toString(),
      imageUrls
    );

    res.status(200).json({
      success: true,
      imageUrls,
    });
  } catch (error) {
    logger.error("Upload forsale images error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to upload images",
    });
  }
};

// @desc    Get saved for-sale listings for current user
// @route   GET /api/forsale/saved
// @access  Private
exports.getSavedForSale = async (req, res) => {
  try {
    const userId = req.user._id;
    const { page, limit } = parsePagination(req.query, { limit: 20 });

    // Check Redis cache first
    try {
      const savedKey = `user:${userId}:saved:forsale:p${page}:l${limit}`;
      const cached = await redis.get(savedKey);
      if (cached) {
        const parsed = typeof cached === "string" ? JSON.parse(cached) : cached;
        if (parsed.listings) parsed.listings.forEach(normaliseImages);
        res.setHeader("X-Cache", "HIT");
        return res.status(200).json({
          success: true,
          listings: parsed.listings || [],
          pagination: parsed.pagination,
        });
      }
    } catch (cacheErr) {
      logger.debug("Saved forsale cache miss:", cacheErr.message);
    }

    const { items, pagination } = await paginatedFind({
      model: ForSale,
      filter: { savedBy: userId, status: "active" },
      populate: [{ path: 'seller', select: 'name profileImage' }],
      page,
      limit,
    });

    // Store in Redis cache
    try {
      const savedKey = `user:${userId}:saved:forsale:p${page}:l${limit}`;
      await redis.setex(
        savedKey,
        600,
        JSON.stringify({
          listings: items.map((l) => ({
            _id: l._id,
            slug: l.slug,
            title: l.title,
            price: l.price,
            location: l.location,
            condition: l.condition,
            category: l.category,
            subcategory: l.subcategory,
            thumbnail: l.images?.[0] || null,
            images: l.images || [],
            sellerName: l.sellerName,
          })),
          pagination,
        })
      );
    } catch (cacheErr) {
      logger.error("[Cache] Error caching saved forsale:", cacheErr.message);
    }

    items.forEach(normaliseImages);

    res.setHeader("X-Cache", "MISS");
    res.status(200).json({
      success: true,
      listings: items,
      pagination,
    });
  } catch (error) {
    logger.error("Get saved forsale error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch saved listings",
    });
  }
};

// @desc    Toggle save/unsave a for-sale listing
// @route   POST /api/forsale/:id/toggle-save
// @access  Private
exports.toggleSave = async (req, res) => {
  try {
    const listingId = req.params.id;
    const userId = req.user._id;

    if (!require('mongoose').Types.ObjectId.isValid(listingId)) {
      return res.status(400).json({ success: false, message: "Invalid listing ID" });
    }

    // Check existence + current save state with a lean query
    const listing = await ForSale.findById(listingId).select('savedBy seller').populate('seller', 'name profileImage').lean();

    if (!listing) {
      return res.status(404).json({
        success: false,
        message: "Listing not found",
      });
    }

    const isSaved = listing.savedBy?.some((id) => id.toString() === userId.toString());

    // Atomic update: no read-modify-write race condition
    if (isSaved) {
      await ForSale.updateOne({ _id: listingId }, { $pull: { savedBy: userId } });
    } else {
      await ForSale.updateOne({ _id: listingId }, { $addToSet: { savedBy: userId } });
    }

    res.status(200).json({
      success: true,
      saved: !isSaved,
      message: isSaved ? "Listing unsaved" : "Listing saved",
    });

    // Keep click response fast: run cache work in background.
    void (async () => {
      try {
        const savedKeyBase = `user:${userId}:saved:forsale`;
        // Re-fetch updated listing for accurate cache
        const updated = await ForSale.findById(listingId).populate('seller', 'name profileImage').lean();
        await Promise.allSettled([
          redis.del(savedKeyBase),
          redis.del(`${savedKeyBase}:p1:l20`),
          updated && ListingCache.cacheListing("forsale", updated),
          ListingCache.logProductSaved("forsale", listing, userId, !isSaved),
        ]);
      } catch (cacheErr) {
        logger.error("[Cache] Error updating save cache:", cacheErr.message);
      }
    })();
  } catch (error) {
    logger.error("Toggle save forsale error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to toggle save",
    });
  }
};

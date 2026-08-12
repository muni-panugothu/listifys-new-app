const Electronics = require("../models/electronics.model.js");
const mongoose = require("mongoose");
const { logger } = require("../utils/logger");
const { parsePagination, paginatedFind } = require("../utils/pagination");
const redis = require("../config/redis");
const ListingCache = require("../services/listingcache.service.js");
const S3Service = require("../services/s3.service.js");
const viewCounter = require("../services/viewcount.service.js");
const { notifyFollowersOfNewListing } = require("../services/notifyfollowers.service.js");

// ── RabbitMQ Producers ─────────────────────────────────────────────────────────
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
const SearchService = require("../services/search.service.js");
const { esHydratedSearch } = require("../utils/esSearch");

const VALID_SUBCATEGORIES = [
  'TVs, Video - Audio',
  'Kitchen & Other Appliances',
  'Fridges',
  'Washing Machines',
  'ACs',
  'Computers & Laptops',
  'Computer Accessories',
  'Hard Disks, Printers & Monitors',
  'Cameras & Lenses',
];

// @desc    Create a new electronics listing
// @route   POST /api/electronics
// @access  Private
exports.createElectronics = async (req, res) => {
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
      // Product-specific fields
      brand,
      model,
      warranty,
      purchaseYear,
      screenSize,
      displayType,
      processor,
      ram,
      storage,
      capacity,
      energyRating,
      megapixels,
      lensType,
      // Location coordinates (optional)
      lat,
      lng,
    } = req.body;

    if (category !== 'Electronics') {
      logger.securityLog('wrong_category', {
        ip: req.ip,
        path: '/api/electronics',
        method: req.method,
        reason: `expected Electronics, received ${category}`,
        userId: req.user?._id,
      });
      return res.status(400).json({
        success: false,
        message: `This endpoint only accepts category "Electronics". Received "${category}".`,
      });
    }
    if (!VALID_SUBCATEGORIES.includes(subcategory)) {
      return res.status(400).json({
        success: false,
        message: `Invalid subcategory "${subcategory}" for Electronics. Allowed: ${VALID_SUBCATEGORIES.join(', ')}`,
      });
    }

    const listing = await Electronics.create({
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
      // Product-specific (stored only when provided)
      ...(brand && { brand }),
      ...(model && { model }),
      ...(warranty && { warranty }),
      ...(purchaseYear && { purchaseYear: Number(purchaseYear) }),
      ...(screenSize && { screenSize }),
      ...(displayType && { displayType }),
      ...(processor && { processor }),
      ...(ram && { ram }),
      ...(storage && { storage }),
      ...(capacity && { capacity }),
      ...(energyRating && { energyRating }),
      ...(megapixels && { megapixels }),
      ...(lensType && { lensType }),
      // Geo coordinates (for nearby search)
      ...(lat && lng && {
        coordinates: { type: "Point", coordinates: [Number(lng), Number(lat)] },
      }),
      seller: req.user._id,
      sellerName: req.user.firstName
        ? `${req.user.firstName} ${req.user.lastName || ""}`.trim()
        : req.user.email.split("@")[0],
    });

    const populated = await Electronics.findById(listing._id).populate(
      "seller",
      "name profileImage"
    );

    const listingObj = populated.toObject ? populated.toObject() : populated;

    normaliseImages(listingObj);

    res.status(201).json({
      success: true,
      message: "Electronics listing created successfully",
      listing: listingObj,
    });

    logger.productLog('posted', 'electronics', listingObj, req);

    // ✅ Background via RabbitMQ (non-blocking)
    publishListingCreated({
      entity:    'electronics',
      listing:   listingObj,
      userId:    req.user._id,
      ip:        req.ip,
      userAgent: req.get('user-agent'),
    }).catch(() => {});
  } catch (error) {
    logger.error("Create electronics error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create electronics listing",
    });
  }
};

// @desc    Get all electronics listings (public)
// @route   GET /api/electronics
// @access  Public
exports.getAllElectronics = async (req, res) => {
  try {
    const {
      search,
      category,
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

    // Build a cache key from the query params
    const queryKey = [
      search || '',
      category || '',
      condition || '',
      minPrice || '',
      maxPrice || '',
      sort || 'newest',
      locationFilter || '',
      lat || '',
      lng || '',
      radius || '',
      countryCode || '',
      page,
      limit,
    ].join('|');

    // Check listing cache first
    const cached = await ListingCache.getCachedListingList('electronics', queryKey);
    if (cached) {
      if (cached.listings) cached.listings.forEach(normaliseImages);
      res.setHeader('X-Cache', 'HIT');
      res.setHeader('X-Cache-Source', 'listing-cache');
      res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
      return res.status(200).json({
        success: true,
        listings: cached.listings,
        pagination: cached.pagination,
      });
    }

    // ── Elasticsearch-first search (MongoDB regex fallback below) ──
    if (search && !(lat && lng)) {
      const esResult = await esHydratedSearch({
        entity: 'electronics',
        searchParams: { query: search, category, condition, minPrice, maxPrice, location: locationFilter, sort, page: safePage, limit: safeLimit },
        Model: Electronics,
        projection: LIST_PROJECTION,
      });

      if (esResult) {
        esResult.docs.forEach(normaliseImages);
        res.setHeader('X-Cache', 'MISS');
        res.setHeader('X-Search-Source', 'elasticsearch');
        res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=300');
        res.status(200).json({ success: true, listings: esResult.docs, pagination: esResult.pagination });

        Promise.all([
          ListingCache.cacheListingList('electronics', queryKey, esResult.docs, esResult.pagination),
          ListingCache.prefetchCategoryListings('electronics', esResult.docs),
          ListingCache.cacheSearchResults('electronics', search, esResult.docs, esResult.pagination),
        ]).catch(err => logger.error('[Cache] Background cache write error:', err.message));
        return;
      }
    }

    // Build filter (MongoDB fallback)
    const filter = { status: "active" };

    if (search) {
      const escapedSearch = String(search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { title: { $regex: escapedSearch, $options: "i" } },
        { description: { $regex: escapedSearch, $options: "i" } },
      ];
    }

    if (category) {
      // Support comma-separated categories
      const cats = category.split(",").map((c) => c.trim());
      filter.subcategory = { $in: cats };
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

    // Geo filter + location text
    const { applyGeoFilter, buildSortOption, buildLocationRegex, applyCountryFilter } = require('../utils/geoQuery');
    if (locationFilter) {
      filter.location = buildLocationRegex(locationFilter);
    }

    applyGeoFilter(filter, lat, lng, radius);
    applyCountryFilter(filter, countryCode);

    // Build sort
    const sortOption = buildSortOption(sort, !!(lat && lng), !!search);

    const skip = (safePage - 1) * safeLimit;

    // Optimization: On page > 1, skip the expensive countDocuments query.
    // Instead, fetch limit+1 items — if we get limit+1, there's a next page.
    // This avoids a full collection scan on every scroll page load.
    let listings, total, pagination;
    if (safePage > 1) {
      listings = await Electronics.find(filter, LIST_PROJECTION)
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
        Electronics.find(filter, LIST_PROJECTION)
          .sort(sortOption)
          .limit(safeLimit)
          .populate("seller", "name profileImage")
          .lean(),
        Electronics.countDocuments(filter),
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

    // Send response FIRST, then cache in background (non-blocking)
    res.setHeader('X-Cache', 'MISS');
    res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=300');
    res.status(200).json({
      success: true,
      listings,
      pagination,
    });

    Promise.all([
      ListingCache.cacheListingList('electronics', queryKey, listings, pagination),
      ListingCache.prefetchCategoryListings('electronics', listings),
      search ? ListingCache.cacheSearchResults('electronics', search, listings, pagination) : null,
    ]).catch((err) => logger.error('[Cache] Background cache write error:', err.message));
  } catch (error) {
    logger.error("Get all electronics error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch electronics listings",
    });
  }
};

// @desc    Get single electronics listing by ID
// @route   GET /api/electronics/:id
// @access  Public
exports.getElectronicsById = async (req, res) => {
  try {
    const param = req.params.id;
    const isObjectId = mongoose.Types.ObjectId.isValid(param);

    // Check listing cache first (only for ObjectId lookups)
    if (isObjectId) {
      const cached = await ListingCache.getCachedListing('electronics', param);
      if (cached) {
        viewCounter.recordView('electronics', param);
        normaliseImages(cached);
        res.setHeader('X-Cache', 'HIT');
        res.setHeader('X-Cache-Source', 'listing-cache');
        return res.status(200).json({ success: true, listing: cached });
      }
    }

    const listing = isObjectId
      ? await Electronics.findById(param).populate("seller", "name profileImage createdAt")
      : await Electronics.findOne({ slug: param, status: "active" }).populate("seller", "name profileImage createdAt");

    if (!listing) {
      return res.status(404).json({
        success: false,
        message: "Electronics listing not found",
      });
    }

    const listingId = listing._id.toString();

    // Write-back view count (buffered, flushed to DB every 30s)
    viewCounter.recordView('electronics', listingId);

    // Send response FIRST, cache in background
    const listingObj = listing.toObject ? listing.toObject() : listing;
    normaliseImages(listingObj);
    res.setHeader('X-Cache', 'MISS');
    res.status(200).json({
      success: true,
      listing: listingObj,
    });

    // Cache in background (non-blocking)
    ListingCache.cacheListing('electronics', listingObj)
      .catch((err) => logger.error('[Cache] Background cache error:', err.message));
  } catch (error) {
    logger.error("Get electronics by ID error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch electronics listing",
    });
  }
};

// @desc    Update electronics listing
// @route   PUT /api/electronics/:id
// @access  Private (owner only)
exports.updateElectronics = async (req, res) => {
  try {
    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid listing ID format",
      });
    }

    const listing = await Electronics.findById(req.params.id);

    if (!listing) {
      return res.status(404).json({
        success: false,
        message: "Electronics listing not found",
      });
    }

    // Check ownership
    if (listing.seller.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to update this listing",
      });
    }

    // Capture old listing before applying updates (for edit tracking + old image cleanup)
    const oldListingObj = listing.toObject ? listing.toObject() : { ...listing._doc };
    const oldImages = Array.isArray(oldListingObj.images) ? oldListingObj.images : [];

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
      "brand",
      "model",
      "warranty",
      "purchaseYear",
      "screenSize",
      "displayType",
      "processor",
      "ram",
      "storage",
      "capacity",
      "energyRating",
      "megapixels",
      "lensType",
    ];

    allowedUpdates.forEach((field) => {
      if (req.body[field] !== undefined) {
        listing[field] = req.body[field];
      }
    });

    await listing.save();

    const updated = await Electronics.findById(listing._id).populate(
      "seller",
      "name profileImage"
    );

    // Update cache with new data
    const updatedObj = updated.toObject ? updated.toObject() : updated;
    const newImages = Array.isArray(updatedObj.images) ? updatedObj.images : [];
    const removedImages = oldImages.filter((url) => !newImages.includes(url));

    normaliseImages(updatedObj);

    try {
      await Promise.all([
        ListingCache.cacheListing('electronics', updatedObj),
        ListingCache.invalidateListCaches('electronics'),
        removedImages.length > 0 ? S3Service.deleteImagesByUrls(removedImages) : Promise.resolve(),
      ]);
    } catch (cacheErr) {
      logger.error('[Cache/Image] Electronics immediate update sync error:', cacheErr.message);
    }

    res.status(200).json({
      success: true,
      message: "Electronics listing updated successfully",
      listing: updatedObj,
    });

    logger.productLog('updated', 'electronics', updatedObj, req, {
      changes: allowedUpdates.filter(f => req.body[f] !== undefined),
    });

    // ✅ Background via RabbitMQ (non-blocking)
    publishListingUpdated({
      entity:     'electronics',
      listing:    updatedObj,
      oldListing: oldListingObj,
      changes:    allowedUpdates.filter(f => req.body[f] !== undefined),
      userId:     req.user._id,
      ip:         req.ip,
    }).catch(() => {});

    if (removedImages.length > 0) {
      publishImageCleanup({ imageUrls: removedImages }).catch(() => {});
    }
  } catch (error) {
    logger.error("Update electronics error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update electronics listing",
    });
  }
};

// @desc    Delete electronics listing
// @route   DELETE /api/electronics/:id
// @access  Private (owner only)
exports.deleteElectronics = async (req, res) => {
  try {
    if (!require('mongoose').Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid listing ID" });
    }

    const listing = await Electronics.findById(req.params.id);

    if (!listing) {
      return res.status(404).json({
        success: false,
        message: "Electronics listing not found",
      });
    }

    // Check ownership
    if (listing.seller.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to delete this listing",
      });
    }

    await Electronics.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: "Electronics listing deleted successfully",
    });

    
    logger.productLog('deleted', 'electronics', listing, req);

    // ✅ Background via RabbitMQ (non-blocking)
    publishListingDeleted({
      entity:    'electronics',
      listingId: req.params.id,
      listing,
      userId:    req.user._id,
    }).catch(() => {});

    if (listing.images && listing.images.length > 0) {
      publishImageCleanup({ imageUrls: listing.images }).catch(() => {});
    }
  } catch (error) {
    logger.error("Delete electronics error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete electronics listing",
    });
  }
};

// @desc    Get my electronics listings
// @route   GET /api/electronics/my-listings
// @access  Private
exports.getMyElectronics = async (req, res) => {
  try {
    const { page, limit } = parsePagination(req.query, { limit: 20 });
    const { items, pagination } = await paginatedFind({
      model: Electronics,
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
    logger.error("Get my electronics error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch your electronics listings",
    });
  }
};

// @desc    Upload images for electronics listing
// @route   POST /api/electronics/upload-images
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

    // Upload images to S3
    for (const file of req.files) {
      const result = await S3Service.uploadListingImage(
        file.buffer,
        req.user._id.toString(),
        file.mimetype,
        'electronics'
      );
      imageUrls.push(result.imageUrl);
    }

    // Cache the uploaded image URLs in Redis (visible in Upstash dashboard)
    await ListingCache.cacheUploadedImages('electronics', req.user._id.toString(), imageUrls);

    res.status(200).json({
      success: true,
      imageUrls,
    });
  } catch (error) {
    logger.error("Upload electronics images error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to upload images",
    });
  }
};

// @desc    Toggle save/unsave an electronics listing
// @route   POST /api/electronics/:id/toggle-save
// @access  Private
// @desc    Get saved electronics for current user
// @route   GET /api/electronics/saved
// @access  Private
exports.getSavedElectronics = async (req, res) => {
  try {
    const userId = req.user._id;
    const { page, limit } = parsePagination(req.query, { limit: 20 });

    // Check Redis cache first (visible in Upstash dashboard)
    try {
      const savedKey = `user:${userId}:saved:electronics:p${page}:l${limit}`;
      const cached = await redis.get(savedKey);
      if (cached) {
        const parsed = typeof cached === 'string' ? JSON.parse(cached) : cached;
        if (parsed.listings) parsed.listings.forEach(normaliseImages);
        res.setHeader('X-Cache', 'HIT');
        return res.status(200).json({
          success: true,
          listings: parsed.listings || [],
          pagination: parsed.pagination,
        });
      }
    } catch (cacheErr) {
      logger.debug('Saved electronics cache miss:', cacheErr.message);
    }

    const filter = { savedBy: userId, status: "active" };
    const { items, pagination } = await paginatedFind({
      model: Electronics,
      filter,
      populate: [{ path: 'seller', select: 'name profileImage' }],
      page,
      limit,
    });

    // Store in Redis cache for next time
    try {
      const savedKey = `user:${userId}:saved:electronics:p${page}:l${limit}`;
      await redis.setex(savedKey, 600, JSON.stringify({
        listings: items.map(l => ({
          _id: l._id,
          slug: l.slug,
          title: l.title,
          price: l.price,
          location: l.location,
          condition: l.condition,
          thumbnail: l.images?.[0] || null,
          images: l.images || [],
          sellerName: l.sellerName,
        })),
        pagination,
      }));
    } catch (cacheErr) {
      logger.error('[Cache] Error caching saved electronics:', cacheErr.message);
    }

    items.forEach(normaliseImages);

    res.setHeader('X-Cache', 'MISS');
    res.status(200).json({
      success: true,
      listings: items,
      pagination,
    });
  } catch (error) {
    logger.error("Get saved electronics error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch saved electronics",
    });
  }
};

// @desc    Toggle save/unsave an electronics listing
// @route   POST /api/electronics/:id/toggle-save
// @access  Private
exports.toggleSave = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid listing ID",
      });
    }

    const listing = await Electronics.findById(req.params.id)
      .populate("seller", "name profileImage")
      .lean();

    if (!listing) {
      return res.status(404).json({
        success: false,
        message: "Electronics listing not found",
      });
    }

    const userId = String(req.user?._id || req.user?.id);

    const unsaveResult = await Electronics.updateOne(
      { _id: req.params.id, savedBy: userId },
      { $pull: { savedBy: userId } },
    );

    let saved;
    if (unsaveResult.modifiedCount > 0) {
      saved = false;
    } else {
      const saveResult = await Electronics.updateOne(
        { _id: req.params.id, savedBy: { $ne: userId } },
        { $addToSet: { savedBy: userId } },
      );

      if (saveResult.modifiedCount > 0) {
        saved = true;
      } else {
        const stillSaved = await Electronics.exists({ _id: req.params.id, savedBy: userId });
        saved = Boolean(stillSaved);
      }
    }

    const updatedListing = await Electronics.findById(req.params.id)
      .populate("seller", "name profileImage")
      .lean();

    res.status(200).json({
      success: true,
      saved,
      message: saved ? "Listing saved" : "Listing unsaved",
    });

    // Keep click response fast: run cache work in background.
    void (async () => {
      try {
        const listingObj = updatedListing || listing;
        const savedKeyBase = `user:${userId}:saved:electronics`;
        await Promise.allSettled([
          redis.del(savedKeyBase),
          redis.del(`${savedKeyBase}:p1:l20`),
          ListingCache.cacheListing('electronics', listingObj),
          ListingCache.logProductSaved('electronics', listingObj, userId, saved),
        ]);
      } catch (cacheErr) {
        logger.error('[Cache] Error updating save cache:', cacheErr.message);
      }
    })();
  } catch (error) {
    logger.error("Toggle save error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to toggle save",
    });
  }
};
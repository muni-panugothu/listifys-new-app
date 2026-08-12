const Vehicle = require("../models/vehicle.model");
const mongoose = require("mongoose");
const { logger } = require("../utils/logger");
const { parsePagination, paginatedFind } = require("../utils/pagination");
const redis = require("../config/redis");
const ListingCache = require("../services/listingcache.service");
const S3Service = require("../services/s3.service");
const viewCounter = require("../services/viewcount.service");
const { notifyFollowersOfNewListing } = require("../services/notifyfollowers.service");

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
  brand: 1, model: 1, year: 1, fuelType: 1, transmission: 1,
  kmDriven: 1, mileageUnit: 1, ownership: 1, coordinates: 1,
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
const SearchService = require("../services/search.service");
const { esHydratedSearch } = require("../utils/esSearch");

const VALID_SUBCATEGORIES = ['Cars', 'Bikes', 'Cycle', 'Spare Parts'];

// @desc    Create a new vehicle listing
// @route   POST /api/vehicles
// @access  Private
exports.createVehicle = async (req, res) => {
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
      brand,
      model,
      variant,
      year,
      kmDriven,
      mileageUnit,
      fuelType,
      transmission,
      ownership,
      color,
      engineCC,
      cycleType,
      gearCount,
      frameSize,
      compatibleVehicle,
      partCategory,
      // Location coordinates (optional)
      lat,
      lng,
    } = req.body;

        if (category !== 'Vehicles') {
      logger.securityLog('wrong_category', {
        ip: req.ip,
        path: '/api/vehicles',
        method: req.method,
        reason: `expected Vehicles, received ${category}`,
        userId: req.user?._id,
      });
      return res.status(400).json({
        success: false,
        message: `This endpoint only accepts category "Vehicles". Received "${category}".`,
      });
    }
    if (!VALID_SUBCATEGORIES.includes(subcategory)) {
      return res.status(400).json({
        success: false,
        message: `Invalid subcategory "${subcategory}" for Vehicles. Allowed: ${VALID_SUBCATEGORIES.join(', ')}`,
      });
    }

    const listing = await Vehicle.create({
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
      brand,
      model,
      variant,
      year,
      kmDriven,
      mileageUnit: mileageUnit === "mi" ? "mi" : "km",
      fuelType,
      transmission,
      ownership,
      color,
      engineCC,
      cycleType,
      gearCount,
      frameSize,
      compatibleVehicle,
      partCategory,
      // Geo coordinates (for nearby search)
      ...(lat && lng && isFinite(Number(lat)) && isFinite(Number(lng)) && {
        coordinates: { type: "Point", coordinates: [Number(lng), Number(lat)] },
      }),
      seller: req.user._id,
      sellerName: req.user.name || (req.user.email ? req.user.email.split("@")[0] : "User"),
    });

    const populated = await Vehicle.findById(listing._id).populate(
      "seller",
      "name email profileImage"
    );

        const listingObj = populated.toObject ? populated.toObject() : populated;

    normaliseImages(listingObj);

    res.status(201).json({
      success: true,
      message: "Vehicle listing created successfully",
      listing: listingObj,
    });

        logger.productLog('posted', 'vehicles', listingObj, req, {
      brand, model, year, fuelType, transmission, ownership,
    });

    // ✅ Background via RabbitMQ (non-blocking)
    publishListingCreated({
      entity:    'vehicles',
      listing:   listingObj,
      userId:    req.user._id,
      ip:        req.ip,
      userAgent: req.get('user-agent'),
    }).catch(() => {});
  } catch (error) {
    logger.error("Create vehicle error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create vehicle listing",
    });
  }
};

// @desc    Get all vehicle listings (public)
// @route   GET /api/vehicles
// @access  Public
exports.getAllVehicles = async (req, res) => {
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

    // Build cache key from query params
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
    const cached = await ListingCache.getCachedListingList('vehicles', queryKey);
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
        entity: 'vehicles',
        searchParams: { query: search, category, condition, minPrice, maxPrice, location: locationFilter, sort, page: safePage, limit: safeLimit },
        Model: Vehicle,
        projection: LIST_PROJECTION,
      });

      if (esResult) {
        esResult.docs.forEach(normaliseImages);
        res.setHeader('X-Cache', 'MISS');
        res.setHeader('X-Search-Source', 'elasticsearch');
        res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=300');
        res.status(200).json({ success: true, listings: esResult.docs, pagination: esResult.pagination });

        Promise.all([
          ListingCache.cacheListingList('vehicles', queryKey, esResult.docs, esResult.pagination),
          ListingCache.prefetchCategoryListings('vehicles', esResult.docs),
          ListingCache.cacheSearchResults('vehicles', search, esResult.docs, esResult.pagination),
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

    if (category) {
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
    let listings, total, pagination;
    if (safePage > 1) {
      listings = await Vehicle.find(filter, LIST_PROJECTION)
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
        Vehicle.find(filter, LIST_PROJECTION)
          .sort(sortOption)
          .limit(safeLimit)
          .populate("seller", "name profileImage")
          .lean(),
        Vehicle.countDocuments(filter),
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

        // Background cache writes (non-blocking)
    Promise.all([
      ListingCache.cacheListingList('vehicles', queryKey, listings, pagination),
      ListingCache.prefetchCategoryListings('vehicles', listings),
      search ? ListingCache.cacheSearchResults('vehicles', search, listings, pagination) : null,
    ]).catch((err) => logger.error('[Cache] Background cache write error:', err.message));
  } catch (error) {
    logger.error("Get all vehicles error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch vehicle listings",
    });
  }
};

// @desc    Get single vehicle listing by ID
// @route   GET /api/vehicles/:id
// @access  Public
exports.getVehicleById = async (req, res) => {
  try {
    const param = req.params.id;
    const isObjectId = mongoose.Types.ObjectId.isValid(param);

    // Check listing cache first (only for ObjectId lookups)
    if (isObjectId) {
      const cached = await ListingCache.getCachedListing('vehicles', param);
      if (cached) {
        viewCounter.recordView('vehicles', param);
        normaliseImages(cached);
        res.setHeader('X-Cache', 'HIT');
        res.setHeader('X-Cache-Source', 'listing-cache');
        return res.status(200).json({ success: true, listing: cached });
      }
    }

    const listing = isObjectId
      ? await Vehicle.findById(param).populate("seller", "name profileImage createdAt")
      : await Vehicle.findOne({ slug: param, status: "active" }).populate("seller", "name profileImage createdAt");

    if (!listing) {
      return res.status(404).json({
        success: false,
        message: "Vehicle listing not found",
      });
    }

    const listingId = listing._id.toString();

    // Write-back view count (buffered, flushed to DB every 30s)
    viewCounter.recordView('vehicles', listingId);

    // Send response FIRST, cache in background
    const listingObj = listing.toObject ? listing.toObject() : listing;
    normaliseImages(listingObj);
    res.setHeader('X-Cache', 'MISS');
    res.status(200).json({
      success: true,
      listing: listingObj,
    });

    // Cache in background (non-blocking)
    ListingCache.cacheListing('vehicles', listingObj)
      .catch((err) => logger.error('[Cache] Background cache error:', err.message));
  } catch (error) {
    logger.error("Get vehicle by ID error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch vehicle listing",
    });
  }
};

// @desc    Update vehicle listing
// @route   PUT /api/vehicles/:id
// @access  Private (owner only)
exports.updateVehicle = async (req, res) => {
  try {
    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid listing ID format",
      });
    }

    const listing = await Vehicle.findById(req.params.id);

    if (!listing) {
      return res.status(404).json({
        success: false,
        message: "Vehicle listing not found",
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
      "variant",
      "year",
      "kmDriven",
      "mileageUnit",
      "fuelType",
      "transmission",
      "ownership",
      "color",
      "engineCC",
      "cycleType",
      "gearCount",
      "frameSize",
      "compatibleVehicle",
      "partCategory",
    ];

    allowedUpdates.forEach((field) => {
      if (req.body[field] !== undefined) {
        listing[field] = req.body[field];
      }
    });

    await listing.save();

    const updated = await Vehicle.findById(listing._id).populate(
      "seller",
      "name email profileImage"
    );

    // Update cache with new data
    const updatedObj = updated.toObject ? updated.toObject() : updated;
    const newImages = Array.isArray(updatedObj.images) ? updatedObj.images : [];
    const removedImages = oldImages.filter((url) => !newImages.includes(url));

    normaliseImages(updatedObj);

        try {
      await Promise.all([
        ListingCache.cacheListing('vehicles', updatedObj),
        ListingCache.invalidateListCaches('vehicles'),
        removedImages.length > 0 ? S3Service.deleteImagesByUrls(removedImages) : Promise.resolve(),
      ]);
    } catch (cacheErr) {
      logger.error('[Cache/Image] Vehicle immediate update sync error:', cacheErr.message);
    }

    res.status(200).json({
      success: true,
      message: "Vehicle listing updated successfully",
      listing: updatedObj,
    });

        logger.productLog('updated', 'vehicles', updatedObj, req, {
      changes: allowedUpdates.filter(f => req.body[f] !== undefined),
    });

    // ✅ Background via RabbitMQ (non-blocking)
    publishListingUpdated({
      entity:     'vehicles',
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
    logger.error("Update vehicle error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update vehicle listing",
    });
  }
};

// @desc    Delete vehicle listing
// @route   DELETE /api/vehicles/:id
// @access  Private (owner only)
exports.deleteVehicle = async (req, res) => {
  try {
    if (!require('mongoose').Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid listing ID" });
    }

    const listing = await Vehicle.findById(req.params.id);

    if (!listing) {
      return res.status(404).json({
        success: false,
        message: "Vehicle listing not found",
      });
    }

    // Check ownership
    if (listing.seller.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to delete this listing",
      });
    }

    await Vehicle.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: "Vehicle listing deleted successfully",
    });

        logger.productLog('deleted', 'vehicles', listing, req);

    // ✅ Background via RabbitMQ (non-blocking)
    publishListingDeleted({
      entity:    'vehicles',
      listingId: req.params.id,
      listing,
      userId:    req.user._id,
    }).catch(() => {});

    if (listing.images && listing.images.length > 0) {
      publishImageCleanup({ imageUrls: listing.images }).catch(() => {});
    }
  } catch (error) {
    logger.error("Delete vehicle error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete vehicle listing",
    });
  }
};

// @desc    Get my vehicle listings
// @route   GET /api/vehicles/my-listings
// @access  Private
exports.getMyVehicles = async (req, res) => {
  try {
    const { page, limit } = parsePagination(req.query, { limit: 20 });
    const { items, pagination } = await paginatedFind({
      model: Vehicle,
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
    logger.error("Get my vehicles error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch your vehicle listings",
    });
  }
};

// @desc    Upload images for vehicle listing
// @route   POST /api/vehicles/upload-images
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
        'vehicles'  // → S3 key: vehicles/{userId}/{uuid}.webp
      );
      imageUrls.push(result.imageUrl);
    }

        await ListingCache.cacheUploadedImages('vehicles', req.user._id.toString(), imageUrls);

    res.status(200).json({
      success: true,
      imageUrls,
    });
  } catch (error) {
    logger.error("Upload vehicle images error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to upload images",
    });
  }
};

// @desc    Get saved vehicles for current user
// @route   GET /api/vehicles/saved
// @access  Private
exports.getSavedVehicles = async (req, res) => {
  try {
    const userId = req.user._id;
    const { page, limit } = parsePagination(req.query, { limit: 20 });

    // Check Redis cache first
    try {
      const savedKey = `user:${userId}:saved:vehicles:p${page}:l${limit}`;
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
      logger.debug('Saved vehicles cache miss:', cacheErr.message);
    }

    const { items, pagination } = await paginatedFind({
      model: Vehicle,
      filter: { savedBy: userId, status: "active" },
      populate: [{ path: 'seller', select: 'name profileImage' }],
      page,
      limit,
    });

    // Store in Redis cache for next time
    try {
      const savedKey = `user:${userId}:saved:vehicles:p${page}:l${limit}`;
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
          brand: l.brand,
          model: l.model,
          year: l.year,
        })),
        pagination,
      }));
    } catch (cacheErr) {
      logger.error('[Cache] Error caching saved vehicles:', cacheErr.message);
    }

    items.forEach(normaliseImages);

    res.setHeader('X-Cache', 'MISS');
    res.status(200).json({
      success: true,
      listings: items,
      pagination,
    });
  } catch (error) {
    logger.error("Get saved vehicles error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch saved vehicles",
    });
  }
};

// @desc    Toggle save/unsave a vehicle listing
// @route   POST /api/vehicles/:id/toggle-save
// @access  Private
exports.toggleSave = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid listing ID format" });
    }

    const userId = req.user._id;
    const listing = await Vehicle.findById(req.params.id).select('savedBy').lean();
    if (!listing) {
      return res.status(404).json({
        success: false,
        message: "Vehicle listing not found",
      });
    }

    const isSaved = listing.savedBy?.some((id) => id.toString() === userId.toString());

    if (isSaved) {
      await Vehicle.updateOne({ _id: req.params.id }, { $pull: { savedBy: userId } });
    } else {
      await Vehicle.updateOne({ _id: req.params.id }, { $addToSet: { savedBy: userId } });
    }

    res.status(200).json({
      success: true,
      saved: !isSaved,
      message: isSaved ? "Listing unsaved" : "Listing saved",
    });

    // Keep click response fast: run cache work in background.
    void (async () => {
      try {
        const savedKeyBase = `user:${userId}:saved:vehicles`;
        await Promise.allSettled([
          redis.del(savedKeyBase),
          redis.del(`${savedKeyBase}:p1:l20`),
          ListingCache.invalidateListingCache('vehicles', req.params.id),
          ListingCache.logProductSaved('vehicles', listing, userId, !isSaved),
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

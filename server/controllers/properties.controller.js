const Property = require("../models/property.model.js");
const mongoose = require("mongoose");
const { logger } = require("../utils/logger");
const { parsePagination, paginatedFind } = require("../utils/pagination");
const S3Service = require("../services/s3.service.js");
const ListingCache = require("../services/listingcache.service.js");
const { esHydratedSearch } = require("../utils/esSearch");
const redis = require("../config/redis");

// ── RabbitMQ Producers ─────────────────────────────────────────────────────────
const {
  publishListingCreated,
  publishListingUpdated,
  publishListingDeleted,
  publishImageCleanup,
} = require('../queues/producers/listing.producer');

const LIST_PROJECTION = { currency: 1, slug: 1,
  title: 1,
  description: 1,
  price: 1,
  location: 1,
  category: 1,
  subcategory: 1,
  images: 1,
  sellerName: 1,
  seller: 1,
  views: 1,
  features: 1,
  phone: 1,
  status: 1,
  savedBy: 1,
  createdAt: 1,
  bedrooms: 1,
  bathrooms: 1,
  furnishing: 1,
  squareFeet: 1,
  availableFrom: 1,
  petFriendly: 1,
  genderPreference: 1,
  occupancy: 1,
  coordinates: 1,
  countryCode: 1,
};

const normaliseImages = (listing) => {
  if (!listing) return listing;
  if (listing.images) {
    listing.images = listing.images.map((url) => S3Service.toProxyUrl(url));
  }
  if (listing.seller?.profileImage) {
    listing.seller.profileImage = S3Service.toProxyUrl(listing.seller.profileImage);
  }
  return listing;
};

exports.createProperty = async (req, res) => {
  try {
    const {
      title,
      description,
      price,
      category,
      subcategory,
      location,
      phone,
      phoneCode,
      currency,
      countryCode,
      features,
      images,
      videos,
      bedrooms,
      bathrooms,
      furnishing,
      squareFeet,
      availableFrom,
      genderPreference,
      occupancy,
      petFriendly,
      lat,
      lng,
    } = req.body;

    if (!["Properties", "Rentals", "Roommates"].includes(category)) {
      logger.securityLog("wrong_category", {
        ip: req.ip,
        path: "/api/properties",
        method: req.method,
        reason: `expected Properties-compatible category, received ${category}`,
        userId: req.user?._id,
      });
      return res.status(400).json({
        success: false,
        message: "Invalid category. Must be Properties",
      });
    }

    let coordinates = { type: "Point", coordinates: [0, 0] };
    if (lat !== undefined && lng !== undefined && lat !== "" && lng !== "") {
      const pLat = parseFloat(lat);
      const pLng = parseFloat(lng);
      if (!isNaN(pLat) && !isNaN(pLng)) {
        coordinates.coordinates = [pLng, pLat];
      }
    }

    const newProperty = new Property({
      title,
      description,
      price: Number(price),
      category,
      subcategory,
      location,
      phone,
      phoneCode,
      currency,
      countryCode,
      features,
      images,
      videos: videos || [],
      bedrooms: bedrooms ? Number(bedrooms) : undefined,
      bathrooms: bathrooms ? Number(bathrooms) : undefined,
      furnishing,
      squareFeet: squareFeet ? Number(squareFeet) : undefined,
      availableFrom,
      genderPreference,
      occupancy,
      petFriendly: petFriendly === "true" || petFriendly === true,
      coordinates,
      seller: req.user._id,
      sellerName: req.user.username || req.user.name || "Unknown Seller",
    });

    const savedProperty = await newProperty.save();

    // Fire & Forget: Background Tasks via RabbitMQ
    publishListingCreated({
      entity: 'properties',
      listing: savedProperty.toObject(),
      userId: req.user._id,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    }).catch(() => {});

    normaliseImages(savedProperty);

    return res.status(201).json({
      success: true,
      message: `${category} listing created successfully`,
      listing: savedProperty,
    });
  } catch (error) {
    logger.error("Error creating property listing:", {
      error: error.message,
      stack: error.stack,
      userId: req.user?._id,
      category: req.body?.category,
    });
    return res.status(500).json({
      success: false,
      message: "An error occurred while creating listing",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

exports.getProperties = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 12,
      search,
      category,
      subcategory,
      sort = "newest",
      minPrice,
      maxPrice,
      sellerId,
      lat,
      lng,
      radius = 50,
      countryCode,
    } = req.query;

    const query = { status: "active" };
    if (category) {
      query.category = category;
    }
    if (subcategory) query.subcategory = subcategory;
    if (sellerId) query.seller = sellerId;
    const { applyGeoFilter, buildSortOption, escapeRegex, applyCountryFilter } = require('../utils/geoQuery');

    // ── Elasticsearch-first search (MongoDB regex fallback below) ──
    if (search && !(lat && lng)) {
      const pageNumber = Math.max(1, parseInt(page, 10));
      const limitNumber = Math.max(1, Math.min(parseInt(limit, 10), 100));
      const esResult = await esHydratedSearch({
        entity: 'properties',
        searchParams: { query: search, category: subcategory, minPrice, maxPrice, sort, page: pageNumber, limit: limitNumber },
        Model: Property,
        projection: LIST_PROJECTION,
        populate: [],
      });

      if (esResult) {
        esResult.docs.forEach(normaliseImages);
        res.setHeader('X-Search-Source', 'elasticsearch');
        return res.status(200).json({
          success: true,
          listings: esResult.docs,
          pagination: esResult.pagination,
        });
      }
    }

    if (search) {
      query.$or = [
        { title: { $regex: escapeRegex(search), $options: "i" } },
        { location: { $regex: escapeRegex(search), $options: "i" } },
        { description: { $regex: escapeRegex(search), $options: "i" } },
      ];
    }
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = Number(minPrice);
      if (maxPrice) query.price.$lte = Number(maxPrice);
    }
    applyGeoFilter(query, lat, lng, radius);
    applyCountryFilter(query, countryCode);

    const sortOption = buildSortOption(sort, !!(lat && lng), !!search);

    const pageNumber = Math.max(1, parseInt(page, 10));
    const limitNumber = Math.max(1, Math.min(parseInt(limit, 10), 100));
    const skip = (pageNumber - 1) * limitNumber;

    // Optimisation: page > 1 skips expensive countDocuments.
    // Fetch limit+1 rows — if we get limit+1, there's a next page.
    let listings, total, pagination;

    if (pageNumber > 1) {
      listings = await Property.find(query)
        .select(LIST_PROJECTION)
        .sort(sortOption)
        .skip(skip)
        .limit(limitNumber + 1)
        .lean();

      const hasMore = listings.length > limitNumber;
      if (hasMore) listings = listings.slice(0, limitNumber);

      pagination = { page: pageNumber, limit: limitNumber, hasMore };
    } else {
      [listings, total] = await Promise.all([
        Property.find(query)
          .select(LIST_PROJECTION)
          .sort(sortOption)
          .limit(limitNumber)
          .lean(),
        Property.countDocuments(query),
      ]);

      pagination = {
        page: pageNumber,
        limit: limitNumber,
        total,
        totalPages: Math.ceil(total / limitNumber),
        hasMore: limitNumber < total,
      };
    }

    listings.forEach(normaliseImages);

    return res.status(200).json({
      success: true,
      listings,
      pagination,
    });
  } catch (error) {
    logger.error("Error fetching properties:", error);
    return res.status(500).json({ success: false, message: "Error fetching listings" });
  }
};

exports.getPropertyById = async (req, res) => {
  try {
    const param = req.params.id;
    const isObjectId = mongoose.isValidObjectId(param);

    const listing = isObjectId
      ? await Property.findById(param)
          .populate("seller", "name username profileImage joinedDate location isVerified phone")
          .lean()
      : await Property.findOne({ slug: param, status: "active" })
          .populate("seller", "name username profileImage joinedDate location isVerified phone")
          .lean();

    if (!listing) {
      return res.status(404).json({ success: false, message: "Listing not found" });
    }

    // views update handled separatedly if needed
    normaliseImages(listing);

    return res.status(200).json({ success: true, listing });
  } catch (error) {
    logger.error("Error in getPropertyById:", error);
    return res.status(500).json({ success: false, message: "Error fetching listing details" });
  }
};

// @desc    Upload images for Rentals / Roommates properties
// @route   POST /api/properties/upload-images
// @access  Private
exports.uploadImages = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No images provided",
      });
    }

    const userId = req.user._id.toString();
    const imageUrls = [];

    for (const file of req.files) {
      const result = await S3Service.uploadListingImage(
        file.buffer,
        userId,
        file.mimetype,
        "properties",
      );
      imageUrls.push(result.imageUrl);
    }

    // Cache uploaded image URLs in Redis / Upstash for observability
    await ListingCache.cacheUploadedImages("properties", userId, imageUrls);

    return res.status(200).json({
      success: true,
      imageUrls,
    });
  } catch (error) {
    logger.error("Upload property images error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to upload images",
    });
  }
};

exports.updateProperty = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid ID" });
    }

    let coordinates;
    if (req.body.lat !== undefined && req.body.lng !== undefined) {
      const pLat = parseFloat(req.body.lat);
      const pLng = parseFloat(req.body.lng);
      if (!isNaN(pLat) && !isNaN(pLng)) {
        coordinates = { type: "Point", coordinates: [pLng, pLat] };
      }
    }

    const updateData = { ...req.body };
    if (coordinates) updateData.coordinates = coordinates;
    if (req.body.petFriendly !== undefined) {
      updateData.petFriendly = req.body.petFriendly === "true" || req.body.petFriendly === true;
    }

    const oldListing = await Property.findOne({ _id: id, seller: req.user._id }).lean();
    if (!oldListing) {
      return res.status(404).json({ success: false, message: "Listing not found or unauthorized" });
    }

    // Identify removed images
    const oldImages = oldListing.images || [];
    const currentImages = updateData.images || oldImages;
    const removedImages = oldImages.filter((img) => !currentImages.includes(img));

    const updatedProperty = await Property.findOneAndUpdate(
      { _id: id, seller: req.user._id },
      { $set: updateData },
      { new: true, runValidators: true }
    ).lean();

    // Background Tasks via RabbitMQ
    publishListingUpdated({
      entity: 'properties',
      listing: updatedProperty,
      oldListing,
      changes: Object.keys(updateData),
      userId: req.user._id,
      ip: req.ip,
    }).catch(() => {});

    if (removedImages.length > 0) {
      publishImageCleanup({ imageUrls: removedImages }).catch(() => {});
    }

    normaliseImages(updatedProperty);
    return res.status(200).json({
      success: true,
      message: "Listing updated successfully",
      data: updatedProperty,
    });
  } catch (error) {
    logger.error("Update properties error:", error);
    return res.status(500).json({ success: false, message: "Error updating listing" });
  }
};

exports.deleteProperty = async (req, res) => {
  try {
    const { id } = req.params;
    const listing = await Property.findOne({ _id: id, seller: req.user._id }).lean();
    
    if (!listing) {
      return res.status(404).json({ success: false, message: "Listing not found or unauthorized" });
    }

    await Property.deleteOne({ _id: id });

    // Background Tasks via RabbitMQ
    publishListingDeleted({
      entity: 'properties',
      listingId: id,
      listing,
      userId: req.user._id,
    }).catch(() => {});

    if (listing.images?.length > 0) {
      publishImageCleanup({ imageUrls: listing.images }).catch(() => {});
    }

    return res.status(200).json({
      success: true,
      message: "Listing deleted successfully",
      data: { id },
    });
  } catch (error) {
    logger.error("Delete properties error:", error);
    return res.status(500).json({ success: false, message: "Error deleting listing" });
  }
};

exports.toggleSaveProperty = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid ID format" });
    }

    const listing = await Property.findById(id).select('savedBy').lean();
    if (!listing) {
      return res.status(404).json({ success: false, message: "Listing not found" });
    }

    const isSaved = listing.savedBy?.some((sid) => sid.toString() === userId.toString());
    if (isSaved) {
      await Property.updateOne({ _id: id }, { $pull: { savedBy: userId } });
    } else {
      await Property.updateOne({ _id: id }, { $addToSet: { savedBy: userId } });
    }

    res.status(200).json({
      success: true,
      message: isSaved ? "Listing removed from saved" : "Listing saved successfully",
      isSaved: !isSaved,
      saved: !isSaved,
    });

    // Run cache work in background after response is sent.
    void (async () => {
      try {
        const savedKeyBase = `user:${userId}:saved:properties`;
        await Promise.allSettled([
          redis.del(savedKeyBase),
          redis.del(`${savedKeyBase}:p1:l20`),
          ListingCache.invalidateListingCache('properties', id),
          ListingCache.logProductSaved('properties', listing, userId, !isSaved),
        ]);
      } catch (cacheErr) {
        logger.error('[Cache] Error updating save cache:', cacheErr.message);
      }
    })();
  } catch (error) {
    logger.error("Error toggling saved property:", error);
    return res.status(500).json({ success: false, message: "Error updating saved status" });
  }
};

// @desc    Get my property listings
// @route   GET /api/properties/my-listings
// @access  Private
exports.getMyProperties = async (req, res) => {
  try {
    const { page, limit } = parsePagination(req.query, { limit: 20 });
    const { items, pagination } = await paginatedFind({
      model: Property,
      filter: { seller: req.user._id },
      populate: [{ path: 'seller', select: 'name username profileImage' }],
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
    logger.error("Get my properties error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch your property listings",
    });
  }
};

// @desc    Get saved properties for current user
// @route   GET /api/properties/saved
// @access  Private
exports.getSavedProperties = async (req, res) => {
  try {
    const userId = req.user._id;
    const { page, limit } = parsePagination(req.query, { limit: 20 });

    // Check Redis cache first
    try {
      const savedKey = `user:${userId}:saved:properties:p${page}:l${limit}`;
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
      logger.debug('Saved properties cache miss:', cacheErr.message);
    }

    const { items, pagination } = await paginatedFind({
      model: Property,
      filter: { savedBy: userId, status: "active" },
      populate: [{ path: 'seller', select: 'name username profileImage' }],
      page,
      limit,
    });

    // Store in Redis cache
    try {
      const savedKey = `user:${userId}:saved:properties:p${page}:l${limit}`;
      await redis.setex(savedKey, 600, JSON.stringify({
        listings: items.map(l => ({
          _id: l._id,
          slug: l.slug,
          title: l.title,
          price: l.price,
          location: l.location,
          category: l.category,
          subcategory: l.subcategory,
          thumbnail: l.images?.[0] || null,
          images: l.images || [],
          sellerName: l.sellerName,
          bedrooms: l.bedrooms,
          bathrooms: l.bathrooms,
          status: l.status,
          createdAt: l.createdAt,
        })),
        pagination,
      }));
    } catch (cacheErr) {
      logger.error('[Cache] Error caching saved properties:', cacheErr.message);
    }

    items.forEach(normaliseImages);

    res.setHeader('X-Cache', 'MISS');
    res.status(200).json({
      success: true,
      listings: items,
      pagination,
    });
  } catch (error) {
    logger.error("Get saved properties error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch saved properties",
    });
  }
};

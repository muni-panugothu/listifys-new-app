const TakeCare = require("../models/takecare.model.js");
const mongoose = require("mongoose");
const { logger } = require("../utils/logger");
const { parsePagination, paginatedFind } = require("../utils/pagination");
const redis = require("../config/redis");
const ListingCache = require("../services/listingcache.service.js");
const S3Service = require("../services/s3.service.js");
const viewCounter = require("../services/viewcount.service.js");
const { esHydratedSearch } = require("../utils/esSearch");

const {
  publishListingCreated,
  publishListingUpdated,
  publishListingDeleted,
  publishImageCleanup,
} = require("../queues/producers/listing.producer");

const VALID_SUBCATEGORIES = ["Nanny", "Babysitter", "Elder Care", "Pet Care"];

const LIST_PROJECTION = { currency: 1, slug: 1,
  title: 1,
  description: 1,
  price: 1,
  location: 1,
  condition: 1,
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
  experience: 1,
  availability: 1,
  age: 1,
  languages: 1,
  certifications: 1,
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

exports.createTakeCare = async (req, res) => {
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
      experience,
      availability,
      age,
      languages,
      certifications,
      lat,
      lng,
    } = req.body;

    if (category !== "Take Care") {
      return res.status(400).json({
        success: false,
        message: `This endpoint only accepts category \"Take Care\". Received \"${category}\".`,
      });
    }

    if (!VALID_SUBCATEGORIES.includes(subcategory)) {
      return res.status(400).json({
        success: false,
        message: `Invalid subcategory \"${subcategory}\" for Take Care. Allowed: ${VALID_SUBCATEGORIES.join(", ")}`,
      });
    }

    const listing = await TakeCare.create({
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
      features: Array.isArray(features) ? features : [],
      images: Array.isArray(images) ? images : [],
      videos: Array.isArray(videos) ? videos : [],
      ...(experience && { experience }),
      ...(availability && { availability }),
      ...(age && { age: Number(age) }),
      ...(languages && {
        languages: Array.isArray(languages)
          ? languages
          : String(languages)
              .split(",")
              .map((v) => v.trim())
              .filter(Boolean),
      }),
      ...(certifications && {
        certifications: Array.isArray(certifications)
          ? certifications
          : String(certifications)
              .split(",")
              .map((v) => v.trim())
              .filter(Boolean),
      }),
      ...(lat && lng && {
        coordinates: { type: "Point", coordinates: [Number(lng), Number(lat)] },
      }),
      seller: req.user._id,
      sellerName: req.user.firstName
        ? `${req.user.firstName} ${req.user.lastName || ""}`.trim()
        : req.user.email.split("@")[0],
    });

    const populated = await TakeCare.findById(listing._id).populate(
      "seller",
      "name profileImage"
    );

    const listingObj = populated.toObject ? populated.toObject() : populated;
    normaliseImages(listingObj);

    res.status(201).json({
      success: true,
      message: "Take Care listing created successfully",
      listing: listingObj,
    });

    logger.productLog("posted", "takecare", listingObj, req);

    publishListingCreated({
      entity: "takecare",
      listing: listingObj,
      userId: req.user._id,
      ip: req.ip,
      userAgent: req.get("user-agent"),
    }).catch(() => {});
  } catch (error) {
    logger.error("Create takecare error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create takecare listing",
    });
  }
};

exports.getAllTakeCare = async (req, res) => {
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

    const queryKey = [
      search || "",
      category || "",
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

    const cached = await ListingCache.getCachedListingList("takecare", queryKey);
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
        entity: 'takecare',
        searchParams: { query: search, category, condition, minPrice, maxPrice, location: locationFilter, sort, page: safePage, limit: safeLimit },
        Model: TakeCare,
        projection: LIST_PROJECTION,
      });

      if (esResult) {
        esResult.docs.forEach(normaliseImages);
        res.setHeader('X-Cache', 'MISS');
        res.setHeader('X-Search-Source', 'elasticsearch');
        res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=300');
        res.status(200).json({ success: true, listings: esResult.docs, pagination: esResult.pagination });

        Promise.all([
          ListingCache.cacheListingList('takecare', queryKey, esResult.docs, esResult.pagination),
          ListingCache.prefetchCategoryListings('takecare', esResult.docs),
          ListingCache.cacheSearchResults('takecare', search, esResult.docs, esResult.pagination),
        ]).catch(err => logger.error('[Cache] Background cache write error:', err.message));
        return;
      }
    }

    const filter = { status: "active" };

    if (search) {
      const escapedSearch = String(search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
    const { applyGeoFilter, buildSortOption, buildLocationRegex, applyCountryFilter } = require('../utils/geoQuery');
    if (locationFilter) {
      filter.location = buildLocationRegex(locationFilter);
    }
    applyGeoFilter(filter, lat, lng, radius);
    applyCountryFilter(filter, countryCode);

    const sortOption = buildSortOption(sort, !!(lat && lng), !!search);

    const skip = (safePage - 1) * safeLimit;

    let listings;
    let total;
    let pagination;

    if (safePage > 1) {
      listings = await TakeCare.find(filter, LIST_PROJECTION)
        .sort(sortOption)
        .skip(skip)
        .limit(safeLimit + 1)
        .populate("seller", "name profileImage")
        .lean();

      const hasNextPage = listings.length > safeLimit;
      if (hasNextPage) listings = listings.slice(0, safeLimit);

      pagination = { page: safePage, limit: safeLimit, hasMore: hasNextPage };
    } else {
      [listings, total] = await Promise.all([
        TakeCare.find(filter, LIST_PROJECTION)
          .sort(sortOption)
          .limit(safeLimit)
          .populate("seller", "name profileImage")
          .lean(),
        TakeCare.countDocuments(filter),
      ]);

      pagination = {
        total,
        page: safePage,
        pages: Math.ceil(total / safeLimit),
        limit: safeLimit,
      };
    }

    listings.forEach(normaliseImages);

    res.setHeader("X-Cache", "MISS");
    res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=300");
    res.status(200).json({ success: true, listings, pagination });

    Promise.all([
      ListingCache.cacheListingList("takecare", queryKey, listings, pagination),
      ListingCache.prefetchCategoryListings("takecare", listings),
      search ? ListingCache.cacheSearchResults("takecare", search, listings, pagination) : null,
    ]).catch((err) => logger.error("[Cache] Background cache write error:", err.message));
  } catch (error) {
    logger.error("Get all takecare error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch takecare listings",
    });
  }
};

exports.getTakeCareById = async (req, res) => {
  try {
    const param = req.params.id;
    const isObjectId = mongoose.Types.ObjectId.isValid(param);

    if (isObjectId) {
      const cached = await ListingCache.getCachedListing("takecare", param);
      if (cached) {
        viewCounter.recordView("takecare", param);
        normaliseImages(cached);
        res.setHeader("X-Cache", "HIT");
        res.setHeader("X-Cache-Source", "listing-cache");
        return res.status(200).json({ success: true, listing: cached });
      }
    }

    const listing = isObjectId
      ? await TakeCare.findById(param).populate("seller", "name profileImage createdAt")
      : await TakeCare.findOne({ slug: param, status: "active" }).populate("seller", "name profileImage createdAt");

    if (!listing) {
      return res.status(404).json({ success: false, message: "Take Care listing not found" });
    }

    const listingId = listing._id.toString();
    viewCounter.recordView("takecare", listingId);

    const listingObj = listing.toObject ? listing.toObject() : listing;
    normaliseImages(listingObj);
    res.setHeader("X-Cache", "MISS");
    res.status(200).json({ success: true, listing: listingObj });

    ListingCache.cacheListing("takecare", listingObj).catch((err) =>
      logger.error("[Cache] Background cache error:", err.message)
    );
  } catch (error) {
    logger.error("Get takecare by ID error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch takecare listing",
    });
  }
};

exports.updateTakeCare = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid listing ID format" });
    }

    const listing = await TakeCare.findById(req.params.id);
    if (!listing) {
      return res.status(404).json({ success: false, message: "Take Care listing not found" });
    }

    if (listing.seller.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: "Not authorized to update this listing" });
    }

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
      "experience",
      "availability",
      "age",
      "languages",
      "certifications",
    ];

    allowedUpdates.forEach((field) => {
      if (req.body[field] !== undefined) {
        if ((field === "languages" || field === "certifications") && typeof req.body[field] === "string") {
          listing[field] = req.body[field]
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean);
        } else {
          listing[field] = req.body[field];
        }
      }
    });

    await listing.save();

    const updated = await TakeCare.findById(listing._id).populate(
      "seller",
      "name profileImage"
    );

    const updatedObj = updated.toObject ? updated.toObject() : updated;
    const newImages = Array.isArray(updatedObj.images) ? updatedObj.images : [];
    const removedImages = oldImages.filter((url) => !newImages.includes(url));

    normaliseImages(updatedObj);

    try {
      await Promise.all([
        ListingCache.cacheListing("takecare", updatedObj),
        ListingCache.invalidateListCaches("takecare"),
        removedImages.length > 0 ? S3Service.deleteImagesByUrls(removedImages) : Promise.resolve(),
      ]);
    } catch (cacheErr) {
      logger.error("[Cache/Image] TakeCare immediate update sync error:", cacheErr.message);
    }

    res.status(200).json({
      success: true,
      message: "Take Care listing updated successfully",
      listing: updatedObj,
    });

    logger.productLog("updated", "takecare", updatedObj, req, {
      changes: allowedUpdates.filter((f) => req.body[f] !== undefined),
    });

    publishListingUpdated({
      entity: "takecare",
      listing: updatedObj,
      oldListing: oldListingObj,
      changes: allowedUpdates.filter((f) => req.body[f] !== undefined),
      userId: req.user._id,
      ip: req.ip,
    }).catch(() => {});

    if (removedImages.length > 0) {
      publishImageCleanup({ imageUrls: removedImages }).catch(() => {});
    }
  } catch (error) {
    logger.error("Update takecare error:", error);
    res.status(500).json({ success: false, message: "Failed to update takecare listing" });
  }
};

exports.deleteTakeCare = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid listing ID" });
    }

    const listing = await TakeCare.findById(req.params.id);
    if (!listing) {
      return res.status(404).json({ success: false, message: "Take Care listing not found" });
    }

    if (listing.seller.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: "Not authorized to delete this listing" });
    }

    await TakeCare.findByIdAndDelete(req.params.id);

    res.status(200).json({ success: true, message: "Take Care listing deleted successfully" });

    logger.productLog("deleted", "takecare", listing, req);

    publishListingDeleted({
      entity: "takecare",
      listingId: req.params.id,
      listing,
      userId: req.user._id,
    }).catch(() => {});

    if (listing.images && listing.images.length > 0) {
      publishImageCleanup({ imageUrls: listing.images }).catch(() => {});
    }
  } catch (error) {
    logger.error("Delete takecare error:", error);
    res.status(500).json({ success: false, message: "Failed to delete takecare listing" });
  }
};

exports.getMyTakeCare = async (req, res) => {
  try {
    const { page, limit } = parsePagination(req.query, { limit: 20 });
    const { items, pagination } = await paginatedFind({
      model: TakeCare,
      filter: { seller: req.user._id },
      populate: [{ path: "seller", select: "name profileImage" }],
      page,
      limit,
    });

    items.forEach(normaliseImages);

    res.status(200).json({ success: true, listings: items, pagination });
  } catch (error) {
    logger.error("Get my takecare error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch your takecare listings" });
  }
};

exports.uploadImages = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: "No images provided" });
    }

    const imageUrls = [];

    for (const file of req.files) {
      const result = await S3Service.uploadListingImage(
        file.buffer,
        req.user._id.toString(),
        file.mimetype,
        "takecare"
      );
      imageUrls.push(result.imageUrl);
    }

    await ListingCache.cacheUploadedImages("takecare", req.user._id.toString(), imageUrls);

    res.status(200).json({ success: true, imageUrls });
  } catch (error) {
    logger.error("Upload takecare images error:", error);
    res.status(500).json({ success: false, message: "Failed to upload images" });
  }
};

exports.getSavedTakeCare = async (req, res) => {
  try {
    const userId = req.user._id;
    const { page, limit } = parsePagination(req.query, { limit: 20 });

    try {
      const savedKey = `user:${userId}:saved:takecare:p${page}:l${limit}`;
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
      logger.debug("Saved takecare cache miss:", cacheErr.message);
    }

    const { items, pagination } = await paginatedFind({
      model: TakeCare,
      filter: { savedBy: userId, status: "active" },
      populate: [{ path: "seller", select: "name profileImage" }],
      page,
      limit,
    });

    try {
      const savedKey = `user:${userId}:saved:takecare:p${page}:l${limit}`;
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
            thumbnail: l.images?.[0] || null,
            images: l.images || [],
            sellerName: l.sellerName,
            experience: l.experience,
            availability: l.availability,
          })),
          pagination,
        })
      );
    } catch (cacheErr) {
      logger.error("[Cache] Error caching saved takecare:", cacheErr.message);
    }

    items.forEach(normaliseImages);

    res.setHeader("X-Cache", "MISS");
    res.status(200).json({ success: true, listings: items, pagination });
  } catch (error) {
    logger.error("Get saved takecare error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch saved takecare" });
  }
};

exports.toggleSave = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid listing ID format" });
    }

    const userId = req.user._id;
    const listing = await TakeCare.findById(req.params.id).select('savedBy').lean();
    if (!listing) {
      return res.status(404).json({ success: false, message: "Take Care listing not found" });
    }

    const isSaved = listing.savedBy?.some((id) => id.toString() === userId.toString());

    if (isSaved) {
      await TakeCare.updateOne({ _id: req.params.id }, { $pull: { savedBy: userId } });
    } else {
      await TakeCare.updateOne({ _id: req.params.id }, { $addToSet: { savedBy: userId } });
    }

    res.status(200).json({
      success: true,
      saved: !isSaved,
      message: isSaved ? "Listing unsaved" : "Listing saved",
    });

    // Keep click response fast: run cache work in background.
    void (async () => {
      try {
        const savedKeyBase = `user:${userId}:saved:takecare`;
        await Promise.allSettled([
          redis.del(savedKeyBase),
          redis.del(`${savedKeyBase}:p1:l20`),
          ListingCache.invalidateListingCache("takecare", req.params.id),
          ListingCache.logProductSaved("takecare", listing, userId, !isSaved),
        ]);
      } catch (cacheErr) {
        logger.error("[Cache] Error updating save cache:", cacheErr.message);
      }
    })();
  } catch (error) {
    logger.error("Toggle save takecare error:", error);
    res.status(500).json({ success: false, message: "Failed to toggle save" });
  }
};

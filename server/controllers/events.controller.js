const Event = require("../models/event.model.js");
const mongoose = require("mongoose");
const { logger } = require("../utils/logger");
const { parsePagination, paginatedFind } = require("../utils/pagination");
const redis = require("../config/redis");
const ListingCache = require("../services/listingcache.service.js");
const S3Service = require("../services/s3.service.js");
const viewCounter = require("../services/viewcount.service.js");
const SearchService = require("../services/search.service.js");
const { esHydratedSearch } = require("../utils/esSearch");
const { notifyFollowersOfNewListing } = require("../services/notifyfollowers.service.js");
const {
  buildDayOverlapFilter,
  buildUpcomingFilter,
  dateKey,
  getEventRange,
  eventOccursOnDate,
  eventOccursOnUpcomingWeekend,
  isEventExpired,
  resolveEventDatesFromBody,
  repairEventDatesIfNeeded,
  startOfDay,
  endOfDay,
  parseDateKey,
} = require("../utils/eventDates");

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
  condition: 1,
  category: 1,
  subcategory: 1,
  images: 1,
  videos: 1,
  sellerName: 1,
  seller: 1,
  views: 1,
  features: 1,
  phone: 1,
  status: 1,
  savedBy: 1,
  createdAt: 1,
  eventDate: 1,
  eventTime: 1,
  startDate: 1,
  endDate: 1,
  organizer: 1,
  venue: 1,
  ticketsAvailable: 1,
  coordinates: 1,
  countryCode: 1,
};

const { normaliseListingMedia } = require("../utils/listing-media");
const { resolveSellerName } = require("../utils/listing-seller");
const normaliseImages = (listing) => normaliseListingMedia(listing);

function formatHostingDuration(createdAt) {
  if (!createdAt) return null;
  const start = new Date(createdAt);
  if (Number.isNaN(start.getTime())) return null;
  const months =
    (new Date().getFullYear() - start.getFullYear()) * 12 +
    (new Date().getMonth() - start.getMonth());
  if (months < 1) return "New host";
  if (months < 12) return `${months} month${months === 1 ? "" : "s"}`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? "" : "s"}`;
}

async function attachOrganizerStats(listingObj) {
  if (!listingObj?.seller) return listingObj;
  const sellerId = listingObj.seller._id || listingObj.seller;
  if (!sellerId) return listingObj;

  try {
    const hostedEvents = await Event.countDocuments({
      seller: sellerId,
      status: "active",
    });
    const rating = Number(listingObj.sellerRating ?? 5);
    const reviews = Number(listingObj.sellerReviews ?? 0);
    listingObj.organizerStats = {
      hostedEvents,
      hostingDuration: formatHostingDuration(listingObj.seller?.createdAt),
      likedPercent: Math.min(100, Math.max(0, Math.round((rating / 5) * 100))),
      ratingsCount: reviews,
    };
  } catch {
    listingObj.organizerStats = {
      hostedEvents: 0,
      hostingDuration: null,
      likedPercent: null,
      ratingsCount: 0,
    };
  }
  return listingObj;
}

const VALID_SUBCATEGORIES = [
  "Music",
  "Food & Drink",
  "Business",
  "Health & Wellness",
  "Film",
  "Comedy",
  "Art",
  "Sports",
  "Theater",
  "Education",
  "Community",
  "Other",
];

exports.createEvent = async (req, res) => {
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
      videos,
      eventDate,
      eventTime,
      startDate: bodyStartDate,
      endDate: bodyEndDate,
      organizer,
      venue,
      ticketsAvailable,
      ageRestriction,
      dressCode,
      eventFormat,
      eventDuration,
      lat,
      lng,
    } = req.body;

    if (category !== "Events") {
      logger.securityLog("wrong_category", {
        ip: req.ip,
        path: "/api/events",
        method: req.method,
        reason: `expected Events, received ${category}`,
        userId: req.user?._id,
      });
      return res.status(400).json({
        success: false,
        message: `This endpoint only accepts category \"Events\". Received \"${category}\".`,
      });
    }

    if (!VALID_SUBCATEGORIES.includes(subcategory)) {
      return res.status(400).json({
        success: false,
        message: `Invalid subcategory \"${subcategory}\" for Events. Allowed: ${VALID_SUBCATEGORIES.join(", ")}`,
      });
    }

    const resolvedDates = resolveEventDatesFromBody({
      startDate: bodyStartDate,
      endDate: bodyEndDate,
      eventDate,
    });

    const listing = await Event.create({
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
      eventDate,
      eventTime,
      startDate: resolvedDates.startDate,
      endDate: resolvedDates.endDate,
      organizer,
      venue,
      ticketsAvailable: ticketsAvailable !== undefined && ticketsAvailable !== null && ticketsAvailable !== ""
        ? Number(ticketsAvailable)
        : 0,
      ageRestriction,
      dressCode,
      eventFormat,
      eventDuration,
      ...(lat && lng && {
        coordinates: { type: "Point", coordinates: [Number(lng), Number(lat)] },
      }),
      seller: req.user._id,
      sellerName: resolveSellerName(req.user),
    });

    const populated = await Event.findById(listing._id).populate(
      "seller",
      "name profileImage"
    );

    const listingObj = populated.toObject ? populated.toObject() : populated;
    normaliseImages(listingObj);

    res.status(201).json({
      success: true,
      message: "Event listing created successfully",
      listing: listingObj,
    });

    logger.productLog("posted", "events", listingObj, req, {
      eventDate,
      eventTime,
      organizer,
      venue,
    });

    // ✅ Background via RabbitMQ (non-blocking)
    publishListingCreated({
      entity:    'events',
      listing:   listingObj,
      userId:    req.user._id,
      ip:        req.ip,
      userAgent: req.get('user-agent'),
    }).catch(() => {});
  } catch (error) {
    logger.error("Create event error:", error);
    const isValidationError = error.name === "ValidationError";
    res.status(isValidationError ? 400 : 500).json({
      success: false,
      message: isValidationError
        ? Object.values(error.errors).map((e) => e.message).join("; ")
        : "Failed to create event listing",
    });
  }
};

exports.getAllEvents = async (req, res) => {
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

    const cached = await ListingCache.getCachedListingList("events", queryKey);
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
        entity: 'events',
        searchParams: { query: search, category, condition, minPrice, maxPrice, location: locationFilter, sort, page: safePage, limit: safeLimit },
        Model: Event,
        projection: LIST_PROJECTION,
      });

      if (esResult) {
        esResult.docs.forEach(normaliseImages);
        res.setHeader('X-Cache', 'MISS');
        res.setHeader('X-Search-Source', 'elasticsearch');
        res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=300');
        res.status(200).json({ success: true, listings: esResult.docs, pagination: esResult.pagination });

        Promise.all([
          ListingCache.cacheListingList('events', queryKey, esResult.docs, esResult.pagination),
          ListingCache.prefetchCategoryListings('events', esResult.docs),
          ListingCache.cacheSearchResults('events', search, esResult.docs, esResult.pagination),
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
      listings = await Event.find(filter, LIST_PROJECTION)
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
        Event.find(filter, LIST_PROJECTION)
          .sort(sortOption)
          .limit(safeLimit)
          .populate("seller", "name profileImage")
          .lean(),
        Event.countDocuments(filter),
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
    res.status(200).json({
      success: true,
      listings,
      pagination,
    });

    Promise.all([
      ListingCache.cacheListingList("events", queryKey, listings, pagination),
      ListingCache.prefetchCategoryListings("events", listings),
      search ? ListingCache.cacheSearchResults("events", search, listings, pagination) : null,
    ]).catch((err) => logger.error("[Cache] Event list background cache write error:", err.message));
  } catch (error) {
    logger.error("Get all events error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch event listings",
    });
  }
};

exports.getEventById = async (req, res) => {
  try {
    const param = req.params.id;
    const isObjectId = mongoose.Types.ObjectId.isValid(param);

    if (isObjectId) {
      const cached = await ListingCache.getCachedListing("events", param);
      if (cached) {
        viewCounter.recordView("events", param);
        normaliseImages(cached);
        res.setHeader("X-Cache", "HIT");
        res.setHeader("X-Cache-Source", "listing-cache");
        return res.status(200).json({ success: true, listing: cached });
      }
    }

    const listing = isObjectId
      ? await Event.findById(param).populate("seller", "name profileImage createdAt")
      : await Event.findOne({ slug: param, status: "active" }).populate("seller", "name profileImage createdAt");

    if (!listing) {
      return res.status(404).json({
        success: false,
        message: "Event listing not found",
      });
    }

    const listingId = listing._id.toString();
    viewCounter.recordView("events", listingId);

    const listingObj = listing.toObject ? listing.toObject() : listing;
    normaliseImages(listingObj);
    await attachOrganizerStats(listingObj);
    res.setHeader("X-Cache", "MISS");
    res.status(200).json({
      success: true,
      listing: listingObj,
    });

    ListingCache.cacheListing("events", listingObj).catch((err) =>
      logger.error("[Cache] Event detail background cache error:", err.message)
    );
  } catch (error) {
    logger.error("Get event by ID error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch event listing",
    });
  }
};

exports.updateEvent = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid listing ID format",
      });
    }

    const listing = await Event.findById(req.params.id);

    if (!listing) {
      return res.status(404).json({
        success: false,
        message: "Event listing not found",
      });
    }

    if (listing.seller.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to update this listing",
      });
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
      "videos",
      "status",
      "eventDate",
      "eventTime",
      "startDate",
      "endDate",
      "organizer",
      "venue",
      "ticketsAvailable",
      "ageRestriction",
      "dressCode",
      "eventFormat",
      "eventDuration",
    ];

    allowedUpdates.forEach((field) => {
      if (req.body[field] !== undefined) {
        listing[field] = req.body[field];
      }
    });

    if (
      req.body.startDate !== undefined ||
      req.body.endDate !== undefined ||
      req.body.eventDate !== undefined
    ) {
      const resolvedDates = resolveEventDatesFromBody({
        startDate: req.body.startDate ?? listing.startDate,
        endDate: req.body.endDate ?? listing.endDate,
        eventDate: req.body.eventDate ?? listing.eventDate,
      });
      listing.startDate = resolvedDates.startDate;
      listing.endDate = resolvedDates.endDate;
    }

    await listing.save();

    const updated = await Event.findById(listing._id).populate(
      "seller",
      "name profileImage"
    );

    const updatedObj = updated.toObject ? updated.toObject() : updated;
    const newImages = Array.isArray(updatedObj.images) ? updatedObj.images : [];
    const removedImages = oldImages.filter((url) => !newImages.includes(url));

    normaliseImages(updatedObj);

    try {
      await Promise.all([
        ListingCache.cacheListing("events", updatedObj),
        ListingCache.invalidateListCaches("events"),
        removedImages.length > 0 ? S3Service.deleteImagesByUrls(removedImages) : Promise.resolve(),
      ]);
    } catch (cacheErr) {
      logger.error("[Cache/Image] Event immediate update sync error:", cacheErr.message);
    }

    res.status(200).json({
      success: true,
      message: "Event listing updated successfully",
      listing: updatedObj,
    });

    logger.productLog("updated", "events", updatedObj, req, {
      changes: allowedUpdates.filter((f) => req.body[f] !== undefined),
    });

    // ✅ Background via RabbitMQ (non-blocking)
    publishListingUpdated({
      entity:     'events',
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
    logger.error("Update event error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update event listing",
    });
  }
};

exports.deleteEvent = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid listing ID" });
    }

    const listing = await Event.findById(req.params.id);

    if (!listing) {
      return res.status(404).json({
        success: false,
        message: "Event listing not found",
      });
    }

    if (listing.seller.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to delete this listing",
      });
    }

    await Event.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: "Event listing deleted successfully",
    });

    logger.productLog("deleted", "events", listing, req);

    // ✅ Background via RabbitMQ (non-blocking)
    publishListingDeleted({
      entity:    'events',
      listingId: req.params.id,
      listing,
      userId:    req.user._id,
    }).catch(() => {});

    if (listing.images && listing.images.length > 0) {
      publishImageCleanup({ imageUrls: listing.images }).catch(() => {});
    }
  } catch (error) {
    logger.error("Delete event error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete event listing",
    });
  }
};

exports.getMyEvents = async (req, res) => {
  try {
    const { page, limit } = parsePagination(req.query, { limit: 20 });
    const { items, pagination } = await paginatedFind({
      model: Event,
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
    logger.error("Get my events error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch your event listings",
    });
  }
};

exports.uploadImages = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No images provided",
      });
    }

    const imageUrls = [];

    for (const file of req.files) {
      const result = await S3Service.uploadListingImage(
        file.buffer,
        req.user._id.toString(),
        file.mimetype,
        "events"
      );
      imageUrls.push(result.imageUrl);
    }

    await ListingCache.cacheUploadedImages("events", req.user._id.toString(), imageUrls);

    res.status(200).json({
      success: true,
      imageUrls,
    });
  } catch (error) {
    logger.error("Upload event images error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to upload images",
    });
  }
};

exports.getSavedEvents = async (req, res) => {
  try {
    const userId = req.user._id;
    const { page, limit } = parsePagination(req.query, { limit: 20 });

    try {
      const savedKey = `user:${userId}:saved:events:p${page}:l${limit}`;
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
      logger.debug("Saved events cache miss:", cacheErr.message);
    }

    const { items, pagination } = await paginatedFind({
      model: Event,
      filter: { savedBy: userId, status: "active" },
      populate: [{ path: 'seller', select: 'name profileImage' }],
      page,
      limit,
    });

    try {
      const savedKey = `user:${userId}:saved:events:p${page}:l${limit}`;
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
            eventDate: l.eventDate,
            eventTime: l.eventTime,
          })),
          pagination,
        })
      );
    } catch (cacheErr) {
      logger.error("[Cache] Error caching saved events:", cacheErr.message);
    }

    items.forEach(normaliseImages);

    res.setHeader("X-Cache", "MISS");
    res.status(200).json({
      success: true,
      listings: items,
      pagination,
    });
  } catch (error) {
    logger.error("Get saved events error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch saved events",
    });
  }
};

exports.toggleSave = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid listing ID format" });
    }

    const userId = req.user._id;
    const listing = await Event.findById(req.params.id).select('savedBy').lean();
    if (!listing) {
      return res.status(404).json({
        success: false,
        message: "Event listing not found",
      });
    }

    const isSaved = listing.savedBy?.some((id) => id.toString() === userId.toString());

    if (isSaved) {
      await Event.updateOne({ _id: req.params.id }, { $pull: { savedBy: userId } });
    } else {
      await Event.updateOne({ _id: req.params.id }, { $addToSet: { savedBy: userId } });
    }

    res.status(200).json({
      success: true,
      saved: !isSaved,
      message: isSaved ? "Listing unsaved" : "Listing saved",
    });

    // Keep click response fast: run cache work in background.
    void (async () => {
      try {
        const savedKeyBase = `user:${userId}:saved:events`;
        await Promise.allSettled([
          redis.del(savedKeyBase),
          redis.del(`${savedKeyBase}:p1:l20`),
          ListingCache.invalidateListingCache("events", req.params.id),
          ListingCache.logProductSaved("events", listing, userId, !isSaved),
        ]);
      } catch (cacheErr) {
        logger.error("[Cache] Error updating events save cache:", cacheErr.message);
      }
    })();
  } catch (error) {
    logger.error("Toggle event save error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to toggle save",
    });
  }
};

/**
 * GET /api/events/calendar/summary
 * Returns per-day event counts for the upcoming window (for date strip + calendar dots).
 */
exports.getEventCalendarSummary = async (req, res) => {
  try {
    const days = Math.min(Math.max(Number(req.query.days) || 60, 7), 120);
    const subcategory = req.query.category || req.query.subcategory;
    const { lat, lng, radius, countryCode } = req.query;

    const now = startOfDay(new Date());
    const windowEnd = new Date(now);
    windowEnd.setDate(windowEnd.getDate() + days);

    const filter = {
      status: "active",
      ...buildUpcomingFilter(),
    };

    if (subcategory && subcategory !== "All") {
      const cats = String(subcategory).split(",").map((c) => c.trim());
      filter.subcategory = { $in: cats };
    }

    const { applyGeoFilter, applyCountryFilter } = require("../utils/geoQuery");
    applyGeoFilter(filter, lat, lng, radius);
    applyCountryFilter(filter, countryCode);

    const events = await Event.find(filter, {
      startDate: 1,
      endDate: 1,
      eventDate: 1,
    }).lean();

    const counts = {};
    for (let i = 0; i < days; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() + i);
      counts[dateKey(d)] = 0;
    }

    for (const event of events) {
      const range = getEventRange(event);
      if (!range) continue;
      const cursor = new Date(Math.max(range.start.getTime(), now.getTime()));
      const last = range.end < windowEnd ? range.end : endOfDay(windowEnd);
      while (cursor <= last) {
        const key = dateKey(cursor);
        if (counts[key] !== undefined) {
          counts[key] += 1;
        }
        cursor.setDate(cursor.getDate() + 1);
      }
    }

    const dates = Object.entries(counts)
      .filter(([, count]) => count > 0)
      .map(([key, count]) => ({ date: key, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=120");
    res.status(200).json({
      success: true,
      counts,
      dates,
      totalDays: days,
    });
  } catch (error) {
    logger.error("Event calendar summary error:", error);
    res.status(500).json({ success: false, message: "Failed to load event calendar" });
  }
};

/**
 * GET /api/events/upcoming
 * Upcoming events with optional date filter (multi-day aware), search, geo, pagination.
 */
exports.getSimilarEvents = async (req, res) => {
  try {
    const param = req.params.id;
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 20);
    const { lat, lng, countryCode } = req.query;

    if (!mongoose.Types.ObjectId.isValid(param)) {
      return res.status(400).json({ success: false, message: "Invalid event ID" });
    }

    const current = await Event.findById(param).lean();
    if (!current) {
      return res.status(404).json({ success: false, message: "Event not found" });
    }

    const filter = {
      status: "active",
      _id: { $ne: current._id },
      ...buildUpcomingFilter(),
    };

    if (current.subcategory) {
      filter.subcategory = current.subcategory;
    }

    const { applyGeoFilter, applyCountryFilter } = require("../utils/geoQuery");
    applyCountryFilter(filter, countryCode);
    applyGeoFilter(filter, lat, lng, req.query.radius ?? 50);

    let listings = await Event.find(filter, LIST_PROJECTION)
      .sort({ featured: -1, createdAt: -1 })
      .limit(limit * 2)
      .populate("seller", "name profileImage")
      .lean();

    listings = listings.filter((e) => !isEventExpired(e));

    if (listings.length < limit && current.subcategory) {
      const broader = await Event.find(
        {
          status: "active",
          _id: { $ne: current._id, $nin: listings.map((l) => l._id) },
          ...buildUpcomingFilter(),
        },
        LIST_PROJECTION,
      )
        .sort({ featured: -1, createdAt: -1 })
        .limit(limit)
        .populate("seller", "name profileImage")
        .lean();
      listings = [...listings, ...broader.filter((e) => !isEventExpired(e))];
    }

    listings = listings.slice(0, limit);
    listings.forEach(normaliseImages);

    res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=180");
    return res.status(200).json({ success: true, listings });
  } catch (error) {
    logger.error("Get similar events error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch similar events",
    });
  }
};

exports.getUpcomingEvents = async (req, res) => {
  try {
    const {
      date,
      search,
      category,
      subcategory,
      sort,
      location: locationFilter,
      lat,
      lng,
      radius,
      countryCode,
      page = 1,
      limit = 30,
      weekend,
    } = req.query;

    const filterWeekend =
      weekend === "1" || weekend === "true" || weekend === true;

    const safeLimit = Math.min(Math.max(Number(limit) || 30, 1), 50);
    const safePage = Math.max(Number(page) || 1, 1);
    const skip = (safePage - 1) * safeLimit;

    const filter = { status: "active" };
    const andClauses = [buildUpcomingFilter()];
    const day = date ? parseDateKey(String(date)) : null;

    const sub = subcategory || category;
    if (sub && sub !== "All") {
      const cats = String(sub).split(",").map((c) => c.trim());
      filter.subcategory = { $in: cats };
    }

    filter.$and = andClauses;

    if (search) {
      const escapedSearch = String(search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$and = filter.$and || [];
      filter.$and.push({
        $or: [
          { title: { $regex: escapedSearch, $options: "i" } },
          { description: { $regex: escapedSearch, $options: "i" } },
          { organizer: { $regex: escapedSearch, $options: "i" } },
          { venue: { $regex: escapedSearch, $options: "i" } },
        ],
      });
    }

    const { applyGeoFilter, buildSortOption, buildLocationRegex, applyCountryFilter } = require("../utils/geoQuery");
    if (locationFilter) {
      filter.location = buildLocationRegex(locationFilter);
    }
    applyGeoFilter(filter, lat, lng, radius);
    applyCountryFilter(filter, countryCode);

    const sortOption = date
      ? { startDate: 1, createdAt: -1 }
      : buildSortOption(sort || "newest", !!(lat && lng), !!search);

    const fetchLimit = day ? Math.min(300, safeLimit * 10) : safeLimit + 1;
    let listings = await Event.find(filter, LIST_PROJECTION)
      .sort(sortOption)
      .skip(day ? 0 : skip)
      .limit(fetchLimit)
      .populate("seller", "name profileImage")
      .lean();

    // Repair corrupt structured dates (e.g. year 0026) from eventDate text.
    for (const listing of listings) {
      const patch = repairEventDatesIfNeeded(listing);
      if (patch) {
        listing.startDate = patch.startDate;
        listing.endDate = patch.endDate;
        void Event.updateOne({ _id: listing._id }, { $set: patch });
      }
    }

    listings = listings.filter((e) => !isEventExpired(e));

    if (filterWeekend) {
      listings = listings.filter((e) => eventOccursOnUpcomingWeekend(e));
    }

    let hasMore = false;
    if (day) {
      listings = listings.filter((e) => eventOccursOnDate(e, day));
      hasMore = listings.length > skip + safeLimit;
      listings = listings.slice(skip, skip + safeLimit);

      // Wide fallback when geo/structured filters hid text-dated events
      if (listings.length === 0 && skip === 0) {
        const fallbackFilter = { status: "active", eventDate: { $exists: true, $ne: "" } };
        if (filter.subcategory) fallbackFilter.subcategory = filter.subcategory;
        const fallback = await Event.find(fallbackFilter, LIST_PROJECTION)
          .sort({ createdAt: -1 })
          .limit(200)
          .populate("seller", "name profileImage")
          .lean();
        listings = fallback.filter((e) => eventOccursOnDate(e, day) && !isEventExpired(e));
        for (const listing of listings) {
          const patch = repairEventDatesIfNeeded(listing);
          if (patch) {
            listing.startDate = patch.startDate;
            listing.endDate = patch.endDate;
            void Event.updateOne({ _id: listing._id }, { $set: patch });
          }
        }
        hasMore = false;
      }
    } else {
      hasMore = listings.length > safeLimit;
      if (hasMore) listings = listings.slice(0, safeLimit);
    }

    // Legacy events without structured dates: include when filtering by date if text matches
    if (day) {
      const legacyFilter = {
        status: "active",
        $or: [{ startDate: null }, { startDate: { $exists: false } }],
      };
      if (filter.subcategory) legacyFilter.subcategory = filter.subcategory;
      const legacy = await Event.find(legacyFilter, LIST_PROJECTION)
        .sort({ createdAt: -1 })
        .limit(100)
        .populate("seller", "name profileImage")
        .lean();
      const legacyOnDay = legacy.filter((e) => eventOccursOnDate(e, day) && !isEventExpired(e));
      const seen = new Set(listings.map((l) => String(l._id)));
    for (const item of legacyOnDay) {
        if (!seen.has(String(item._id))) {
          listings.push(item);
          const patch = repairEventDatesIfNeeded(item);
          if (patch) {
            item.startDate = patch.startDate;
            item.endDate = patch.endDate;
            void Event.updateOne({ _id: item._id }, { $set: patch });
          }
        }
    }
    }

    listings.forEach(normaliseImages);

    res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=120");
    res.status(200).json({
      success: true,
      listings,
      pagination: {
        page: safePage,
        limit: safeLimit,
        hasMore,
      },
    });
  } catch (error) {
    logger.error("Get upcoming events error:", error);
    res.status(500).json({ success: false, message: "Failed to load upcoming events" });
  }
};

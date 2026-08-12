/**
 * Aggregated feed endpoint.
 * Returns listings from all 13 categories in a single API call,
 * reducing 13 parallel requests from the client to 1.
 */
const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();
const { applyGeoFilter, buildLocationRegex, applyCountryFilter } = require("../utils/geoQuery");
const { esHydratedSearch } = require("../utils/esSearch");
const redis = require("../config/redis");
const { logger } = require("../utils/logger");
const { optionalAuth } = require("../middleware/auth.middleware");
const { responseCache } = require("../services/memorycache.service");

const CATEGORY_MODELS = {
  electronics: require("../models/electronics.model"),
  vehicles: require("../models/vehicle.model"),
  forsale: require("../models/forsale.model"),
  mobiles: require("../models/mobile.model"),
  furniture: require("../models/furniture.model"),
  fashion: require("../models/fashion.model"),
  toys: require("../models/toy.model"),
  sports: require("../models/sports.model"),
  collectibles: require("../models/collectible.model"),
  pets: require("../models/pet.model"),
  books: require("../models/book.model"),
  beauty: require("../models/beauty.model"),
  others: require("../models/other.model"),
  jobs: require("../models/job.model"),
  events: require("../models/event.model"),
  properties: require("../models/property.model"),
  services: require("../models/servicelisting.model"),
  takecare: require("../models/takecare.model"),
};

const LISTING_PROJECTION = {
  title: 1,
  slug: 1,
  price: 1,
  pricing: 1,
  currency: 1,
  location: 1,
  countryCode: 1,
  images: { $slice: 1 },
  condition: 1,
  category: 1,
  subcategory: 1,
  createdAt: 1,
  coordinates: 1,
  seller: 1,
  sellerName: 1,
  companyLogo: 1,
  companyName: 1,
  jobType: 1,
  workMode: 1,
  employmentType: 1,
  experience: 1,
  salary: 1,
  salaryType: 1,
  appliedBy: 1,
  savedBy: 1,
};

function haversineDistanceKm(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function attachListingDistance(listings, lat, lng) {
  const userLat = Number(lat);
  const userLng = Number(lng);
  if (!Number.isFinite(userLat) || !Number.isFinite(userLng)) return listings;

  return listings.map((listing) => {
    const coords = listing?.coordinates?.coordinates;
    if (Array.isArray(coords) && coords.length >= 2) {
      const listingLng = Number(coords[0]);
      const listingLat = Number(coords[1]);
      if (Number.isFinite(listingLat) && Number.isFinite(listingLng)) {
        listing.distance = haversineDistanceKm(userLat, userLng, listingLat, listingLng);
      }
    }
    return listing;
  });
}

/**
 * GET /api/feed
 * Query params:
 *   limit     – per-category limit (default 8, max 100)
 *   page      – page number (default 1)
 *   search    – text search across title/description
 *   location  – text location filter
 *   lat, lng  – geo center for $geoWithin filter
 *   radius    – km radius for geo filter (default 50)
 */
router.get("/", optionalAuth, async (req, res) => {
  try {
    const {
      limit: rawLimit,
      page: rawPage,
      search,
      location,
      lat,
      lng,
      radius = 50,
      countryCode,
    } = req.query;

    const limit = Math.min(Math.max(parseInt(rawLimit, 10) || 8, 1), 100);
    const page = Math.max(parseInt(rawPage, 10) || 1, 1);
    const skip = (page - 1) * limit;
    const useEsSearch = Boolean(search && !lat && !lng);
    const excludeSellerId = req.user?._id ? String(req.user._id) : null;
    const feedCacheControl = excludeSellerId
      ? 'private, max-age=30'
      : 'public, max-age=30, stale-while-revalidate=120';
    const feedProjection = excludeSellerId && mongoose.Types.ObjectId.isValid(excludeSellerId)
      ? {
          ...LISTING_PROJECTION,
          savedBy: { $elemMatch: { $eq: new mongoose.Types.ObjectId(excludeSellerId) } },
        }
      : LISTING_PROJECTION;

    // ── Redis cache (60s TTL) ───────────────────────────────────
    const cacheKey = `feed:${page}:${limit}:${search || ''}:${location || ''}:${lat || ''}:${lng || ''}:${radius}:cc:${countryCode || ''}:ex:${excludeSellerId || "0"}`;
    const memoryCached = responseCache.get(cacheKey);
    if (memoryCached) {
      res.setHeader('X-Cache', 'HIT');
      res.setHeader('X-Cache-Layer', 'memory');
      res.setHeader('Cache-Control', feedCacheControl);
      return res.status(200).json(memoryCached);
    }

    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        const parsed = typeof cached === 'string' ? JSON.parse(cached) : cached;
        responseCache.set(cacheKey, parsed, 30);
        res.setHeader('X-Cache', 'HIT');
        res.setHeader('X-Cache-Layer', 'redis');
        res.setHeader('Cache-Control', feedCacheControl);
        return res.status(200).json(parsed);
      }
    } catch { /* cache miss — continue to DB */ }

    // Build shared filter
    const baseFilter = { status: "active" };

    if (excludeSellerId) {
      baseFilter.seller = { $ne: excludeSellerId };
    }

    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(escaped, "i");
      baseFilter.$or = [{ title: regex }, { description: regex }];
    }

    if (location) {
      // Match any part of "Suburb, City" (e.g. Hitech City OR Hyderabad), not the
      // full string — so nearby areas like Madhapur still appear with GPS + city.
      const regexFilter = buildLocationRegex(location);
      if (regexFilter) {
        baseFilter.location = regexFilter;
      } else {
        baseFilter.location = {
          $regex: location.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
          $options: "i",
        };
      }
    }

    const fetchFromMongo = async (Model) => {
      const filter = { ...baseFilter };

      // Apply geo filter per-model (each has its own coordinates field)
      if (lat && lng) {
        applyGeoFilter(filter, lat, lng, radius);
      }
      applyCountryFilter(filter, countryCode);

      const listings = await Model.find(filter, feedProjection)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit + 1)
        .populate("seller", "name profileImage")
        .lean();

      // .lean() bypasses toJSON transforms, so normalize image URLs manually
      const s3Service = require("../services/s3.service");
      for (const doc of listings) {
        if (Array.isArray(doc.images)) {
          doc.images = doc.images.map((img) => {
            const url = typeof img === "object" ? img.url || img.src : img;
            return url ? s3Service.toProxyUrl(url) : url;
          });
        }
      }

      const hasMore = listings.length > limit;
      const pageListings = hasMore ? listings.slice(0, limit) : listings;

      return { listings: lat && lng ? attachListingDistance(pageListings, lat, lng) : pageListings, hasMore, source: "mongodb" };
    };

    // Run all category queries in parallel
    const entries = Object.entries(CATEGORY_MODELS);
    const results = await Promise.allSettled(
      entries.map(async ([key, Model]) => {
        if (useEsSearch) {
          const esResult = await esHydratedSearch({
            entity: key,
            searchParams: {
              query: search,
              location,
              page,
              limit,
              sort: "relevance",
            },
            Model,
            projection: feedProjection,
            populate: [],
          });

          if (esResult) {
            const total = esResult.pagination?.total || esResult.docs.length;
            return {
              key,
              listings: esResult.docs,
              hasMore: total > page * limit,
              source: "elasticsearch",
            };
          }
        }

        const mongoResult = await fetchFromMongo(Model);
        return { key, ...mongoResult };
      }),
    );

    // Assemble response
    const feed = {};
    let total = 0;
    let hasMore = false;
    let hasElastic = false;
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const catKey = entries[i][0];
      if (result.status === "fulfilled") {
        const { key, listings, hasMore: catHasMore, source } = result.value;
        feed[key] = {
          listings: listings.map((l) => ({ ...l, _source: key })),
          count: listings.length,
          hasMore: !!catHasMore,
        };
        total += listings.length;
        if (catHasMore) hasMore = true;
        if (source === "elasticsearch") hasElastic = true;
      } else {
        // Category query failed — return empty with the actual category key
        feed[catKey] = {
          listings: [],
          count: 0,
          hasMore: false,
          error: result.reason?.message,
        };
      }
    }

    if (hasElastic) {
      res.setHeader("X-Search-Source", "elasticsearch");
    }

    const responseBody = {
      success: true,
      total,
      pagination: {
        page,
        limit,
        hasMore,
      },
      categories: feed,
    };

    // Cache for 60s (non-blocking)
    responseCache.set(cacheKey, responseBody, 30);
    redis.setex(cacheKey, 60, JSON.stringify(responseBody)).catch(() => {});
    res.setHeader('X-Cache', 'MISS');
    res.setHeader('Cache-Control', feedCacheControl);

    res.status(200).json(responseBody);
  } catch (err) {
    logger.error('Feed endpoint error', { error: err.message });
    res.status(500).json({
      success: false,
      message: "Failed to fetch feed",
    });
  }
});

// ── GET /api/feed/my-listings — all user listings across every category ──
router.get("/my-listings", require("../middleware/auth.middleware").protect, async (req, res) => {
  try {
    const userId = req.user._id;
    const s3Service = require("../services/s3.service");

    const entries = Object.entries(CATEGORY_MODELS);
    const results = await Promise.allSettled(
      entries.map(async ([key, Model]) => {
        // services use "userId" instead of "seller"
        const filter = key === "services"
          ? { userId }
          : { seller: userId };

        const listings = await Model.find(filter)
          .select({ ...LISTING_PROJECTION, status: 1, seller: 1 })
          .populate("seller", "name profileImage")
          .sort({ createdAt: -1 })
          .lean();

        for (const doc of listings) {
          if (Array.isArray(doc.images)) {
            doc.images = doc.images.map((img) => {
              const url = typeof img === "object" ? img.url || img.src : img;
              return url ? s3Service.toProxyUrl(url) : url;
            });
          }
          doc._source = key;
        }
        return { key, listings };
      }),
    );

    let all = [];
    for (const r of results) {
      if (r.status === "fulfilled") all.push(...r.value.listings);
    }
    all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.status(200).json({ success: true, listings: all });
  } catch (err) {
    logger.error("Feed my-listings error", { error: err.message });
    res.status(500).json({ success: false, message: "Failed to fetch my listings" });
  }
});

// ── PATCH /api/feed/listings/:category/:id/status ─────────────────────────
// Unified "mark as sold / inactive / re-activate" endpoint.
router.patch(
  "/listings/:category/:id/status",
  require("../middleware/auth.middleware").protect,
  async (req, res) => {
    try {
      const { category, id } = req.params;
      const userId = req.user._id;
      const {
        closeThreadsForListing,
        reopenThreadsForListing,
        invalidateListingCaches,
      } = require("../services/listing-thread-lifecycle.service");

      const Model = CATEGORY_MODELS[category];
      if (!Model) {
        return res.status(400).json({ success: false, message: "Unknown category" });
      }
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, message: "Invalid listing ID" });
      }

      const requestedStatus = String(req.body?.status || "sold").toLowerCase();
      const allowed = Model.schema.path("status")?.enumValues || [];
      let nextStatus = requestedStatus;
      if (!allowed.includes(nextStatus)) {
        const map = {
          sold: ["sold", "inactive", "rented"],
          inactive: ["inactive", "sold"],
          active: ["active"],
        };
        const candidates = map[requestedStatus] || [requestedStatus];
        nextStatus = candidates.find((c) => allowed.includes(c));
        if (!nextStatus) {
          return res.status(400).json({
            success: false,
            message: `Status "${requestedStatus}" not supported for ${category}`,
          });
        }
      }

      const listing = await Model.findById(id);
      if (!listing) {
        return res.status(404).json({ success: false, message: "Listing not found" });
      }

      const ownerField = category === "services" ? "userId" : "seller";
      const ownerId = listing[ownerField]?.toString();
      if (!ownerId || ownerId !== userId.toString()) {
        return res.status(403).json({
          success: false,
          message: "Not authorized to update this listing",
        });
      }

      listing.status = nextStatus;
      await listing.save();

      if (nextStatus === "active") {
        void reopenThreadsForListing({
          listingId: listing._id,
          category,
          userId,
        }).catch((err) => {
          logger.error("[feed] reopen threads error", { error: err.message });
        });
      } else {
        const msg =
          nextStatus === "inactive"
            ? "Service marked as inactive. Conversation closed."
            : "Product marked as sold. Conversation closed.";
        void closeThreadsForListing({
          listingId: listing._id,
          category,
          userId,
          reason: "sold",
          systemMessage: msg,
        }).catch((err) => {
          logger.error("[feed] close threads error", { error: err.message });
        });
      }

      invalidateListingCaches(category, id);

      return res.status(200).json({
        success: true,
        message: `Listing marked as ${nextStatus}`,
        listing: { _id: listing._id, status: listing.status },
      });
    } catch (err) {
      logger.error("Feed update-status error", { error: err.message });
      return res
        .status(500)
        .json({ success: false, message: "Failed to update listing status" });
    }
  },
);

// ── DELETE /api/feed/listings/:category/:id ───────────────────────────────
// Fast unified delete — closes chats as read-only, removes listing from feeds.
router.delete(
  "/listings/:category/:id",
  require("../middleware/auth.middleware").protect,
  async (req, res) => {
    try {
      const { category, id } = req.params;
      const userId = req.user._id;
      const {
        closeThreadsForListing,
        invalidateListingCaches,
      } = require("../services/listing-thread-lifecycle.service");

      const Model = CATEGORY_MODELS[category];
      if (!Model) {
        return res.status(400).json({ success: false, message: "Unknown category" });
      }
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, message: "Invalid listing ID" });
      }

      const listing = await Model.findById(id);
      if (!listing) {
        return res.status(404).json({ success: false, message: "Listing not found" });
      }

      const ownerField = category === "services" ? "userId" : "seller";
      const ownerId = listing[ownerField]?.toString();
      if (!ownerId || ownerId !== userId.toString()) {
        return res.status(403).json({
          success: false,
          message: "Not authorized to delete this listing",
        });
      }

      const imageUrls = Array.isArray(listing.images) ? [...listing.images] : [];
      await Model.findByIdAndDelete(id);

      void closeThreadsForListing({
        listingId: listing._id,
        category,
        userId,
        reason: "deleted",
        systemMessage: "This listing was removed. Conversation is read-only.",
      }).catch((err) => {
        logger.error("[feed] delete close threads error", { error: err.message });
      });

      invalidateListingCaches(category, id);

      // Background image cleanup (non-blocking)
      if (imageUrls.length > 0) {
        try {
          const { publishImageCleanup } = require("../queues/producers/listing.producer");
          publishImageCleanup({ imageUrls }).catch(() => {});
        } catch {
          // optional queue
        }
      }

      return res.status(200).json({
        success: true,
        message: "Listing deleted successfully",
      });
    } catch (err) {
      logger.error("Feed delete listing error", { error: err.message });
      return res
        .status(500)
        .json({ success: false, message: "Failed to delete listing" });
    }
  },
);

// ── GET /api/feed/saved — all saved listings across every category ──
router.get("/saved", require("../middleware/auth.middleware").protect, async (req, res) => {
  try {
    const userId = req.user._id;
    const s3Service = require("../services/s3.service");

    const entries = Object.entries(CATEGORY_MODELS);
    const results = await Promise.allSettled(
      entries.map(async ([key, Model]) => {
        const listings = await Model.find({ savedBy: userId, status: "active" })
          .select({ ...LISTING_PROJECTION, seller: 1 })
          .populate("seller", "name profileImage isVerified")
          .sort({ createdAt: -1 })
          .lean();

        for (const doc of listings) {
          if (Array.isArray(doc.images)) {
            doc.images = doc.images.map((img) => {
              const url = typeof img === "object" ? img.url || img.src : img;
              return url ? s3Service.toProxyUrl(url) : url;
            });
          }
          if (doc.companyLogo) {
            doc.companyLogo = s3Service.toProxyUrl(doc.companyLogo);
          }
          if (doc.seller?.profileImage) {
            doc.seller.profileImage = s3Service.toProxyUrl(doc.seller.profileImage);
          }
          doc._source = key;
          doc._saved = true;
        }
        return { key, listings };
      }),
    );

    let all = [];
    for (const r of results) {
      if (r.status === "fulfilled") all.push(...r.value.listings);
    }
    all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.status(200).json({ success: true, listings: all });
  } catch (err) {
    logger.error("Feed saved error", { error: err.message });
    res.status(500).json({ success: false, message: "Failed to fetch saved listings" });
  }
});

module.exports = router;

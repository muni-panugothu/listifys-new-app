const ServiceListing = require('../models/servicelisting.model');
const ServiceCategory = require('../models/servicecategory.model');
const ServiceReview = require('../models/servicereview.model');
const mongoose = require('mongoose');
const { logger } = require('../utils/logger');
const { parsePagination, paginatedFind } = require('../utils/pagination');
const S3Service = require('../services/s3.service');
const { escapeRegex } = require('../utils/geoQuery');
const { esHydratedSearch } = require('../utils/esSearch');

// ── RabbitMQ Producers ─────────────────────────────────────────────────────────
const {
  publishListingCreated,
  publishListingUpdated,
  publishListingDeleted,
  publishImageCleanup,
} = require('../queues/producers/listing.producer');

const normalizePriceType = (rawPriceType) => {
  const value = String(rawPriceType || '').trim().toLowerCase();
  if (!value) return 'fixed';

  const map = {
    fixed: 'fixed',
    hourly: 'hourly',
    daily: 'daily',
    weekly: 'weekly',
    monthly: 'monthly',
    project: 'project',
    'per project': 'project',
    'per visit': 'daily',
    negotiable: 'fixed',
  };

  return map[value] || 'fixed';
};

// Normalize image URLs — always returns plain string URLs so the client
// receives images as string[] matching the ListingItem type.
const normaliseImages = (listing) => {
  if (!listing) return listing;
  if (listing.images && Array.isArray(listing.images)) {
    listing.images = listing.images
      .map(img => {
        if (typeof img === 'string') return S3Service.toProxyUrl(img) || null;
        if (img && typeof img === 'object' && img.url) return S3Service.toProxyUrl(img.url) || null;
        return null;
      })
      .filter(Boolean);
  }
  return listing;
};

/** Attach average rating + review count from ServiceReview for hub cards. */
async function attachReviewStats(listings) {
  if (!Array.isArray(listings) || listings.length === 0) return listings;

  const ids = listings.map((l) => l._id).filter(Boolean);
  if (ids.length === 0) return listings;

  const aggregates = await ServiceReview.aggregate([
    { $match: { listingId: { $in: ids }, status: 'published' } },
    {
      $group: {
        _id: '$listingId',
        rating: { $avg: '$rating' },
        reviewCount: { $sum: 1 },
      },
    },
  ]);

  const byListing = new Map(
    aggregates.map((row) => [
      String(row._id),
      {
        rating: Math.round(row.rating * 10) / 10,
        reviewCount: row.reviewCount,
      },
    ]),
  );

  for (const listing of listings) {
    const stats = byListing.get(String(listing._id));
    if (!stats) continue;
    listing.stats = listing.stats || {};
    listing.stats.rating = stats.rating;
    listing.stats.reviewCount = stats.reviewCount;
  }

  return listings;
};

const USER_POPULATE_FIELDS = 'name profileImage googleProfileImage avatar';

// @desc    Get all service listings
// @route   GET /api/services/listings
exports.getListings = async (req, res) => {
  try {
    const { category, subcategory, minPrice, maxPrice, search, location, countryCode } = req.query;
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    const radius = parseFloat(req.query.radius) || 100; // km, default 100
    const hasGeo = !isNaN(lat) && !isNaN(lng);
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);
    
    const { sort = '-createdAt' } = req.query;
    const ALLOWED_SORTS = ['-createdAt', 'createdAt', 'pricing.basePrice', '-pricing.basePrice', 'serviceAvailability', '-serviceAvailability'];
    const safeSort = ALLOWED_SORTS.includes(sort) ? sort : '-createdAt';
    const sortObj = safeSort.startsWith('-')
      ? { [safeSort.slice(1)]: -1 }
      : { [safeSort]: 1 };

    const filter = { status: 'active', visibility: 'public' };

    // ── Elasticsearch-first search (MongoDB regex fallback below) ──
    if (search) {
      const esResult = await esHydratedSearch({
        entity: 'services',
        searchParams: { query: search, location, sort: 'relevance', page, limit },
        Model: ServiceListing,
        populate: [{ path: 'userId', select: USER_POPULATE_FIELDS }, { path: 'category', select: 'name' }],
      });

      if (esResult) {
        esResult.docs.forEach(normaliseImages);
        await attachReviewStats(esResult.docs);
        res.setHeader('X-Search-Source', 'elasticsearch');
        return res.status(200).json({
          success: true,
          data: esResult.docs,
          pagination: esResult.pagination,
        });
      }
    }
    
    if (search) {
      const escapedSearch = String(search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { title: { $regex: escapedSearch, $options: "i" } },
        { description: { $regex: escapedSearch, $options: "i" } },
      ];
    }
    
    if (category) {
      if (mongoose.Types.ObjectId.isValid(category)) {
        filter.category = category;
      } else {
        // Try matching by name first (exact, case-insensitive)
        let catObj = await ServiceCategory.findOne({ name: { $regex: new RegExp(`^${category.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } });
        // If not found by name, try matching by slug
        if (!catObj) {
          const slug = category.toLowerCase().replace(/\s+/g, '-');
          catObj = await ServiceCategory.findOne({ slug: slug });
        }
        if (catObj) filter.category = catObj._id;
      }
    }
    
    if (subcategory) {
      // Support slug-style (e.g. "personal-trainer") and name-style (e.g. "Personal Trainer")
      const subName = subcategory.replace(/-/g, ' ');
      filter.subcategory = { $regex: new RegExp(`^${subName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') };
    }
    if (minPrice || maxPrice) {
      filter['pricing.basePrice'] = {};
      if (minPrice) filter['pricing.basePrice'].$gte = Number(minPrice);
      if (maxPrice) filter['pricing.basePrice'].$lte = Number(maxPrice);
    }
    if (location) filter['location.address'] = { $regex: escapeRegex(location), $options: 'i' };

    // ── Geographic or country scoping ────────────────────────────────────────
    // Priority: geo-coordinates (precise) > countryCode (broad) > none (all)
    if (hasGeo) {
      // Use MongoDB $geoWithin with $centerSphere for listings that have coordinates.
      // Also include listings without coordinates but matching the same country —
      // so newly posted listings (no coords yet) still appear for the right user.
      const radiusRadians = radius / 6371; // Earth radius ≈ 6371 km
      const geoOr = [
        {
          'location.coordinates': {
            $geoWithin: { $centerSphere: [[lng, lat], radiusRadians] },
          },
        },
        // Include listings with no coordinates (posted without GPS):
        // match by countryCode if available, otherwise include all
        ...(countryCode
          ? [{ countryCode: { $regex: new RegExp(`^${countryCode.toUpperCase().trim()}$`, 'i') }, 'location.coordinates': { $exists: false } }]
          : [{ 'location.coordinates': { $exists: false } }]
        ),
      ];
      if (filter.$or) {
        filter.$and = (filter.$and || []).concat([{ $or: filter.$or }, { $or: geoOr }]);
        delete filter.$or;
      } else {
        filter.$or = geoOr;
      }
    } else if (countryCode && typeof countryCode === 'string') {
      // No GPS — fall back to country-level scoping, always including listings without a countryCode
      const code = countryCode.toUpperCase().trim();
      const ccOr = [
        { countryCode: { $regex: new RegExp(`^${code}$`, 'i') } },
        { countryCode: { $exists: false } },
        { countryCode: { $in: [null, ''] } },
      ];
      if (filter.$or) {
        filter.$and = (filter.$and || []).concat([{ $or: filter.$or }, { $or: ccOr }]);
        delete filter.$or;
      } else {
        filter.$or = ccOr;
      }
    }
    // else: no location context — return all active public listings

    const skip = (Number(page) - 1) * Number(limit);
    
    const [listings, total] = await Promise.all([
      ServiceListing.find(filter)
        .sort(sortObj)
        .skip(skip)
        .limit(Number(limit))
        .populate('userId', USER_POPULATE_FIELDS)
        .populate('category', 'name')
        .lean(),
      ServiceListing.countDocuments(filter)
    ]);
    
    listings.forEach(normaliseImages);
    await attachReviewStats(listings);
    
    res.status(200).json({
      success: true,
      data: listings,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error('Error in getListings:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// @desc    Get service listing by ID
exports.getListingById = async (req, res) => {
  try {
    const param = req.params.id;
    const isObjectId = mongoose.Types.ObjectId.isValid(param);
    
    const listing = isObjectId
      ? await ServiceListing.findById(param)
          .populate('userId', 'name profileImage')
          .populate('category', 'name')
          .lean()
      : await ServiceListing.findOne({ slug: param, status: 'active' })
          .populate('userId', 'name profileImage')
          .populate('category', 'name')
          .lean();
      
    if (!listing) return res.status(404).json({ success: false, message: 'Listing not found' });
    
    normaliseImages(listing);
    res.status(200).json({ success: true, data: listing });
  } catch (error) {
    logger.error('Error in getListingById:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// @desc    Create service listing
exports.createListing = async (req, res) => {
  try {
    const {
      title, description, category, subcategory, price, location, phone, phoneCode, currency, countryCode, images, lat, lng,
      condition,
      // Service-specific fields
      serviceType, experience, availability, priceType,
      serviceArea, certification, languages, teamSize,
      turnaroundTime, portfolioLink,
    } = req.body;

    const normalisedImages = Array.isArray(images)
      ? images
          .map((img) => {
            if (typeof img === 'string' && img.trim()) return { url: img.trim() };
            if (img && typeof img === 'object' && typeof img.url === 'string' && img.url.trim()) {
              return {
                url: img.url.trim(),
                publicId: img.publicId || '',
                isPrimary: !!img.isPrimary,
              };
            }
            return null;
          })
          .filter(Boolean)
      : [];

    const availabilityObject =
      availability && typeof availability === 'object' && !Array.isArray(availability)
        ? availability
        : undefined;
    const availabilityText = typeof availability === 'string' ? availability.trim() : '';
    const normalizedPriceType = normalizePriceType(priceType);
    const isNegotiable = String(priceType || '').trim().toLowerCase() === 'negotiable';
    
    // Validate category – accept ObjectId OR name string
    let catId = category;
    if (!mongoose.Types.ObjectId.isValid(catId)) {
      const catObj = await ServiceCategory.findOne({ name: category });
      if (catObj) catId = catObj._id;
      else {
        // For hardcoded "Services" category in PostAd, create/find a generic one
        let genericCat = await ServiceCategory.findOne({ name: 'Services' });
        if (!genericCat) {
          genericCat = await ServiceCategory.create({
            name: 'Services',
            slug: 'services',
            image: 'https://images.unsplash.com/photo-1521791136064-7986c2920216?w=600&h=400&fit=crop',
            subcategories: []
          });
        }
        catId = genericCat._id;
      }
    }
    
    const sellerName = req.user.firstName
      ? `${req.user.firstName} ${req.user.lastName || ''}`.trim()
      : req.user.email?.split('@')[0] || 'User';
    
    const listing = await ServiceListing.create({
      userId: req.user._id,
      title,
      description,
      category: catId,
      subcategory,
      pricing: {
        basePrice: Number(price),
        priceType: normalizedPriceType,
        negotiable: isNegotiable,
      },
      location: lat && lng
        ? { type: 'Point', coordinates: [Number(lng), Number(lat)], address: location || '' }
        : { address: location || '' },
      phone,
      phoneCode,
      currency,
      countryCode,
      images: normalisedImages,
      availability: availabilityObject,
      // Service-specific
      serviceType: serviceType || '',
      experience: experience || '',
      serviceAvailability: availabilityText,
      priceType: priceType || 'fixed',
      serviceArea: serviceArea || '',
      certification: certification || '',
      languages: languages || '',
      teamSize: teamSize || '',
      turnaroundTime: turnaroundTime || '',
      portfolioLink: portfolioLink || '',
      seller: req.user._id.toString(),
      sellerName,
    });
    
    const populated = await ServiceListing.findById(listing._id)
      .populate('userId', 'name profileImage')
      .populate('category', 'name').lean();
      
    normaliseImages(populated);
    res.status(201).json({ success: true, listing: populated, data: populated });

    // ✅ Background via RabbitMQ (non-blocking)
    publishListingCreated({
      entity: 'services',
      listing: populated,
      userId: req.user._id.toString(),
      ip: req.ip,
      userAgent: req.get('user-agent'),
    }).catch(() => {});
  } catch (error) {
    logger.error('Error in createListing:', error);
    console.error('[createListing] Full error stack:', error?.stack);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({ success: false, message: messages.join('; '), errors: messages });
    }
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'Duplicate entry detected' });
    }
    const isDev = process.env.NODE_ENV !== 'production';
    return res.status(500).json({ success: false, message: error.message || 'Failed to create listing', ...(isDev ? { stack: error.stack } : {}) });
  }
};

// Update
exports.updateListing = async (req, res) => {
  try {
    const listing = await ServiceListing.findById(req.params.id);
    if (!listing) return res.status(404).json({ success: false, message: 'Not found' });
    if (listing.userId.toString() !== req.user._id.toString()) return res.status(403).json({ success: false, message: 'Unauthorized' });
    
    const allowed = [
      'title', 'description', 'category', 'subcategory', 'price', 'pricing', 'images', 'location', 'status',
      'phone', 'phoneCode', 'currency',
      'serviceType', 'experience', 'availability', 'serviceAvailability',
      'priceType', 'serviceArea', 'certification', 'languages', 'teamSize',
      'turnaroundTime', 'portfolioLink', 'lat', 'lng'
    ];

    for (const field of allowed) {
      if (req.body[field] !== undefined) {
        if (field === 'price') {
          listing.pricing = { 
            ...listing.pricing,
            basePrice: Number(req.body.price) 
          };
        } else if (field === 'images' && Array.isArray(req.body.images)) {
          listing.images = req.body.images.map(img => 
            typeof img === 'string' ? { url: img } : img
          );
        } else if (field === 'availability' || field === 'serviceAvailability') {
          const incoming = req.body[field];
          if (incoming && typeof incoming === 'object' && !Array.isArray(incoming)) {
            listing.availability = incoming;
          } else if (typeof incoming === 'string') {
            listing.serviceAvailability = incoming;
          }
        } else if (field === 'location') {
          if (typeof req.body.location === 'object') {
            listing.location = {
              ...listing.location,
              ...req.body.location
            };
          } else if (typeof req.body.location === 'string') {
            listing.location.address = req.body.location;
          }
        } else if (field === 'lat' || field === 'lng') {
          if (!listing.location.coordinates) listing.location.coordinates = [0, 0];
          if (field === 'lat') listing.location.coordinates[1] = Number(req.body.lat);
          if (field === 'lng') listing.location.coordinates[0] = Number(req.body.lng);
          listing.markModified('location.coordinates');
        } else if (field === 'category') {
          if (!mongoose.Types.ObjectId.isValid(req.body.category)) {
            const catObj = await ServiceCategory.findOne({ name: req.body.category });
            if (catObj) listing.category = catObj._id;
          } else {
            listing.category = req.body.category;
          }
        } else {
          listing[field] = req.body[field];
        }
      }
    }

    // Handle priceType if updated separately or via price logic
    if (req.body.priceType) {
      const normalizedPriceType = normalizePriceType(req.body.priceType);
      const isNegotiable =
        String(req.body.priceType || '').trim().toLowerCase() === 'negotiable';
      listing.pricing = {
        ...listing.pricing,
        priceType: normalizedPriceType,
        negotiable: isNegotiable
      };
    }

    await listing.save();
    
    res.status(200).json({ success: true, data: listing });

    // ✅ Background via RabbitMQ (non-blocking)
    publishListingUpdated({
      entity: 'services',
      listing: listing.toObject(),
      userId: req.user._id.toString(),
      ip: req.ip,
    }).catch(() => {});
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Delete
exports.deleteListing = async (req, res) => {
  try {
    const listing = await ServiceListing.findById(req.params.id);
    if (!listing) return res.status(404).json({ success: false, message: 'Not found' });
    if (listing.userId.toString() !== req.user._id.toString()) return res.status(403).json({ success: false, message: 'Unauthorized' });
    
    const listingData = listing.toObject();
    const imageUrls = (listingData.images || []).map(img => img.url || img).filter(Boolean);

    await ServiceListing.findByIdAndDelete(req.params.id);
    res.status(200).json({ success: true, message: 'Deleted' });

    // ✅ Background via RabbitMQ (non-blocking)
    publishListingDeleted({
      entity: 'services',
      listingId: req.params.id,
      listing: listingData,
      userId: req.user._id.toString(),
    }).catch(() => {});

    if (imageUrls.length > 0) {
      publishImageCleanup({ imageUrls }).catch(() => {});
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Get My Listings
exports.getMyListings = async (req, res) => {
  try {
    const { page, limit } = parsePagination(req.query, { limit: 20 });
    const { items, pagination } = await paginatedFind({
      model: ServiceListing,
      filter: { userId: req.user._id },
      populate: [{ path: 'category', select: 'name slug' }],
      page,
      limit,
    });
    items.forEach(normaliseImages);
    res.status(200).json({ success: true, data: items, pagination });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Get Saved Listings
exports.getSavedListings = async (req, res) => {
  try {
    const { page, limit } = parsePagination(req.query, { limit: 20 });
    const { items, pagination } = await paginatedFind({
      model: ServiceListing,
      filter: { savedBy: req.user._id },
      populate: [{ path: 'category', select: 'name slug' }],
      page,
      limit,
    });
    items.forEach(normaliseImages);
    res.status(200).json({ success: true, data: items, pagination });
  } catch (err) {
     res.status(500).json({ success: false, message: err.message });
  }
};

// Toggle Save — atomic update for speed
exports.toggleSaveListing = async (req, res) => {
  try {
    const userId = req.user._id;
    const listingId = req.params.id;
    
    // Check if already saved using a lean query (fast)
    const listing = await ServiceListing.findById(listingId).select('savedBy').lean();
    if (!listing) return res.status(404).json({ success: false, message: 'Not found' });
    
    const isSaved = listing.savedBy?.some(id => id.toString() === userId.toString());
    
    // Atomic update — no race conditions, no full doc load
    if (isSaved) {
      await ServiceListing.updateOne({ _id: listingId }, { $pull: { savedBy: userId } });
    } else {
      await ServiceListing.updateOne({ _id: listingId }, { $addToSet: { savedBy: userId } });
    }
    
    res.status(200).json({ success: true, saved: !isSaved });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Upload Images
exports.uploadImages = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) return res.status(400).json({ success: false, message: 'No images' });
    const imageUrls = [];
    for (const file of req.files) {
      const result = await S3Service.uploadListingImage(file.buffer, req.user._id.toString(), file.mimetype, 'services');
      imageUrls.push(result.imageUrl);
    }
    res.status(200).json({ success: true, imageUrls });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Increment Views
exports.incrementViews = async (req, res) => {
  try {
     const mongoose = require('mongoose');
     if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
       return res.status(400).json({ success: false, message: 'Invalid ID' });
     }
     await ServiceListing.updateOne(
       { _id: req.params.id },
       { $inc: { 'stats.views': 1 } }
     );
     res.status(200).json({ success: true });
  } catch (err) {
     res.status(500).json({ success: false });
  }
};

// Nearby
exports.getNearbyListings = async (req, res) => {
  try {
     const { lat, lng, maxDistance = 5000 } = req.query;
     if (!lat || !lng) return res.status(400).json({ success: false, message: 'lat/lng required' });
     const userLat = Number(lat);
     const userLng = Number(lng);
     if (isNaN(userLat) || isNaN(userLng)) {
       return res.status(400).json({ success: false, message: 'Invalid coordinates' });
     }
     const safeLimit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 200);
     
     const radiusKm = Number(maxDistance) / 1000;
     const listings = await ServiceListing.find({
       location: {
         $geoWithin: {
           $centerSphere: [
             [userLng, userLat],
             radiusKm / 6378.1,
           ],
         },
       },
       status: 'active',
       visibility: 'public'
     }).populate('category', 'name').limit(safeLimit).lean();
     
     listings.forEach(normaliseImages);
     res.status(200).json({ success: true, data: listings });
  } catch (err) {
     res.status(500).json({ success: false, message: 'Failed to fetch nearby listings' });
  }
};

const Job = require("../models/job.model.js");
const User = require("../models/user.model.js");
const mongoose = require("mongoose");
const { logger } = require("../utils/logger");
const { parsePagination, paginatedFind } = require("../utils/pagination");
const redis = require("../config/redis");
const ListingCache = require("../services/listingcache.service.js");
const S3Service = require("../services/s3.service.js");
const EmployerCompanyService = require("../services/employercompany.service.js");
const viewCounter = require("../services/viewcount.service.js");
const { esHydratedSearch } = require("../utils/esSearch");

const {
  publishListingCreated,
  publishListingUpdated,
  publishListingDeleted,
  publishImageCleanup,
} = require("../queues/producers/listing.producer");

const LIST_PROJECTION = { currency: 1, slug: 1,
  title: 1,
  description: 1,
  price: 1,
  location: 1,
  condition: 1,
  category: 1,
  subcategory: 1,
  images: 1,
  companyLogo: 1,
  companyName: 1,
  companyWebsite: 1,
  companyEmail: 1,
  applyLink: 1,
  jobType: 1,
  experience: 1,
  education: 1,
  workSchedule: 1,
  shiftTiming: 1,
  salary: 1,
  salaryType: 1,
  workMode: 1,
  employmentType: 1,
  noticePeriod: 1,
  industry: 1,
  department: 1,
  responsibilities: 1,
  requirements: 1,
  functionalArea: 1,
  techStack: 1,
  tools: 1,
  certificationsRequired: 1,
  languageRequirement: 1,
  contractDuration: 1,
  workHoursPerWeek: 1,
  joiningDate: 1,
  applicationDeadline: 1,
  contactPerson: 1,
  contactEmail: 1,
  sellerName: 1,
  seller: 1,
  views: 1,
  features: 1,
  phone: 1,
  contactPhone: 1,
  status: 1,
  savedBy: 1,
  appliedBy: 1,
  createdAt: 1,
  coordinates: 1,
  countryCode: 1,
};

const VALID_SUBCATEGORIES = ["IT Jobs", "Non IT Jobs", "Part Time", "Contract Type"];

const normaliseImages = (listing) => {
  if (!listing) return listing;
  if (listing.images) {
    listing.images = listing.images.map((url) => S3Service.toProxyUrl(url));
  }
  if (listing.companyLogo) {
    listing.companyLogo = S3Service.toProxyUrl(listing.companyLogo);
  }
  if (listing.seller?.profileImage) {
    listing.seller.profileImage = S3Service.toProxyUrl(listing.seller.profileImage);
  }
  return listing;
};

async function attachJobApplicantPreviews(listings) {
  if (!Array.isArray(listings) || listings.length === 0) return listings;

  const idSet = new Set();
  for (const listing of listings) {
    const previewIds = [
      ...(listing.appliedBy || []).slice(-4),
      ...(listing.savedBy || []).slice(-4),
    ].map(String);
    previewIds.forEach((id) => idSet.add(id));
  }

  let userMap = new Map();
  if (idSet.size > 0) {
    const users = await User.find({ _id: { $in: [...idSet] } })
      .select("profileImage name")
      .lean();
    userMap = new Map(users.map((u) => [String(u._id), u]));
  }

  for (const listing of listings) {
    const appliedIds = (listing.appliedBy || []).map(String);
    const savedIds = (listing.savedBy || []).map(String);
    const uniqueIds = [...new Set([...appliedIds, ...savedIds])].slice(-4);

    listing.applicantAvatars = uniqueIds
      .map((id) => {
        const user = userMap.get(id);
        if (!user) return null;
        return {
          profileImage: user.profileImage ? S3Service.toProxyUrl(user.profileImage) : null,
          name: user.name,
        };
      })
      .filter(Boolean);
    listing.applicantCount = appliedIds.length;
    listing.interactionCount = uniqueIds.length;
  }

  return listings;
};

exports.createJob = async (req, res) => {
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
      contactPhone,
      features,
      images,
      videos,
      companyName,
      companyWebsite,
      companyEmail,
      applyLink,
      companyLogo,
      jobType,
      experience,
      education,
      skills,
      employmentType,
      workMode,
      workSchedule,
      shiftTiming,
      salary,
      salaryType,
      benefits,
      industry,
      department,
      noticePeriod,
      responsibilities,
      requirements,
      functionalArea,
      techStack,
      tools,
      certificationsRequired,
      languageRequirement,
      contractDuration,
      workHoursPerWeek,
      joiningDate,
      applicationDeadline,
      contactPerson,
      contactEmail,
      positions,
      aboutCompany,
      lat,
      lng,
    } = req.body;

    if (category !== "Jobs") {
      return res.status(400).json({
        success: false,
        message: `This endpoint only accepts category "Jobs". Received "${category}".`,
      });
    }

    if (!VALID_SUBCATEGORIES.includes(subcategory)) {
      return res.status(400).json({
        success: false,
        message: `Invalid subcategory "${subcategory}" for Jobs. Allowed: ${VALID_SUBCATEGORIES.join(", ")}`,
      });
    }

    if (!applyLink || !/^https?:\/\//i.test(String(applyLink).trim())) {
      return res.status(400).json({
        success: false,
        message: "Valid apply link is required",
      });
    }

    const salaryMin = Number(salary?.min || 0);
    const salaryMax = Number(salary?.max || salaryMin);
    const listingPrice = Number(price || salaryMin || 0);

    const existingProfile = await EmployerCompanyService.getProfileByUserId(req.user._id);
    const resolvedCompany = EmployerCompanyService.mergeCompanyFields(
      {
        companyName,
        companyWebsite,
        companyEmail,
        companyLogo,
        aboutCompany,
        industry,
        location,
      },
      existingProfile,
    );

    const listing = await Job.create({
      title,
      description,
      price: listingPrice,
      category,
      subcategory,
      condition: condition || "Good",
      location,
      phone,
      phoneCode,
      currency,
      countryCode,
      contactPhone,
      features: features || [],
      images: images || [],
      videos: videos || [],
      companyName: resolvedCompany.companyName,
      companyWebsite: resolvedCompany.companyWebsite,
      companyEmail: resolvedCompany.companyEmail,
      applyLink,
      companyLogo: resolvedCompany.companyLogo,
      jobType,
      experience,
      education,
      skills: skills || [],
      employmentType,
      workMode,
      workSchedule,
      shiftTiming,
      salary: {
        min: salaryMin,
        max: salaryMax,
        type: salary?.type || salaryType || "monthly",
      },
      salaryType: salaryType || salary?.type || "monthly",
      benefits: benefits || [],
      industry: resolvedCompany.industry || industry,
      department,
      noticePeriod,
      responsibilities,
      requirements,
      functionalArea,
      techStack,
      tools,
      certificationsRequired,
      languageRequirement,
      contractDuration,
      workHoursPerWeek,
      joiningDate,
      applicationDeadline,
      contactPerson,
      contactEmail,
      positions: Number(positions || 1),
      aboutCompany: resolvedCompany.aboutCompany || aboutCompany,
      ...(lat && lng && {
        coordinates: { type: "Point", coordinates: [Number(lng), Number(lat)] },
      }),
      seller: req.user._id,
      employerId: req.user._id,
      sellerName: req.user.firstName
        ? `${req.user.firstName} ${req.user.lastName || ""}`.trim()
        : req.user.email.split("@")[0],
    });

    const shouldSyncCompany =
      Boolean(companyLogo?.trim()) ||
      Boolean(companyName?.trim()) ||
      Boolean(companyWebsite?.trim());

    await EmployerCompanyService.upsertProfile(req.user._id, resolvedCompany);
    if (shouldSyncCompany) {
      await EmployerCompanyService.syncActiveJobs(req.user._id, resolvedCompany);
    }

    const populated = await Job.findById(listing._id).populate(
      "seller",
      "name profileImage"
    );

    const listingObj = populated.toObject ? populated.toObject() : populated;
    normaliseImages(listingObj);

    res.status(201).json({
      success: true,
      message: "Job listing created successfully",
      listing: listingObj,
    });

    publishListingCreated({
      entity: "jobs",
      listing: listingObj,
      userId: req.user._id,
      ip: req.ip,
      userAgent: req.get("user-agent"),
    }).catch(() => {});
  } catch (error) {
    logger.error("Create job error:", error);
    res.status(500).json({ success: false, message: "Failed to create job listing" });
  }
};

exports.getAllJobs = async (req, res) => {
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

    const cached = await ListingCache.getCachedListingList("jobs", queryKey);
    if (cached) {
      if (cached.listings) cached.listings.forEach(normaliseImages);
      await attachJobApplicantPreviews(cached.listings);
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
        entity: 'jobs',
        searchParams: { query: search, category, condition, minPrice, maxPrice, location: locationFilter, sort, page: safePage, limit: safeLimit },
        Model: Job,
        projection: LIST_PROJECTION,
      });

      if (esResult) {
        esResult.docs.forEach(normaliseImages);
        await attachJobApplicantPreviews(esResult.docs);
        res.setHeader('X-Cache', 'MISS');
        res.setHeader('X-Search-Source', 'elasticsearch');
        res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=300');
        res.status(200).json({ success: true, listings: esResult.docs, pagination: esResult.pagination });

        Promise.all([
          ListingCache.cacheListingList('jobs', queryKey, esResult.docs, esResult.pagination),
          ListingCache.prefetchCategoryListings('jobs', esResult.docs),
          ListingCache.cacheSearchResults('jobs', search, esResult.docs, esResult.pagination),
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
    if (category) filter.subcategory = { $in: category.split(",").map((c) => c.trim()) };
    if (req.query.workMode) {
      filter.workMode = { $regex: String(req.query.workMode).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    }
    if (req.query.jobType) {
      filter.jobType = { $regex: String(req.query.jobType).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    }
    if (condition) filter.condition = { $in: condition.split(",").map((c) => c.trim()) };

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
      listings = await Job.find(filter, LIST_PROJECTION)
        .sort(sortOption)
        .skip(skip)
        .limit(safeLimit + 1)
        .populate("seller", "name profileImage isVerified")
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
        Job.find(filter, LIST_PROJECTION)
          .sort(sortOption)
          .limit(safeLimit)
          .populate("seller", "name profileImage isVerified")
          .lean(),
        Job.countDocuments(filter),
      ]);

      pagination = {
        total,
        page: safePage,
        pages: Math.ceil(total / safeLimit),
        limit: safeLimit,
      };
    }

    listings.forEach(normaliseImages);
    await attachJobApplicantPreviews(listings);

    res.setHeader("X-Cache", "MISS");
    res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=300");
    res.status(200).json({ success: true, listings, pagination });

    Promise.all([
      ListingCache.cacheListingList("jobs", queryKey, listings, pagination),
      ListingCache.prefetchCategoryListings("jobs", listings),
      search ? ListingCache.cacheSearchResults("jobs", search, listings, pagination) : null,
    ]).catch((err) => logger.error("[Cache] Background cache write error:", err.message));
  } catch (error) {
    logger.error("Get all jobs error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch job listings" });
  }
};

exports.getJobById = async (req, res) => {
  try {
    const param = req.params.id;
    const isObjectId = mongoose.Types.ObjectId.isValid(param);

    if (isObjectId) {
      const cached = await ListingCache.getCachedListing("jobs", param);
      if (cached) {
        viewCounter.recordView("jobs", param);
        normaliseImages(cached);
        res.setHeader("X-Cache", "HIT");
        res.setHeader("X-Cache-Source", "listing-cache");
        return res.status(200).json({ success: true, listing: cached });
      }
    }

    const listing = isObjectId
      ? await Job.findById(param).populate("seller", "name profileImage createdAt isVerified location")
      : await Job.findOne({ slug: param, status: "active" }).populate("seller", "name profileImage createdAt isVerified location");

    if (!listing) {
      return res.status(404).json({ success: false, message: "Job listing not found" });
    }

    const listingId = listing._id.toString();
    viewCounter.recordView("jobs", listingId);

    const listingObj = listing.toObject ? listing.toObject() : listing;
    normaliseImages(listingObj);

    const employerProfile = listingObj.seller
      ? await EmployerCompanyService.getProfileByUserId(listingObj.seller._id || listingObj.seller)
      : null;
    EmployerCompanyService.attachCompanyMeta(listingObj, employerProfile);

    res.setHeader("X-Cache", "MISS");
    res.status(200).json({ success: true, listing: listingObj });

    ListingCache.cacheListing("jobs", listingObj).catch((err) =>
      logger.error("[Cache] Background cache error:", err.message)
    );
  } catch (error) {
    logger.error("Get job by ID error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch job listing" });
  }
};

exports.updateJob = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid listing ID format" });
    }

    const listing = await Job.findById(req.params.id);

    if (!listing) {
      return res.status(404).json({ success: false, message: "Job listing not found" });
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
      "contactPhone",
      "features",
      "images",
      "status",
      "companyName",
      "companyWebsite",
      "companyEmail",
      "applyLink",
      "companyLogo",
      "jobType",
      "experience",
      "education",
      "skills",
      "employmentType",
      "workMode",
      "workSchedule",
      "shiftTiming",
      "salary",
      "salaryType",
      "benefits",
      "industry",
      "department",
      "noticePeriod",
      "responsibilities",
      "requirements",
      "functionalArea",
      "techStack",
      "tools",
      "certificationsRequired",
      "languageRequirement",
      "contractDuration",
      "workHoursPerWeek",
      "joiningDate",
      "applicationDeadline",
      "contactPerson",
      "contactEmail",
      "positions",
      "aboutCompany",
    ];

    allowedUpdates.forEach((field) => {
      if (req.body[field] !== undefined) listing[field] = req.body[field];
    });

    if (listing.salary?.min && !req.body.price) {
      listing.price = Number(listing.salary.min);
    }

    await listing.save();

    const companyFields = EmployerCompanyService.pickCompanyFields(req.body);
    if (Object.keys(companyFields).length > 0) {
      await EmployerCompanyService.upsertProfile(req.user._id, companyFields);
      if (companyFields.companyLogo || companyFields.companyName || companyFields.companyWebsite) {
        await EmployerCompanyService.syncActiveJobs(req.user._id, companyFields);
      }
    }

    const updated = await Job.findById(listing._id).populate(
      "seller",
      "name profileImage"
    );

    const updatedObj = updated.toObject ? updated.toObject() : updated;
    const newImages = Array.isArray(updatedObj.images) ? updatedObj.images : [];
    const removedImages = oldImages.filter((url) => !newImages.includes(url));

    normaliseImages(updatedObj);

    try {
      await Promise.all([
        ListingCache.cacheListing("jobs", updatedObj),
        ListingCache.invalidateListCaches("jobs"),
        removedImages.length > 0 ? S3Service.deleteImagesByUrls(removedImages) : Promise.resolve(),
      ]);
    } catch (cacheErr) {
      logger.error("[Cache/Image] Jobs immediate update sync error:", cacheErr.message);
    }

    res.status(200).json({
      success: true,
      message: "Job listing updated successfully",
      listing: updatedObj,
    });

    publishListingUpdated({
      entity: "jobs",
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
    logger.error("Update job error:", error);
    res.status(500).json({ success: false, message: "Failed to update job listing" });
  }
};

exports.deleteJob = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid listing ID" });
    }

    const listing = await Job.findById(req.params.id);

    if (!listing) {
      return res.status(404).json({ success: false, message: "Job listing not found" });
    }

    if (listing.seller.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: "Not authorized to delete this listing" });
    }

    await Job.findByIdAndDelete(req.params.id);

    res.status(200).json({ success: true, message: "Job listing deleted successfully" });

    publishListingDeleted({
      entity: "jobs",
      listingId: req.params.id,
      listing,
      userId: req.user._id,
    }).catch(() => {});

    if (listing.images && listing.images.length > 0) {
      publishImageCleanup({ imageUrls: listing.images }).catch(() => {});
    }
  } catch (error) {
    logger.error("Delete job error:", error);
    res.status(500).json({ success: false, message: "Failed to delete job listing" });
  }
};

exports.getMyJobs = async (req, res) => {
  try {
    const { page, limit } = parsePagination(req.query, { limit: 20 });
    const { items, pagination } = await paginatedFind({
      model: Job,
      filter: { seller: req.user._id },
      populate: [{ path: 'seller', select: 'name profileImage' }],
      page,
      limit,
    });

    items.forEach(normaliseImages);

    res.status(200).json({ success: true, listings: items, pagination });
  } catch (error) {
    logger.error("Get my jobs error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch your job listings" });
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
        "jobs"
      );
      imageUrls.push(result.imageUrl);
    }

    await ListingCache.cacheUploadedImages("jobs", req.user._id.toString(), imageUrls);

    res.status(200).json({ success: true, imageUrls });
  } catch (error) {
    logger.error("Upload jobs images error:", error);
    res.status(500).json({ success: false, message: "Failed to upload images" });
  }
};

exports.getSavedJobs = async (req, res) => {
  try {
    const userId = req.user._id;
    const { page, limit } = parsePagination(req.query, { limit: 20 });

    try {
      const savedKey = `user:${userId}:saved:jobs:p${page}:l${limit}`;
      const cached = await redis.get(savedKey);
      if (cached) {
        const parsed = typeof cached === "string" ? JSON.parse(cached) : cached;
        if (parsed.listings) parsed.listings.forEach(normaliseImages);
        res.setHeader("X-Cache", "HIT");
        return res.status(200).json({ success: true, listings: parsed.listings || [], pagination: parsed.pagination });
      }
    } catch (cacheErr) {
      logger.debug("Saved jobs cache miss:", cacheErr.message);
    }

    const { items, pagination } = await paginatedFind({
      model: Job,
      filter: { savedBy: userId, status: "active" },
      populate: [{ path: 'seller', select: 'name profileImage' }],
      page,
      limit,
    });

    try {
      const savedKey = `user:${userId}:saved:jobs:p${page}:l${limit}`;
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
            thumbnail: l.images?.[0] || l.companyLogo || null,
            images: l.images || [],
            companyLogo: l.companyLogo || null,
            sellerName: l.sellerName,
          })),
          pagination,
        })
      );
    } catch (cacheErr) {
      logger.error("[Cache] Error caching saved jobs:", cacheErr.message);
    }

    items.forEach(normaliseImages);

    res.setHeader("X-Cache", "MISS");
    res.status(200).json({ success: true, listings: items, pagination });
  } catch (error) {
    logger.error("Get saved jobs error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch saved jobs" });
  }
};

exports.recordJobApply = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid listing ID format" });
    }

    const userId = req.user._id;
    const listing = await Job.findById(req.params.id).select("appliedBy applyLink seller title").lean();
    if (!listing) {
      return res.status(404).json({ success: false, message: "Job listing not found" });
    }

    await Job.updateOne({ _id: req.params.id }, { $addToSet: { appliedBy: userId } });

    const updated = await Job.findById(req.params.id).select("appliedBy applyLink").lean();
    const applicantCount = updated?.appliedBy?.length ?? 0;

    res.status(200).json({
      success: true,
      applied: true,
      applicantCount,
      applyLink: updated?.applyLink ?? listing.applyLink ?? null,
    });

    ListingCache.invalidateListingCache("jobs", req.params.id).catch(() => {});
  } catch (error) {
    logger.error("Record job apply error:", error);
    res.status(500).json({ success: false, message: "Failed to record application" });
  }
};

exports.toggleSave = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid listing ID format" });
    }

    const userId = req.user._id;
    const listing = await Job.findById(req.params.id).select('savedBy').lean();
    if (!listing) {
      return res.status(404).json({ success: false, message: "Job listing not found" });
    }

    const isSaved = listing.savedBy?.some((id) => id.toString() === userId.toString());

    if (isSaved) {
      await Job.updateOne({ _id: req.params.id }, { $pull: { savedBy: userId } });
    } else {
      await Job.updateOne({ _id: req.params.id }, { $addToSet: { savedBy: userId } });
    }

    res.status(200).json({
      success: true,
      saved: !isSaved,
      message: isSaved ? "Listing unsaved" : "Listing saved",
    });

    // Keep click response fast: run cache work in background.
    void (async () => {
      try {
        const savedKeyBase = `user:${userId}:saved:jobs`;
        await Promise.allSettled([
          redis.del(savedKeyBase),
          redis.del(`${savedKeyBase}:p1:l20`),
          ListingCache.invalidateListingCache("jobs", req.params.id),
          ListingCache.logProductSaved("jobs", listing, userId, !isSaved),
        ]);
      } catch (cacheErr) {
        logger.error("[Cache] Error updating save cache:", cacheErr.message);
      }
    })();
  } catch (error) {
    logger.error("Toggle save jobs error:", error);
    res.status(500).json({ success: false, message: "Failed to toggle save" });
  }
};

exports.getMyCompanyProfile = async (req, res) => {
  try {
    const profile = await EmployerCompanyService.getProfileByUserId(req.user._id);
    if (!profile) {
      return res.status(200).json({ success: true, profile: null });
    }

    if (profile.companyLogo) {
      profile.companyLogo = S3Service.toProxyUrl(profile.companyLogo);
    }

    res.status(200).json({ success: true, profile });
  } catch (error) {
    logger.error("Get employer company profile error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch company profile" });
  }
};

exports.upsertMyCompanyProfile = async (req, res) => {
  try {
    const fields = EmployerCompanyService.pickCompanyFields(req.body);
    if (Object.keys(fields).length === 0) {
      return res.status(400).json({ success: false, message: "No company fields provided" });
    }

    const profile = await EmployerCompanyService.upsertProfile(req.user._id, fields);
    await EmployerCompanyService.syncActiveJobs(req.user._id, fields);

    const profileObj = profile || null;
    if (profileObj?.companyLogo) {
      profileObj.companyLogo = S3Service.toProxyUrl(profileObj.companyLogo);
    }

    res.status(200).json({
      success: true,
      message: "Company profile updated",
      profile: profileObj,
    });
  } catch (error) {
    logger.error("Upsert employer company profile error:", error);
    res.status(500).json({ success: false, message: "Failed to update company profile" });
  }
};

exports.uploadCompanyLogo = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No logo image provided" });
    }

    const result = await S3Service.uploadListingImage(
      req.file.buffer,
      req.user._id.toString(),
      req.file.mimetype,
      "jobs",
    );

    const companyLogo = result.imageUrl;
    await EmployerCompanyService.upsertProfile(req.user._id, { companyLogo });
    await EmployerCompanyService.syncActiveJobs(req.user._id, { companyLogo });

    res.status(200).json({
      success: true,
      companyLogo: S3Service.toProxyUrl(companyLogo),
    });
  } catch (error) {
    logger.error("Upload company logo error:", error);
    res.status(500).json({ success: false, message: "Failed to upload company logo" });
  }
};

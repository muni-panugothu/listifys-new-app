const {
  validateRegisterInput,
  validateLoginInput,
  validateProfileUpdateInput,
  validateChangePasswordInput,
  validateForgotPasswordInput,
  validateResetPasswordInput,
} = require("../utils/validation.js");
const { logger } = require("../utils/logger.js");

// Register validation middleware
exports.validateRegister = (req, res, next) => {
  const { isValid, errors } = validateRegisterInput(req.body);

  if (!isValid) {
    return res.status(400).json({
      success: false,
      errors,
    });
  }

  next();
};

// Login validation middleware
exports.validateLogin = (req, res, next) => {
  const { isValid, errors } = validateLoginInput(req.body);

  if (!isValid) {
    return res.status(400).json({
      success: false,
      errors,
    });
  }

  next();
};

// Profile update validation middleware
exports.validateProfileUpdate = (req, res, next) => {
  const { isValid, errors } = validateProfileUpdateInput(req.body);

  if (!isValid) {
    return res.status(400).json({
      success: false,
      errors,
    });
  }

  next();
};

// Change password validation middleware
exports.validateChangePassword = (req, res, next) => {
  const { isValid, errors } = validateChangePasswordInput(req.body);

  if (!isValid) {
    return res.status(400).json({
      success: false,
      errors,
    });
  }

  next();
};

// Forgot password validation middleware
exports.validateForgotPassword = (req, res, next) => {
  const { isValid, errors } = validateForgotPasswordInput(req.body);

  if (!isValid) {
    return res.status(400).json({
      success: false,
      errors,
    });
  }

  next();
};

// Reset password validation middleware
exports.validateResetPassword = (req, res, next) => {
  const { isValid, errors } = validateResetPasswordInput(req.body);

  if (!isValid) {
    return res.status(400).json({
      success: false,
      errors,
    });
  }

  next();
};

// Add this validation for OTP verification
exports.validateOTPVerification = (req, res, next) => {
  const { email, otp } = req.body;

  if (!email) {
    return res.status(400).json({
      success: false,
      message: "Email is required",
    });
  }

  if (!otp) {
    return res.status(400).json({
      success: false,
      message: "OTP is required",
    });
  }

  if (!/^\d{6}$/.test(otp)) {
    return res.status(400).json({
      success: false,
      message: "OTP must be 6 digits",
    });
  }

  next();
};

// ==================== Listing Input Validation ====================

/**
 * ── Master category / subcategory map ──────────────────────────────
 * Single source of truth for the ENTIRE app — matches the frontend
 * CATEGORIES + SUBCATEGORIES. Any value not in this map is rejected.
 */
const VALID_CATEGORY_SUBCATEGORY = {
  Jobs: ['IT Jobs', 'Non IT Jobs', 'Part Time', 'Contract Type'],
  Electronics: [
    'TVs, Video - Audio',
    'Kitchen & Other Appliances',
    'Fridges',
    'Washing Machines',
    'ACs',
    'Computers & Laptops',
    'Computer Accessories',
    'Hard Disks, Printers & Monitors',
    'Cameras & Lenses',
  ],
  Vehicles: ['Cars', 'Bikes', 'Cycle', 'Spare Parts'],
  Events: [
    'Music',
    'Food & Drink',
    'Business',
    'Health & Wellness',
    'Film',
    'Comedy',
    'Art',
    'Sports',
    'Theater',
    'Education',
    'Community',
    'Other',
  ],
  'Take Care': ['Nanny', 'Babysitter', 'Elder Care', 'Pet Care'],
  Mobiles: ['Mobile Phones', 'Accessories', 'Tablets'],
  Furniture: [
    'Sofas & Dining',
    'Beds & Wardrobes',
    'Tables & Chairs',
    'Home Decor',
    'Office Furniture',
  ],
  Toys: ['Video Games', 'Puzzles', 'RC Toys', 'Soft Toys & Dolls', 'Building Toys', 'Baby Toys', 'Action Figures', 'Other'],
  Fashion: [
    "Men's Clothing",
    "Women's Clothing",
    'Kids Clothing',
    'Footwear',
    'Watches',
    'Accessories',
  ],
  Books: [
    'Fiction',
    'Non-Fiction',
    "Children's Books",
    'Textbooks',
    'Comics',
    'Magazines',
  ],
  Sports: [
    'Exercise & Gym',
    'Outdoor Sports',
    'Indoor Sports',
    'Water Sports',
    'Cycling',
    'Camping & Hiking',
    'Fitness Accessories',
    'Team Sports',
  ],
  'Books, Sports': [
    'Books',
    'Gym & Fitness',
    'Sports Equipment',
    'Musical Instruments',
    'Hobbies',
    'Cycling',
  ],
  'Toys & Games': ['Video Games', 'Puzzles', 'RC Toys', 'Soft Toys & Dolls', 'Building Toys', 'Baby Toys', 'Action Figures', 'Other'],
  Collectibles: ['Coins & Currency', 'Stamps', 'Trading Cards', 'Antiques', 'Vintage Items', 'Memorabilia', 'Art & Prints', 'Other Collectibles'],
  Pets: ['Dogs', 'Cats', 'Birds', 'Fish & Aquarium', 'Small Animals', 'Reptiles', 'Pet Supplies', 'Pet Services'],
  Beauty: ['Makeup', 'Skincare', 'Hair Care', 'Fragrance', 'Vitamins', 'Personal Care'],
  Others: ['Other Items'],
};

const SUBCATEGORY_ALIASES = {
  'Mens Clothing': "Men's Clothing",
  'Womens Clothing': "Women's Clothing",
  'Childrens Books': "Children's Books",
};

/**
 * Map categories → which API route they belong to (for cross-check).
 */
const CATEGORY_TO_ENTITY = {
  Jobs: 'jobs',
  Electronics: 'electronics',
  Vehicles: 'vehicles',
  Events: 'events',
  'Take Care': 'takecare',
  Mobiles: 'mobiles',
  Furniture: 'furniture',
  Toys: 'toys',
  Fashion: 'fashion',
  Books: 'books',
  Sports: 'sports',
  'Books, Sports': 'forsale',
  'Toys & Games': 'forsale',
  Collectibles: 'collectibles',
  Pets: 'pets',
  Beauty: 'beauty',
  Others: 'others',
};

/**
 * Fields that MUST be non-empty for specific subcategories.
 * Mirrors the frontend CATEGORY_VALIDATORS.
 */
const REQUIRED_FIELDS_BY_SUBCATEGORY = {
  // Vehicles
  Cars: ['brand', 'model', 'year', 'fuelType', 'transmission', 'ownership'],
  Bikes: ['brand', 'model', 'year', 'fuelType', 'ownership'],
  Cycle: ['brand', 'cycleType'],
  'Spare Parts': ['compatibleVehicle', 'partCategory'],
  // Mobiles
  'Mobile Phones': ['brand'],
  Tablets: ['brand'],
  // Books
  Books: ['author'],
  Fiction: ['author'],
  'Non-Fiction': ['author'],
  "Children's Books": ['author'],
  Textbooks: ['author'],
  Comics: ['author'],
  Magazines: ['author'],
  // Electronics
  'TVs, Video - Audio': ['brand'],
  'Computers & Laptops': ['brand'],
  'Fridges': ['brand'],
  'Washing Machines': ['brand'],
  'ACs': ['brand'],
  'Cameras & Lenses': ['brand'],
  // Fashion
  "Men's Clothing": ['brand', 'gender', 'size', 'fabricType'],
  "Women's Clothing": ['brand', 'gender', 'size', 'fabricType'],
  'Kids Clothing': ['brand', 'gender', 'size', 'fabricType'],
  Footwear: ['brand', 'gender', 'size'],
  Watches: ['brand'],
};

/**
 * Allowed enum values for specific fields.
 */
const FIELD_ENUMS = {
  condition: ['New', 'Like New', 'Good', 'Fair', 'Used'],
  fuelType: ['Petrol', 'Diesel', 'CNG', 'Electric', 'Hybrid', 'LPG'],
  transmission: ['Manual', 'Automatic'],
  ownership: ['1st Owner', '2nd Owner', '3rd Owner', '4th+ Owner'],
  mileageUnit: ['km', 'mi', ''],
  assemblyRequired: ['Yes', 'No', ''],
  gender: ['Men', 'Women', 'Kids', 'Unisex', ''],
  cycleType: ['Mountain', 'Road', 'Hybrid', 'BMX', 'Kids', 'Folding', 'Electric', 'Cruiser'],
  compatibleVehicle: ['Car', 'Bike', 'Cycle', 'Universal'],
  partCategory: [
    'Engine Parts', 'Body Parts', 'Electrical', 'Suspension', 'Brakes',
    'Tyres & Wheels', 'Interior', 'Exterior', 'Exhaust', 'Filters', 'Other', ''
  ],
  warranty: ['Under Warranty', 'Expired', 'No Warranty', ''],
  energyRating: ['1 Star', '2 Star', '3 Star', '4 Star', '5 Star', ''],
};

/**
 * Sanitise and validate common listing fields shared by all categories.
 * Strips HTML tags, limits string lengths, validates types, enforces
 * category/subcategory enum, and runs per-subcategory required-field checks.
 */
exports.validateListingInput = (req, res, next) => {
  const errors = {};
  const body = req.body;
  const isPartialUpdate = ['PUT', 'PATCH'].includes(req.method);
  const hasField = (field) => Object.prototype.hasOwnProperty.call(body, field);
  const shouldValidateField = (field) => !isPartialUpdate || hasField(field);

  // Utility: strip HTML tags and dangerous chars
  const stripTags = (str) =>
    typeof str === 'string'
      ? str.replace(/<[^>]*>/g, '').replace(/[<>"`;]/g, '').trim()
      : str;

  // ── 1. Sanitise ALL known string fields ──────────────────────
  const STRING_FIELDS = [
    // Common
    'title', 'description', 'location', 'phone', 'category', 'subcategory', 'condition',
    // Vehicle-specific
    'brand', 'model', 'variant', 'year', 'kmDriven', 'mileageUnit', 'fuelType', 'transmission',
    'ownership', 'color', 'engineCC', 'cycleType', 'gearCount', 'frameSize',
    'compatibleVehicle', 'partCategory',
    // ForSale (Mobiles / Furniture / Fashion / Books,Sports)
    'storage', 'ram', 'screenSize', 'batteryHealth', 'warranty',
    'material', 'dimensions', 'weight', 'assemblyRequired', 'numberOfPieces',
    'size', 'gender', 'fabricType',
    'author', 'isbn', 'publisher', 'edition', 'sportType',
    // Electronics-specific
    'displayType', 'processor', 'capacity', 'energyRating',
    'megapixels', 'lensType', 'purchaseYear',
    // Jobs-specific
    'companyName', 'companyWebsite', 'companyEmail', 'companyLogo', 'applyLink',
    'jobType', 'employmentType', 'workMode', 'workSchedule', 'shiftTiming',
    'experienceLevel', 'noticePeriod', 'industry', 'department',
    'skills', 'responsibilities', 'requirements', 'functionalArea',
    'techStack', 'tools', 'certificationsRequired', 'languageRequirement',
    'contractDuration', 'workHoursPerWeek', 'contactPerson', 'contactEmail',
  ];
  STRING_FIELDS.forEach((f) => {
    if (body[f] !== undefined && body[f] !== null) body[f] = stripTags(String(body[f]));
  });

  // Canonicalize common subcategory aliases (keeps backward compatibility with older clients)
  if (body.subcategory && SUBCATEGORY_ALIASES[body.subcategory]) {
    body.subcategory = SUBCATEGORY_ALIASES[body.subcategory];
  }

  // ── 2. Required common fields ────────────────────────────────
  if (shouldValidateField('title')) {
    if (!body.title || body.title.length < 3)
      errors.title = 'Title must be at least 3 characters';
    if (body.title && body.title.length > 200)
      errors.title = 'Title cannot exceed 200 characters';
  }

  if (shouldValidateField('description')) {
    if (!body.description || body.description.length < 20)
      errors.description = 'Description must be at least 20 characters';
    if (body.description && body.description.length > 5000)
      errors.description = 'Description cannot exceed 5000 characters';
  }

  // Price is optional for Jobs and Events (can be free / salary-based)
  const PRICE_OPTIONAL_CATEGORIES = ['Jobs', 'Events', 'Take Care'];
  const priceOptional = PRICE_OPTIONAL_CATEGORIES.includes(body.category);

  if (!isPartialUpdate || hasField('price')) {
    if (!priceOptional) {
      if (body.price === undefined || body.price === null || body.price === '')
        errors.price = 'Price is required';
      else if (isNaN(Number(body.price)) || Number(body.price) < 0)
        errors.price = 'Price must be a non-negative number';
      else if (Number(body.price) > 999999999)
        errors.price = 'Price exceeds maximum allowed value';
    } else {
      // Still validate if provided
      if (body.price !== undefined && body.price !== null && body.price !== '') {
        if (isNaN(Number(body.price)) || Number(body.price) < 0)
          errors.price = 'Price must be a non-negative number';
        else if (Number(body.price) > 999999999)
          errors.price = 'Price exceeds maximum allowed value';
      }
    }
  }

  if (shouldValidateField('category') && !body.category) errors.category = 'Category is required';
  if (shouldValidateField('subcategory') && !body.subcategory) errors.subcategory = 'Subcategory is required';
  if (shouldValidateField('location') && (!body.location || body.location.length < 2))
    errors.location = 'Location is required (at least 2 characters)';

  // ── 3. Category / Subcategory enum validation ────────────────
  if (body.category && !VALID_CATEGORY_SUBCATEGORY[body.category]) {
    errors.category = `Invalid category "${body.category}". Allowed: ${Object.keys(VALID_CATEGORY_SUBCATEGORY).join(', ')}`;
  }
  if (
    body.category &&
    body.subcategory &&
    VALID_CATEGORY_SUBCATEGORY[body.category] &&
    !VALID_CATEGORY_SUBCATEGORY[body.category].includes(body.subcategory)
  ) {
    errors.subcategory = `Invalid subcategory "${body.subcategory}" for "${body.category}". Allowed: ${VALID_CATEGORY_SUBCATEGORY[body.category].join(', ')}`;
  }

  // ── 4. Cross-check: category vs API entity (route) ──────────
  //    e.g. posting category "Vehicles" to /api/electronics should fail.
  if (body.category && CATEGORY_TO_ENTITY[body.category]) {
    const expectedEntity = CATEGORY_TO_ENTITY[body.category];
    const routePath = req.originalUrl || req.baseUrl || '';
    if (
      routePath.includes('/api/jobs') && expectedEntity !== 'jobs' ||
      routePath.includes('/api/electronics') && expectedEntity !== 'electronics' ||
      routePath.includes('/api/vehicles') && expectedEntity !== 'vehicles' ||
      routePath.includes('/api/takecare') && expectedEntity !== 'takecare' ||
      routePath.includes('/api/events') && expectedEntity !== 'events' ||
      routePath.includes('/api/forsale') && expectedEntity !== 'forsale'
    ) {
      errors.category = `Category "${body.category}" cannot be posted to this endpoint. Use /api/${expectedEntity} instead.`;
    }
  }

  // ── 5. Condition (optional for non-product categories) ─────
  const CONDITION_SKIP_CATEGORIES = ['Jobs', 'Events', 'Take Care'];
  const conditionRequired = !CONDITION_SKIP_CATEGORIES.includes(body.category);

  if (!isPartialUpdate) {
    if (conditionRequired) {
      if (!body.condition) {
        errors.condition = 'Condition is required';
      } else if (!FIELD_ENUMS.condition.includes(body.condition)) {
        errors.condition = `Condition must be one of: ${FIELD_ENUMS.condition.join(', ')}`;
      }
    } else if (body.condition && !FIELD_ENUMS.condition.includes(body.condition)) {
      errors.condition = `Condition must be one of: ${FIELD_ENUMS.condition.join(', ')}`;
    }
  } else if (hasField('condition')) {
    if (!body.condition) {
      errors.condition = 'Condition is required';
    } else if (!FIELD_ENUMS.condition.includes(body.condition)) {
      errors.condition = `Condition must be one of: ${FIELD_ENUMS.condition.join(', ')}`;
    }
  }

  // ── 6. Field-specific enum validations ───────────────────────
  if (body.fuelType && !FIELD_ENUMS.fuelType.includes(body.fuelType)) {
    errors.fuelType = `Fuel type must be one of: ${FIELD_ENUMS.fuelType.join(', ')}`;
  }
  if (body.transmission && !FIELD_ENUMS.transmission.includes(body.transmission)) {
    errors.transmission = `Transmission must be one of: ${FIELD_ENUMS.transmission.join(', ')}`;
  }
  if (body.ownership && !FIELD_ENUMS.ownership.includes(body.ownership)) {
    errors.ownership = `Ownership must be one of: ${FIELD_ENUMS.ownership.join(', ')}`;
  }
  if (body.mileageUnit && !FIELD_ENUMS.mileageUnit.includes(body.mileageUnit)) {
    errors.mileageUnit = 'Mileage unit must be km or mi';
  }
  if (body.assemblyRequired && !FIELD_ENUMS.assemblyRequired.includes(body.assemblyRequired)) {
    errors.assemblyRequired = `Assembly required must be one of: ${FIELD_ENUMS.assemblyRequired.filter(Boolean).join(', ')}`;
  }
  if (body.gender && !FIELD_ENUMS.gender.includes(body.gender)) {
    errors.gender = `Gender must be one of: ${FIELD_ENUMS.gender.filter(Boolean).join(', ')}`;
  }
  if (body.cycleType && !FIELD_ENUMS.cycleType.includes(body.cycleType)) {
    errors.cycleType = `Cycle type must be one of: ${FIELD_ENUMS.cycleType.join(', ')}`;
  }
  if (body.compatibleVehicle && !FIELD_ENUMS.compatibleVehicle.includes(body.compatibleVehicle)) {
    errors.compatibleVehicle = `Compatible vehicle must be one of: ${FIELD_ENUMS.compatibleVehicle.join(', ')}`;
  }
  if (body.partCategory && !FIELD_ENUMS.partCategory.includes(body.partCategory)) {
    errors.partCategory = `Part category must be one of: ${FIELD_ENUMS.partCategory.filter(Boolean).join(', ')}`;
  }
  if (body.warranty && !FIELD_ENUMS.warranty.includes(body.warranty)) {
    errors.warranty = `Warranty must be one of: ${FIELD_ENUMS.warranty.filter(Boolean).join(', ')}`;
  }
  if (body.energyRating && !FIELD_ENUMS.energyRating.includes(body.energyRating)) {
    errors.energyRating = `Energy rating must be one of: ${FIELD_ENUMS.energyRating.filter(Boolean).join(', ')}`;
  }

  // ── 7. Year validation (if provided) ────────────────────────
  if (body.year) {
    const yearNum = Number(body.year);
    const currentYear = new Date().getFullYear();
    if (isNaN(yearNum) || yearNum < 1900 || yearNum > currentYear + 1) {
      errors.year = `Year must be between 1900 and ${currentYear + 1}`;
    }
  }
  if (body.purchaseYear) {
    const pyNum = Number(body.purchaseYear);
    const currentYear = new Date().getFullYear();
    if (isNaN(pyNum) || pyNum < 2000 || pyNum > currentYear + 1) {
      errors.purchaseYear = `Purchase year must be between 2000 and ${currentYear}`;
    }
  }

  // ── 8. String length limits on optional text fields ──────────
  const OPTIONAL_STRING_LIMITS = {
    brand: 100, model: 100, variant: 100, color: 50, engineCC: 20,
    gearCount: 10, frameSize: 20, storage: 50, ram: 50, screenSize: 50,
    batteryHealth: 50, warranty: 100, material: 100, dimensions: 100,
    weight: 50, numberOfPieces: 20, size: 50, fabricType: 100,
    author: 200, isbn: 20, publisher: 200, edition: 50, sportType: 100,
    kmDriven: 30, partCategory: 100, compatibleVehicle: 100,
    // Electronics-specific
    displayType: 50, processor: 100, capacity: 50, energyRating: 20,
    megapixels: 30, lensType: 100,
  };
  Object.entries(OPTIONAL_STRING_LIMITS).forEach(([field, maxLen]) => {
    if (body[field] && typeof body[field] === 'string' && body[field].length > maxLen) {
      errors[field] = `${field} cannot exceed ${maxLen} characters`;
    }
  });

  // ── 9. Per-subcategory required fields ───────────────────────
  if (body.subcategory && REQUIRED_FIELDS_BY_SUBCATEGORY[body.subcategory]) {
    const requiredFields = REQUIRED_FIELDS_BY_SUBCATEGORY[body.subcategory];
    const filledCount = requiredFields.filter(
      (field) => body[field] && String(body[field]).trim() !== '',
    ).length;

    // Backward-compatible behavior:
    // Only enforce the full required set when user started entering
    // spec fields for this subcategory. This keeps older/simple clients
    // (that only submit common fields) working.
    if (filledCount > 0) {
      requiredFields.forEach((field) => {
        if (!body[field] || (typeof body[field] === 'string' && body[field].trim() === '')) {
          errors[field] = `${field.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim()} is required for ${body.subcategory}`;
        }
      });
    }
  }

  // ── 10. Validate images / videos (at least one media item) ──
  // Accept "imageUrls" as alias for "images" (some clients/controllers use this)
  if (!body.images && Array.isArray(body.imageUrls)) {
    body.images = body.imageUrls;
  }

  const { normalizeVideos, validateVideosPayload } = require('../utils/listing-media');
  const shouldValidateMedia =
    !isPartialUpdate || body.images !== undefined || body.videos !== undefined;

  if (shouldValidateMedia) {
    const images = Array.isArray(body.images) ? body.images : [];
    const videos = Array.isArray(body.videos) ? body.videos : [];

    if (images.length === 0 && videos.length === 0) {
      errors.media = 'At least one photo or video is required';
    }

    if (body.images !== undefined && !Array.isArray(body.images)) {
      errors.images = 'Images must be an array';
    } else if (images.length > 6) {
      errors.images = 'Maximum 6 images allowed';
    } else {
      for (const url of images) {
        if (typeof url !== 'string' || url.length > 2048) {
          errors.images = 'Invalid image URL detected';
          break;
        }
        if (!/^(https?:\/\/|\/api\/images\/|data:image\/)/i.test(url)) {
          errors.images = 'Invalid image URL format';
          break;
        }
      }
    }

    if (body.videos !== undefined && !Array.isArray(body.videos)) {
      errors.videos = 'Videos must be an array';
    } else {
      const videoErrors = validateVideosPayload(videos);
      if (videoErrors.length > 0) {
        errors.videos = videoErrors[0];
      } else if (videos.length > 0) {
        body.videos = normalizeVideos(videos);
      }
    }
  }

  // ── 11. Validate features array ──────────────────────────────
  if (body.features) {
    if (!Array.isArray(body.features)) errors.features = 'Features must be an array';
    else if (body.features.length > 20) errors.features = 'Maximum 20 features allowed';
    else {
      for (const feat of body.features) {
        if (typeof feat !== 'string' || feat.length > 200) {
          errors.features = 'Each feature must be a string of max 200 characters';
          break;
        }
      }
    }
  }

  // ── 12. Validate phone (optional, supports international numbers) ──
  const phoneDigits = String(body.phone || '').replace(/\D/g, '');
  if (phoneDigits) {
    if (!/^\d{7,15}$/.test(phoneDigits)) {
      errors.phone = 'Phone number must be between 7 and 15 digits';
    } else {
      body.phone = phoneDigits;
    }
  }

  // ── 13. Return errors or continue ────────────────────────────
  if (Object.keys(errors).length > 0) {
    logger.warn('[VALIDATION_FAILED] Listing input rejected', {
      errors,
      category: body.category,
      subcategory: body.subcategory,
      title: body.title?.substring(0, 50),
      userId: req.user?._id || 'unknown',
      ip: req.ip,
      route: req.originalUrl,
      timestamp: new Date().toISOString(),
    });
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors,
    });
  }

  // Coerce price to number
  if (hasField('price') && body.price !== undefined && body.price !== null && body.price !== '') {
    body.price = Number(body.price);
  }

  next();
};

// Export the category map for controllers to reuse
exports.VALID_CATEGORY_SUBCATEGORY = VALID_CATEGORY_SUBCATEGORY;
exports.CATEGORY_TO_ENTITY = CATEGORY_TO_ENTITY;

// ==================== NEW: Password validation middleware ====================
exports.validatePasswordSecurity = async (req, res, next) => {
  try {
    const { password, newPassword } = req.body;
    const passwordToCheck = newPassword || password;
    
    if (!passwordToCheck) {
      return next();
    }
    
    const { validatePassword } = require('../utils/passwordSecurity.js');
    const userId = req.user ? req.user.id : null;
    
    // Only check breach for new registrations or password changes
    const checkBreach = true;
    
    const validation = await validatePassword(passwordToCheck, userId, checkBreach);
    
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Password does not meet security requirements',
        errors: validation.errors,
        strength: validation.strength
      });
    }
    
    // Attach validation result to request
    req.passwordValidation = validation;
    next();
  } catch (error) {
    logger.error('Password validation middleware error', { error: error.message });
    next();
  }
};

// ==================== NEW: Get password requirements ====================
exports.getPasswordRequirements = (req, res) => {
  const { getPasswordRequirements } = require('../utils/passwordSecurity.js');
  res.status(200).json({
    success: true,
    requirements: getPasswordRequirements()
  });
};

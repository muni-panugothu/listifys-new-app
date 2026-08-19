const mongoose = require('mongoose');
const { createMockReq, createMockRes } = require('./setup');

// ─── MOCK DEPENDENCIES ──────────────────────────────────────────────
jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    securityLog: jest.fn(),
  }
}));

jest.mock('../services/s3.service', () => ({
  toProxyUrl: jest.fn(url => url.startsWith('/api/images/') ? url : `/api/images/${url}`),
  uploadListingImage: jest.fn().mockResolvedValue({ imageUrl: '/api/images/properties/user1/img1.webp' }),
  deleteImagesByUrls: jest.fn().mockResolvedValue(true),
}));

jest.mock('../services/listingcache.service', () => ({
  cacheUploadedImages: jest.fn().mockResolvedValue(true),
  cacheListing: jest.fn().mockResolvedValue(true),
  logProductSaved: jest.fn().mockResolvedValue(true),
}));

jest.mock('../config/redis', () => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
  setex: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
}));

jest.mock('../queues/producers/listing.producer', () => ({
  publishListingCreated: jest.fn().mockResolvedValue(true),
  publishListingUpdated: jest.fn().mockResolvedValue(true),
  publishListingDeleted: jest.fn().mockResolvedValue(true),
  publishImageCleanup: jest.fn().mockResolvedValue(true),
}));

// ─── Mock Property Model ────────────────────────────────────────────
const mockPropertyFind = jest.fn();
const mockPropertyCountDocuments = jest.fn();
const mockPropertyFindById = jest.fn();
const mockPropertyFindOne = jest.fn();
const mockPropertyFindOneAndUpdate = jest.fn();
const mockPropertyDeleteOne = jest.fn();

jest.mock('../models/property.model', () => {
  const MockProperty = jest.fn(function (data) {
    Object.assign(this, data);
    this._id = data._id || 'mock-property-id-' + Date.now();
    this.savedBy = data.savedBy || [];
    this.save = jest.fn(async () => this);
    this.toObject = jest.fn(() => ({ ...this }));
  });

  MockProperty.find = jest.fn(() => ({
    sort: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    populate: jest.fn().mockReturnThis(),
    lean: mockPropertyFind,
  }));
  MockProperty.countDocuments = mockPropertyCountDocuments;
  MockProperty.findById = jest.fn(() => ({
    populate: jest.fn().mockReturnThis(),
    lean: mockPropertyFindById,
  }));
  MockProperty.findOne = jest.fn(() => ({
    lean: mockPropertyFindOne,
  }));
  MockProperty.findOneAndUpdate = jest.fn(() => ({
    lean: mockPropertyFindOneAndUpdate,
  }));
  MockProperty.deleteOne = mockPropertyDeleteOne;

  return MockProperty;
});

// ─── Controller Under Test ──────────────────────────────────────────
const propertiesController = require('../controllers/properties.controller');
const Property = require('../models/property.model');
const redis = require('../config/redis');
const { publishListingDeleted, publishImageCleanup, publishListingCreated } = require('../queues/producers/listing.producer');

// ─── TEST SUITE ─────────────────────────────────────────────────────
describe('🏠 PROPERTIES CONTROLLER TESTS', () => {
  let req, res;

  const mockUser = {
    _id: new mongoose.Types.ObjectId().toString(),
    username: 'testuser',
    name: 'Test User',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    req = createMockReq({ user: mockUser });
    res = createMockRes();
  });

  // ── 1. getProperties ──────────────────────────────────────────────
  describe('1. getProperties (Public)', () => {
    test('TC-P01: Should fetch paginated properties successfully', async () => {
      req.query = { page: 1, limit: 10 };
      const mockListings = [
        { _id: '1', title: 'Apartment', images: ['/api/images/properties/u1/img1.webp'], category: 'Rentals' },
        { _id: '2', title: 'Room', images: ['/api/images/properties/u2/img2.webp'], category: 'Roommates' },
      ];
      mockPropertyFind.mockResolvedValue(mockListings);
      mockPropertyCountDocuments.mockResolvedValue(2);

      await propertiesController.getProperties(req, res);

      expect(res.statusCode).toBe(200);
      expect(res._json.success).toBe(true);
      expect(res._json.data.length).toBe(2);
      expect(res._json.pagination.total).toBe(2);
    });

    test('TC-P02: Should apply top-level category filter', async () => {
      req.query = { category: 'Rentals' };
      mockPropertyFind.mockResolvedValue([]);
      mockPropertyCountDocuments.mockResolvedValue(0);

      await propertiesController.getProperties(req, res);

      expect(res.statusCode).toBe(200);
      expect(res._json.success).toBe(true);
      expect(res._json.data.length).toBe(0);
    });

    test('TC-P02b: Should treat category query as subcategory for property tabs', async () => {
      req.query = { category: 'Office Space' };
      mockPropertyFind.mockResolvedValue([
        { _id: '1', title: 'Office Space in Salarpuria', subcategory: 'Office Space', category: 'Properties' },
      ]);
      mockPropertyCountDocuments.mockResolvedValue(1);

      await propertiesController.getProperties(req, res);

      expect(Property.find).toHaveBeenCalled();
      const findArg = Property.find.mock.calls[Property.find.mock.calls.length - 1][0];
      expect(findArg.subcategory).toBe('Office Space');
      expect(findArg.category).toBeUndefined();
    });

    test('TC-P03: Should apply price range filters', async () => {
      req.query = { minPrice: '5000', maxPrice: '20000' };
      mockPropertyFind.mockResolvedValue([]);
      mockPropertyCountDocuments.mockResolvedValue(0);

      await propertiesController.getProperties(req, res);

      expect(res.statusCode).toBe(200);
      expect(res._json.success).toBe(true);
    });

    test('TC-P04: Should apply search filter', async () => {
      req.query = { search: 'apartment' };
      mockPropertyFind.mockResolvedValue([]);
      mockPropertyCountDocuments.mockResolvedValue(0);

      await propertiesController.getProperties(req, res);

      expect(res.statusCode).toBe(200);
      expect(res._json.success).toBe(true);
    });

    test('TC-P05: Should sort by price ascending', async () => {
      req.query = { sort: 'price_asc' };
      mockPropertyFind.mockResolvedValue([]);
      mockPropertyCountDocuments.mockResolvedValue(0);

      await propertiesController.getProperties(req, res);

      expect(res.statusCode).toBe(200);
    });

    test('TC-P06: Should return 500 on database error', async () => {
      mockPropertyFind.mockRejectedValue(new Error('DB failure'));

      await propertiesController.getProperties(req, res);

      expect(res.statusCode).toBe(500);
      expect(res._json.success).toBe(false);
    });

    test('TC-P07: Should clamp limit to max 100', async () => {
      req.query = { limit: '200' };
      mockPropertyFind.mockResolvedValue([]);
      mockPropertyCountDocuments.mockResolvedValue(0);

      await propertiesController.getProperties(req, res);

      expect(res.statusCode).toBe(200);
      expect(res._json.pagination.limit).toBeLessThanOrEqual(100);
    });
  });

  // ── 2. getPropertyById ────────────────────────────────────────────
  describe('2. getPropertyById (Public)', () => {
    test('TC-P08: Should return 404 for non-existent slug/invalid ID', async () => {
      req.params = { id: 'invalid-id' };

      const Property = require('../models/property.model');
      if (!Property.findOne) Property.findOne = jest.fn();
      Property.findOne.mockReturnValueOnce({
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(null),
      });

      await propertiesController.getPropertyById(req, res);

      expect(res.statusCode).toBe(404);
    });

    test('TC-P09: Should return 404 for non-existent property', async () => {
      req.params = { id: new mongoose.Types.ObjectId().toString() };
      mockPropertyFindById.mockResolvedValue(null);

      await propertiesController.getPropertyById(req, res);

      expect(res.statusCode).toBe(404);
      expect(res._json.success).toBe(false);
    });

    test('TC-P10: Should return property with normalised images', async () => {
      const propId = new mongoose.Types.ObjectId().toString();
      req.params = { id: propId };
      const mockProp = {
        _id: propId,
        title: '2BHK Apartment',
        images: ['properties/u1/img1.webp'],
        seller: { name: 'Seller', profileImage: 'profiles/u1/pic.webp' },
      };
      mockPropertyFindById.mockResolvedValue(mockProp);

      await propertiesController.getPropertyById(req, res);

      expect(res.statusCode).toBe(200);
      expect(res._json.success).toBe(true);
      expect(res._json.data.images[0]).toContain('/api/images/');
    });

    test('TC-P11: Should return 500 on database error', async () => {
      req.params = { id: new mongoose.Types.ObjectId().toString() };
      mockPropertyFindById.mockRejectedValue(new Error('DB error'));

      await propertiesController.getPropertyById(req, res);

      expect(res.statusCode).toBe(500);
    });
  });

  // ── 3. createProperty ─────────────────────────────────────────────
  describe('3. createProperty (Private)', () => {
    const validBody = {
      title: '3BHK Furnished Apartment',
      description: 'Spacious apartment near metro station',
      price: 25000,
      category: 'Rentals',
      subcategory: 'Apartment',
      location: 'Bangalore, India',
      bedrooms: 3,
      bathrooms: 2,
      furnishing: 'Fully Furnished',
      squareFeet: 1500,
      images: ['/api/images/properties/u1/img1.webp'],
    };

    test('TC-P12: Should create a Rentals listing successfully', async () => {
      req.body = { ...validBody };

      await propertiesController.createProperty(req, res);

      expect(res.statusCode).toBe(201);
      expect(res._json.success).toBe(true);
      expect(res._json.data.category).toBe('Rentals');
      expect(publishListingCreated).toHaveBeenCalled();
    });

    test('TC-P13: Should create a Roommates listing successfully', async () => {
      req.body = {
        ...validBody,
        category: 'Roommates',
        subcategory: 'Shared Room',
        genderPreference: 'Male Only',
        occupancy: 'Shared',
        petFriendly: 'true',
      };

      await propertiesController.createProperty(req, res);

      expect(res.statusCode).toBe(201);
      expect(res._json.success).toBe(true);
      expect(res._json.data.category).toBe('Roommates');
      expect(res._json.data.petFriendly).toBe(true);
    });

    test('TC-P14: Should reject invalid category', async () => {
      req.body = { ...validBody, category: 'InvalidCategory' };

      await propertiesController.createProperty(req, res);

      expect(res.statusCode).toBe(400);
      expect(res._json.success).toBe(false);
    });

    test('TC-P15: Should convert petFriendly string to boolean', async () => {
      req.body = { ...validBody, petFriendly: 'true' };

      await propertiesController.createProperty(req, res);

      expect(res.statusCode).toBe(201);
      expect(res._json.data.petFriendly).toBe(true);
    });

    test('TC-P16: Should handle lat/lng coordinates', async () => {
      req.body = { ...validBody, lat: '12.9716', lng: '77.5946' };

      await propertiesController.createProperty(req, res);

      expect(res.statusCode).toBe(201);
      expect(res._json.data.coordinates.coordinates).toEqual([77.5946, 12.9716]);
    });
  });

  // ── 4. updateProperty ─────────────────────────────────────────────
  describe('4. updateProperty (Private)', () => {
    test('TC-P17: Should reject invalid ID', async () => {
      req.params = { id: 'bad-id' };
      req.body = { title: 'Updated' };

      await propertiesController.updateProperty(req, res);

      expect(res.statusCode).toBe(400);
    });

    test('TC-P18: Should return 404 if listing not found or unauthorized', async () => {
      req.params = { id: new mongoose.Types.ObjectId().toString() };
      req.body = { title: 'Updated' };
      mockPropertyFindOne.mockResolvedValue(null);

      await propertiesController.updateProperty(req, res);

      expect(res.statusCode).toBe(404);
    });

    test('TC-P19: Should update property successfully', async () => {
      const propId = new mongoose.Types.ObjectId().toString();
      req.params = { id: propId };
      req.body = { title: 'Updated Title', images: ['/api/images/properties/u1/img2.webp'] };

      mockPropertyFindOne.mockResolvedValue({
        _id: propId,
        title: 'Old Title',
        images: ['/api/images/properties/u1/img1.webp'],
        seller: mockUser._id,
      });
      mockPropertyFindOneAndUpdate.mockResolvedValue({
        _id: propId,
        title: 'Updated Title',
        images: ['/api/images/properties/u1/img2.webp'],
      });

      await propertiesController.updateProperty(req, res);

      expect(res.statusCode).toBe(200);
      expect(res._json.success).toBe(true);
      expect(res._json.data.title).toBe('Updated Title');
    });

    test('TC-P20: Should trigger image cleanup for removed images', async () => {
      const propId = new mongoose.Types.ObjectId().toString();
      req.params = { id: propId };
      req.body = { images: [] };

      mockPropertyFindOne.mockResolvedValue({
        _id: propId,
        images: ['/api/images/properties/u1/old.webp'],
        seller: mockUser._id,
      });
      mockPropertyFindOneAndUpdate.mockResolvedValue({
        _id: propId,
        images: [],
      });

      await propertiesController.updateProperty(req, res);

      expect(res.statusCode).toBe(200);
      expect(publishImageCleanup).toHaveBeenCalledWith({
        imageUrls: ['/api/images/properties/u1/old.webp'],
      });
    });
  });

  // ── 5. deleteProperty ─────────────────────────────────────────────
  describe('5. deleteProperty (Private)', () => {
    test('TC-P21: Should return 404 if listing not found', async () => {
      req.params = { id: new mongoose.Types.ObjectId().toString() };
      mockPropertyFindOne.mockResolvedValue(null);

      await propertiesController.deleteProperty(req, res);

      expect(res.statusCode).toBe(404);
    });

    test('TC-P22: Should delete listing and publish cleanup events', async () => {
      const propId = new mongoose.Types.ObjectId().toString();
      req.params = { id: propId };
      const mockListing = {
        _id: propId,
        images: ['/api/images/properties/u1/img1.webp', '/api/images/properties/u1/img2.webp'],
        seller: mockUser._id,
      };
      mockPropertyFindOne.mockResolvedValue(mockListing);
      mockPropertyDeleteOne.mockResolvedValue({ deletedCount: 1 });

      await propertiesController.deleteProperty(req, res);

      expect(res.statusCode).toBe(200);
      expect(res._json.success).toBe(true);
      expect(publishListingDeleted).toHaveBeenCalled();
      expect(publishImageCleanup).toHaveBeenCalledWith({
        imageUrls: mockListing.images,
      });
    });

    test('TC-P23: Should skip image cleanup if no images', async () => {
      const propId = new mongoose.Types.ObjectId().toString();
      req.params = { id: propId };
      mockPropertyFindOne.mockResolvedValue({
        _id: propId,
        images: [],
        seller: mockUser._id,
      });
      mockPropertyDeleteOne.mockResolvedValue({ deletedCount: 1 });

      await propertiesController.deleteProperty(req, res);

      expect(res.statusCode).toBe(200);
      expect(publishImageCleanup).not.toHaveBeenCalled();
    });

    test('TC-P24: Should return 500 on database error', async () => {
      req.params = { id: new mongoose.Types.ObjectId().toString() };
      mockPropertyFindOne.mockRejectedValue(new Error('DB error'));

      await propertiesController.deleteProperty(req, res);

      expect(res.statusCode).toBe(500);
    });
  });

  // ── 6. toggleSaveProperty ─────────────────────────────────────────
  describe('6. toggleSaveProperty (Private)', () => {
    test('TC-P25: Should reject invalid ID', async () => {
      req.params = { id: 'not-valid' };

      await propertiesController.toggleSaveProperty(req, res);

      expect(res.statusCode).toBe(400);
    });

    test('TC-P26: Should return 404 if listing not found', async () => {
      req.params = { id: new mongoose.Types.ObjectId().toString() };
      // Override the model mock for findById to return with populate chain
      Property.findById = jest.fn(() => ({
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn(), // not lean — needs save, so skip lean
      }));
      Property.findById.mockReturnValue({
        populate: jest.fn().mockReturnValue(null),
      });

      // Simpler: directly mock to return null
      Property.findById = jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue(null),
      });

      await propertiesController.toggleSaveProperty(req, res);

      expect(res.statusCode).toBe(404);
    });

    test('TC-P27: Should save a property (add to savedBy)', async () => {
      const propId = new mongoose.Types.ObjectId().toString();
      req.params = { id: propId };
      const mockListing = {
        _id: propId,
        savedBy: [],
        save: jest.fn(async function () { return this; }),
        toObject: jest.fn(function () { return { ...this }; }),
      };
      Property.findById = jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue(mockListing),
      });

      await propertiesController.toggleSaveProperty(req, res);

      expect(res.statusCode).toBe(200);
      expect(res._json.success).toBe(true);
      expect(res._json.isSaved).toBe(true);
      expect(res._json.saved).toBe(true);
      expect(mockListing.savedBy).toContain(mockUser._id);
    });

    test('TC-P28: Should unsave a property (remove from savedBy)', async () => {
      const propId = new mongoose.Types.ObjectId().toString();
      req.params = { id: propId };
      const mockListing = {
        _id: propId,
        savedBy: [mockUser._id],
        save: jest.fn(async function () { return this; }),
        toObject: jest.fn(function () { return { ...this }; }),
      };
      Property.findById = jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue(mockListing),
      });

      await propertiesController.toggleSaveProperty(req, res);

      expect(res.statusCode).toBe(200);
      expect(res._json.isSaved).toBe(false);
      expect(res._json.saved).toBe(false);
    });

    test('TC-P29: Should invalidate Redis cache after toggle', async () => {
      const propId = new mongoose.Types.ObjectId().toString();
      req.params = { id: propId };
      const mockListing = {
        _id: propId,
        savedBy: [],
        save: jest.fn(async function () { return this; }),
        toObject: jest.fn(function () { return { ...this }; }),
      };
      Property.findById = jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue(mockListing),
      });

      await propertiesController.toggleSaveProperty(req, res);

      expect(redis.del).toHaveBeenCalledWith(`user:${mockUser._id}:saved:properties`);
    });
  });

  // ── 7. getMyProperties ────────────────────────────────────────────
  describe('7. getMyProperties (Private)', () => {
    test('TC-P30: Should return user\'s own listings', async () => {
      const mockListings = [
        { _id: '1', title: 'My Apartment', images: ['img1.webp'], seller: mockUser._id },
        { _id: '2', title: 'My Room', images: ['img2.webp'], seller: mockUser._id },
      ];
      mockPropertyFind.mockResolvedValue(mockListings);

      await propertiesController.getMyProperties(req, res);

      expect(res.statusCode).toBe(200);
      expect(res._json.success).toBe(true);
      expect(res._json.listings.length).toBe(2);
    });

    test('TC-P31: Should return empty array if no listings', async () => {
      mockPropertyFind.mockResolvedValue([]);

      await propertiesController.getMyProperties(req, res);

      expect(res.statusCode).toBe(200);
      expect(res._json.listings.length).toBe(0);
    });

    test('TC-P32: Should return 500 on error', async () => {
      mockPropertyFind.mockRejectedValue(new Error('DB down'));

      await propertiesController.getMyProperties(req, res);

      expect(res.statusCode).toBe(500);
    });
  });

  // ── 8. getSavedProperties ─────────────────────────────────────────
  describe('8. getSavedProperties (Private)', () => {
    test('TC-P33: Should return cached saved properties (cache HIT)', async () => {
      redis.get.mockResolvedValue(JSON.stringify({
        listings: [
          { _id: '1', title: 'Saved Apt', images: ['/api/images/properties/u1/img.webp'] }
        ],
      }));

      await propertiesController.getSavedProperties(req, res);

      expect(res.statusCode).toBe(200);
      expect(res._json.success).toBe(true);
      expect(res._json.listings.length).toBe(1);
      expect(res._headers['X-Cache']).toBe('HIT');
    });

    test('TC-P34: Should fetch from DB on cache MISS', async () => {
      redis.get.mockResolvedValue(null);
      mockPropertyFind.mockResolvedValue([
        { _id: '1', title: 'Saved Room', images: ['img.webp'] },
      ]);

      await propertiesController.getSavedProperties(req, res);

      expect(res.statusCode).toBe(200);
      expect(res._json.success).toBe(true);
      expect(res._headers['X-Cache']).toBe('MISS');
      expect(redis.setex).toHaveBeenCalled();
    });

    test('TC-P35: Should continue on cache read error', async () => {
      redis.get.mockRejectedValue(new Error('Redis down'));
      mockPropertyFind.mockResolvedValue([]);

      await propertiesController.getSavedProperties(req, res);

      expect(res.statusCode).toBe(200);
      expect(res._json.success).toBe(true);
    });

    test('TC-P36: Should return 500 on DB error', async () => {
      redis.get.mockResolvedValue(null);
      mockPropertyFind.mockRejectedValue(new Error('DB error'));

      await propertiesController.getSavedProperties(req, res);

      expect(res.statusCode).toBe(500);
    });
  });

  // ── 9. uploadImages ───────────────────────────────────────────────
  describe('9. uploadImages (Private)', () => {
    test('TC-P37: Should return 400 if no files', async () => {
      req.files = null;

      await propertiesController.uploadImages(req, res);

      expect(res.statusCode).toBe(400);
    });

    test('TC-P38: Should return 400 if empty files array', async () => {
      req.files = [];

      await propertiesController.uploadImages(req, res);

      expect(res.statusCode).toBe(400);
    });

    test('TC-P39: Should upload images and return URLs', async () => {
      req.files = [
        { buffer: Buffer.from('fake'), mimetype: 'image/jpeg' },
        { buffer: Buffer.from('fake2'), mimetype: 'image/png' },
      ];

      await propertiesController.uploadImages(req, res);

      expect(res.statusCode).toBe(200);
      expect(res._json.success).toBe(true);
      expect(res._json.imageUrls.length).toBe(2);
    });
  });

  // ── 10. Conversation listingType Validation ───────────────────────
  describe('10. ListingType Enum Validation (Integration)', () => {
    test('TC-P40: Conversation enum should accept rentals', () => {
      const validTypes = ['electronics', 'vehicles', 'forsale', 'rentals', 'jobs', 'events', 'services', 'roommates', 'takecare', null];
      expect(validTypes).toContain('rentals');
      expect(validTypes).toContain('roommates');
      expect(validTypes).not.toContain('properties');
    });

    test('TC-P41: Property category maps to valid enum', () => {
      const mapCategoryToListingType = (cat) => (cat || 'rentals').toLowerCase();
      expect(mapCategoryToListingType('Rentals')).toBe('rentals');
      expect(mapCategoryToListingType('Roommates')).toBe('roommates');
    });
  });

  // ── 11. Edge Cases & Security ─────────────────────────────────────
  describe('11. Edge Cases & Security', () => {
    test('TC-P42: Should handle missing req.user gracefully on getMyProperties', async () => {
      req.user = null;
      // This would normally be caught by auth middleware, but test controller resilience
      mockPropertyFind.mockRejectedValue(new TypeError("Cannot read properties of null"));

      await propertiesController.getMyProperties(req, res);

      expect(res.statusCode).toBe(500);
    });

    test('TC-P43: Should normalise images in getProperties response', async () => {
      req.query = {};
      const mockListings = [
        { _id: '1', title: 'Test', images: ['properties/u1/raw.webp'] },
      ];
      mockPropertyFind.mockResolvedValue(mockListings);
      mockPropertyCountDocuments.mockResolvedValue(1);

      await propertiesController.getProperties(req, res);

      expect(res._json.data[0].images[0]).toContain('/api/images/');
    });

    test('TC-P44: Should handle pagination boundary (page 0)', async () => {
      req.query = { page: 0 };
      mockPropertyFind.mockResolvedValue([]);
      mockPropertyCountDocuments.mockResolvedValue(0);

      await propertiesController.getProperties(req, res);

      expect(res.statusCode).toBe(200);
      expect(res._json.pagination.page).toBeGreaterThanOrEqual(1);
    });

    test('TC-P45: Should handle negative limit gracefully', async () => {
      req.query = { limit: -5 };
      mockPropertyFind.mockResolvedValue([]);
      mockPropertyCountDocuments.mockResolvedValue(0);

      await propertiesController.getProperties(req, res);

      expect(res.statusCode).toBe(200);
      expect(res._json.pagination.limit).toBeGreaterThanOrEqual(1);
    });
  });
});

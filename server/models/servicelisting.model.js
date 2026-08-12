const mongoose = require('mongoose');
const { attachListingVideosField } = require('./plugins/listing-videos.plugin');
const { attachSlugPlugin } = require('../utils/slugify');

const serviceListingSchema = new mongoose.Schema({
  providerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ServiceProvider',
    required: false
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    minlength: [5, 'Title must be at least 5 characters'],
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    minlength: [50, 'Description must be at least 50 characters'],
    maxlength: [5000, 'Description cannot exceed 5000 characters']
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ServiceCategory',
    required: true
  },
  subcategory: {
    type: String,
    required: true
  },
  pricing: {
    basePrice: {
      type: Number,
      required: true,
      min: 0
    },
    priceType: {
      type: String,
      enum: ['fixed', 'hourly', 'daily', 'weekly', 'monthly', 'project'],
      default: 'fixed'
    },
    negotiable: {
      type: Boolean,
      default: false
    },
    discount: {
      type: Number,
      min: 0,
      max: 100
    }
  },
  images: [{
    url: String,
    publicId: String,
    isPrimary: { type: Boolean, default: false }
  }],
  phone: {
    type: String,
    required: false
  },
  phoneCode: {
    type: String,
    trim: true,
    default: '+91',
  },
  currency: {
    type: String,
    trim: true,
    default: '₹',
  },
  countryCode: { type: String, trim: true, index: true },
  location: {
    type: {
      type: String,
      enum: ['Point'],
    },
    coordinates: {
      type: [Number],
      required: false,
      default: undefined,
    },
    address: String,
    city: String,
    state: String,
    pincode: String,
    landmark: String
  },
  availability: {
    startDate: Date,
    endDate: Date,
    recurring: {
      type: String,
      enum: ['none', 'daily', 'weekly', 'monthly'],
      default: 'none'
    },
    schedule: [{
      day: String,
      startTime: String,
      endTime: String
    }]
  },
  specifications: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  },
  // Service-specific fields from the form
  serviceType: { type: String },
  experience: { type: String },
  serviceAvailability: { type: String },
  priceType: {
    type: String,
    enum: ['fixed', 'Fixed', 'Hourly', 'hourly', 'Daily', 'daily', 'Per Visit', 'Per Project', 'Monthly', 'monthly', 'Negotiable', 'project', 'weekly', 'Per Hour', 'Per Day', 'Per Month', 'Fixed Quote'],
    default: 'fixed'
  },
  serviceArea: { type: String },
  certification: { type: String },
  languages: { type: String },
  teamSize: { type: String },
  turnaroundTime: { type: String },
  portfolioLink: { type: String },
  seller: { type: String },
  sellerName: { type: String },
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended', 'expired'],
    default: 'active'
  },
  visibility: {
    type: String,
    enum: ['public', 'private'],
    default: 'public'
  },
  featured: {
    type: Boolean,
    default: false
  },
  featuredUntil: Date,
  savedBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  stats: {
    views: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
    inquiries: { type: Number, default: 0 },
    bookings: { type: Number, default: 0 }
  },
  tags: [String],
  expiresAt: {
    type: Date,
    default: () => new Date(+new Date() + 30*24*60*60*1000)
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
serviceListingSchema.index({ location: '2dsphere' }, { sparse: true });
serviceListingSchema.index({ category: 1, subcategory: 1 });
serviceListingSchema.index({ status: 1, visibility: 1 });
serviceListingSchema.index({ 'pricing.basePrice': 1 });
serviceListingSchema.index({ createdAt: -1 });
serviceListingSchema.index({ tags: 1 });
serviceListingSchema.index({ userId: 1, status: 1 });
serviceListingSchema.index({ providerId: 1, status: 1 });
serviceListingSchema.index({ title: 'text', description: 'text', serviceType: 'text', subcategory: 'text' });

// Virtual for reviews
serviceListingSchema.virtual('reviews', {
  ref: 'ServiceReview',
  localField: '_id',
  foreignField: 'listingId'
});

// Method to increment view count
serviceListingSchema.methods.incrementViews = async function() {
  this.stats.views += 1;
  await this.save();
};

// Static method to find nearby services
serviceListingSchema.statics.findNearby = function(coords, maxDistance = 5000) {
  const radiusKm = maxDistance / 1000;
  return this.find({
    location: {
      $geoWithin: {
        $centerSphere: [coords, radiusKm / 6378.1],
      },
    },
    status: 'active',
    visibility: 'public'
  });
};

attachListingVideosField(serviceListingSchema);
attachSlugPlugin(serviceListingSchema);

module.exports = mongoose.model('ServiceListing', serviceListingSchema);
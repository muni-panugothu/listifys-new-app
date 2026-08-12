const mongoose = require("mongoose");
const s3Service = require("../services/s3.service.js");
const { attachListingVideosField } = require('./plugins/listing-videos.plugin');
const { attachSlugPlugin } = require("../utils/slugify");

const electronicsSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
      maxlength: [200, "Title cannot exceed 200 characters"],
    },
    description: {
      type: String,
      required: [true, "Description is required"],
      trim: true,
      minlength: [14, "Description must be at least 14 characters"],
    },
    price: {
      type: Number,
      required: [true, "Price is required"],
      min: [0, "Price cannot be negative"],
    },
    category: {
      type: String,
      required: [true, "Category is required"],
      trim: true,
      enum: {
        values: ["Electronics"],
        message: "Category must be Electronics for this model",
      },
    },
    subcategory: {
      type: String,
      required: [true, "Subcategory is required"],
      trim: true,
      enum: {
        values: [
          "TVs, Video - Audio",
          "Kitchen & Other Appliances",
          "Fridges",
          "Washing Machines",
          "ACs",
          "Computers & Laptops",
          "Computer Accessories",
          "Hard Disks, Printers & Monitors",
          "Cameras & Lenses",
        ],
        message: "Invalid subcategory for Electronics",
      },
    },
    condition: {
      type: String,
      enum: ["New", "Like New", "Good", "Fair", "Used"],
      default: "Good",
    },
    // ── Product-specific fields ──────────────────────────────
    brand: {
      type: String,
      trim: true,
      maxlength: [100, "Brand cannot exceed 100 characters"],
    },
    model: {
      type: String,
      trim: true,
      maxlength: [100, "Model cannot exceed 100 characters"],
    },
    warranty: {
      type: String,
      trim: true,
      enum: {
        values: ["Under Warranty", "Expired", "No Warranty", ""],
        message: "Invalid warranty status",
      },
    },
    purchaseYear: {
      type: Number,
      min: [2000, "Purchase year cannot be before 2000"],
    },
    // TV / Audio
    screenSize: {
      type: String,
      trim: true,
      maxlength: [50, "Screen size cannot exceed 50 characters"],
    },
    displayType: {
      type: String,
      trim: true,
      maxlength: [50, "Display type cannot exceed 50 characters"],
    },
    // Computers & Laptops
    processor: {
      type: String,
      trim: true,
      maxlength: [100, "Processor cannot exceed 100 characters"],
    },
    ram: {
      type: String,
      trim: true,
      maxlength: [30, "RAM cannot exceed 30 characters"],
    },
    storage: {
      type: String,
      trim: true,
      maxlength: [50, "Storage cannot exceed 50 characters"],
    },
    // Fridges / Washing Machines / ACs
    capacity: {
      type: String,
      trim: true,
      maxlength: [50, "Capacity cannot exceed 50 characters"],
    },
    energyRating: {
      type: String,
      trim: true,
      enum: {
        values: ["1 Star", "2 Star", "3 Star", "4 Star", "5 Star", ""],
        message: "Invalid energy rating",
      },
    },
    // Cameras
    megapixels: {
      type: String,
      trim: true,
      maxlength: [30, "Megapixels cannot exceed 30 characters"],
    },
    lensType: {
      type: String,
      trim: true,
      maxlength: [100, "Lens type cannot exceed 100 characters"],
    },
    location: {
      type: String,
      required: [true, "Location is required"],
      trim: true,
    },
    coordinates: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: { type: [Number], default: undefined },
    },
    images: [
      {
        type: String, // S3 URLs or image URLs
      },
    ],
    features: [
      {
        type: String,
        trim: true,
      },
    ],
    phone: {
      type: String,
      trim: true,
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
    // Seller information - linked to User model
    seller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    sellerName: {
      type: String,
      required: true,
    },
    sellerRating: {
      type: Number,
      default: 5.0,
      min: 0,
      max: 5,
    },
    sellerReviews: {
      type: Number,
      default: 0,
    },
    sellerJoined: {
      type: String,
      default: () => {
        const date = new Date();
        return `${date.toLocaleString("default", { month: "short" })} ${date.getFullYear()}`;
      },
    },
    // Status
    status: {
      type: String,
      enum: ["active", "sold", "expired", "removed"],
      default: "active",
    },
    featured: {
      type: Boolean,
      default: false,
    },
    views: {
      type: Number,
      default: 0,
    },
    savedBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: function (doc, ret) {
        ret.id = ret._id;
        delete ret.__v;
        // Convert S3 URLs to proxy URLs to hide AWS infrastructure
        if (ret.images && Array.isArray(ret.images)) {
          ret.images = ret.images.map(url => s3Service.toProxyUrl(url));
        }
        if (ret.seller && ret.seller.profileImage) {
          ret.seller.profileImage = s3Service.toProxyUrl(ret.seller.profileImage);
        }
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

// Virtual for time since posting
electronicsSchema.virtual("postedTime").get(function () {
  const now = new Date();
  const diff = now - this.createdAt;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} day${days > 1 ? "s" : ""} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
  return "Just now";
});

// Indexes for efficient queries
electronicsSchema.index({ status: 1, createdAt: -1 });
electronicsSchema.index({ category: 1, subcategory: 1, status: 1 });
electronicsSchema.index({ subcategory: 1, status: 1, createdAt: -1 });
electronicsSchema.index({ seller: 1, status: 1 });
electronicsSchema.index({ price: 1 });
electronicsSchema.index({ savedBy: 1 });
electronicsSchema.index({ brand: 1, subcategory: 1 });
electronicsSchema.index({ title: "text", description: "text", brand: "text", model: "text" });
electronicsSchema.index({ "coordinates": "2dsphere" });

attachListingVideosField(electronicsSchema);
attachSlugPlugin(electronicsSchema);

module.exports = mongoose.model("Electronics", electronicsSchema);
  

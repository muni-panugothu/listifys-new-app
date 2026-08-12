const mongoose = require("mongoose");
const s3Service = require("../services/s3.service.js");
const { attachListingVideosField } = require('./plugins/listing-videos.plugin');
const { attachSlugPlugin } = require("../utils/slugify");

const vehicleSchema = new mongoose.Schema(
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
      minlength: [20, "Description must be at least 20 characters"],
      maxlength: [5000, "Description cannot exceed 5000 characters"],
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
        values: ["Vehicles"],
        message: "Category must be Vehicles for this model",
      },
    },
    subcategory: {
      type: String,
      required: [true, "Subcategory is required"],
      trim: true,
      enum: {
        values: ["Cars", "Bikes", "Cycle", "Spare Parts"],
        message: "Subcategory must be one of: Cars, Bikes, Cycle, Spare Parts",
      },
    },
    condition: {
      type: String,
      enum: ["New", "Like New", "Good", "Fair", "Used"],
      default: "Good",
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
        type: String,
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
    // Vehicle-specific fields
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
    variant: {
      type: String,
      trim: true,
      maxlength: [100, "Variant cannot exceed 100 characters"],
    },
    year: {
      type: String,
      trim: true,
      validate: {
        validator: function (v) {
          if (!v) return true;
          const n = Number(v);
          return !isNaN(n) && n >= 1900 && n <= new Date().getFullYear() + 1;
        },
        message: "Year must be between 1900 and next year",
      },
    },
    kmDriven: {
      type: String,
      trim: true,
      maxlength: [30, "KM driven cannot exceed 30 characters"],
    },
    mileageUnit: {
      type: String,
      trim: true,
      enum: ["km", "mi", ""],
      default: "km",
    },
    fuelType: {
      type: String,
      trim: true,
      enum: {
        values: ["Petrol", "Diesel", "CNG", "Electric", "Hybrid", "LPG", ""],
        message: "Invalid fuel type",
      },
    },
    transmission: {
      type: String,
      trim: true,
      enum: {
        values: ["Manual", "Automatic", ""],
        message: "Transmission must be Manual or Automatic",
      },
    },
    ownership: {
      type: String,
      trim: true,
      enum: {
        values: ["1st Owner", "2nd Owner", "3rd Owner", "4th+ Owner", ""],
        message: "Invalid ownership value",
      },
    },
    color: {
      type: String,
      trim: true,
      maxlength: [50, "Color cannot exceed 50 characters"],
    },
    // Bike-specific
    engineCC: {
      type: String,
      trim: true,
      maxlength: [20, "Engine CC cannot exceed 20 characters"],
    },
    // Cycle-specific
    cycleType: {
      type: String,
      trim: true,
      enum: {
        values: ["Mountain", "Road", "Hybrid", "BMX", "Kids", "Folding", "Electric", "Cruiser", ""],
        message: "Invalid cycle type",
      },
    },
    gearCount: {
      type: String,
      trim: true,
      maxlength: [10, "Gear count cannot exceed 10 characters"],
    },
    frameSize: {
      type: String,
      trim: true,
      maxlength: [20, "Frame size cannot exceed 20 characters"],
    },
    // Spare Parts-specific
    compatibleVehicle: {
      type: String,
      trim: true,
      enum: {
        values: ["Car", "Bike", "Cycle", "Universal", ""],
        message: "Invalid compatible vehicle type",
      },
    },
    partCategory: {
      type: String,
      trim: true,
      maxlength: [100, "Part category cannot exceed 100 characters"],
      enum: {
        values: [
          "Engine Parts", "Body Parts", "Electrical", "Suspension", "Brakes",
          "Tyres & Wheels", "Interior", "Exterior", "Exhaust", "Filters", "Other", ""
        ],
        message: "Invalid part category",
      },
    },
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
vehicleSchema.virtual("postedTime").get(function () {
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
vehicleSchema.index({ status: 1, createdAt: -1 });
vehicleSchema.index({ category: 1, status: 1 });
vehicleSchema.index({ category: 1, subcategory: 1, status: 1 });
vehicleSchema.index({ subcategory: 1, status: 1, createdAt: -1 });
vehicleSchema.index({ seller: 1, status: 1 });
vehicleSchema.index({ price: 1 });
vehicleSchema.index({ savedBy: 1 });
vehicleSchema.index({ brand: 1, subcategory: 1 });
vehicleSchema.index({ title: "text", description: "text", brand: "text", model: "text" });
vehicleSchema.index({ "coordinates": "2dsphere" });

attachListingVideosField(vehicleSchema);
attachSlugPlugin(vehicleSchema);

module.exports = mongoose.model("Vehicle", vehicleSchema);

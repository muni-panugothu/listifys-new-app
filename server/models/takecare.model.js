const mongoose = require("mongoose");
const s3Service = require("../services/s3.service.js");
const { attachListingVideosField } = require('./plugins/listing-videos.plugin');
const { attachSlugPlugin } = require("../utils/slugify");

const takeCareSchema = new mongoose.Schema(
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
        values: ["Take Care"],
        message: "Category must be Take Care for this model",
      },
    },
    subcategory: {
      type: String,
      required: [true, "Subcategory is required"],
      trim: true,
      enum: {
        values: ["Nanny", "Babysitter", "Elder Care", "Pet Care"],
        message: "Invalid subcategory for Take Care",
      },
    },
    condition: {
      type: String,
      enum: ["New", "Like New", "Good", "Fair", "Used"],
      default: "Good",
    },
    experience: {
      type: String,
      trim: true,
      maxlength: [100, "Experience cannot exceed 100 characters"],
    },
    availability: {
      type: String,
      trim: true,
      maxlength: [100, "Availability cannot exceed 100 characters"],
    },
    age: {
      type: Number,
      min: [18, "Age must be at least 18"],
      max: [90, "Age cannot exceed 90"],
    },
    languages: [
      {
        type: String,
        trim: true,
      },
    ],
    certifications: [
      {
        type: String,
        trim: true,
      },
    ],
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
        if (ret.images && Array.isArray(ret.images)) {
          ret.images = ret.images.map((url) => s3Service.toProxyUrl(url));
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

takeCareSchema.virtual("postedTime").get(function () {
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

takeCareSchema.index({ status: 1, createdAt: -1 });
takeCareSchema.index({ category: 1, subcategory: 1, status: 1 });
takeCareSchema.index({ subcategory: 1, status: 1, createdAt: -1 });
takeCareSchema.index({ seller: 1, status: 1 });
takeCareSchema.index({ price: 1 });
takeCareSchema.index({ savedBy: 1 });
takeCareSchema.index({ title: "text", description: "text", experience: "text" });
takeCareSchema.index({ coordinates: "2dsphere" });

attachListingVideosField(takeCareSchema);
attachSlugPlugin(takeCareSchema);

module.exports = mongoose.model("TakeCare", takeCareSchema);

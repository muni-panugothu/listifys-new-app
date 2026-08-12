const mongoose = require("mongoose");
const s3Service = require("../services/s3.service.js");
const { attachListingVideosField } = require('./plugins/listing-videos.plugin');
const { attachSlugPlugin } = require("../utils/slugify");

const sportsSchema = new mongoose.Schema(
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
    },
    price: {
      type: Number,
      required: [true, "Price is required"],
      min: [0, "Price cannot be negative"],
    },
    category: {
      type: String,
      default: "Sports",
      enum: ["Sports"],
    },
    subcategory: {
      type: String,
      required: [true, "Subcategory is required"],
      trim: true,
      enum: {
        values: [
          "Exercise & Gym",
          "Outdoor Sports",
          "Indoor Sports",
          "Water Sports",
          "Cycling",
          "Camping & Hiking",
          "Fitness Accessories",
          "Team Sports",
          "Running & Athletics",
          "Yoga & Meditation",
          "Martial Arts & Boxing",
          "Racket Sports",
          "Cricket Equipment",
          "Gym Equipment",
          "Sports Nutrition",
          "Sports Clothing",
          "Other Sports",
        ],
        message: "Invalid subcategory for Sports",
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
    images: [{ type: String }],
    features: [{ type: String, trim: true }],
    phone: { type: String, trim: true },
    phoneCode: { type: String, trim: true, default: "+91" },
    currency: { type: String, trim: true, default: "₹" },
    countryCode: { type: String, trim: true, index: true },

    brand: { type: String, trim: true },
    sportType: {
      type: String,
      trim: true,
      enum: {
        values: [
          "Cricket",
          "Football",
          "Badminton",
          "Tennis",
          "Basketball",
          "Swimming",
          "Running",
          "Yoga",
          "Boxing",
          "Hockey",
          "Table Tennis",
          "Gym & Fitness",
          "Cycling",
          "Hiking",
          "Skating",
          "Golf",
          "Other",
          "",
        ],
        message: "Invalid sport type",
      },
    },
    size: { type: String, trim: true },
    material: { type: String, trim: true },
    color: { type: String, trim: true },
    weight: { type: String, trim: true },
    ageGroup: {
      type: String,
      enum: ["Kids", "Adults", "All Ages", ""],
      default: "",
    },

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
    featured: { type: Boolean, default: false },
    views: { type: Number, default: 0 },
    savedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
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
          ret.seller.profileImage = s3Service.toProxyUrl(
            ret.seller.profileImage,
          );
        }
        return ret;
      },
    },
    toObject: { virtuals: true },
  },
);

sportsSchema.virtual("postedTime").get(function () {
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

sportsSchema.index({ status: 1, createdAt: -1 });
sportsSchema.index({ seller: 1, status: 1 });
sportsSchema.index({ price: 1 });
sportsSchema.index({ savedBy: 1 });
sportsSchema.index({
  title: "text",
  description: "text",
  brand: "text",
  sportType: "text",
  material: "text",
});
sportsSchema.index({ coordinates: "2dsphere" }, { sparse: true });

attachListingVideosField(sportsSchema);
attachSlugPlugin(sportsSchema);

module.exports = mongoose.model("Sports", sportsSchema);

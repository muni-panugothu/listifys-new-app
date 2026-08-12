const mongoose = require("mongoose");
const s3Service = require("../services/s3.service.js");
const { attachListingVideosField } = require('./plugins/listing-videos.plugin');
const { attachSlugPlugin } = require("../utils/slugify");

const collectibleSchema = new mongoose.Schema(
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
      default: "Collectibles",
      enum: ["Collectibles"],
    },
    subcategory: {
      type: String,
      required: [true, "Subcategory is required"],
      trim: true,
      enum: {
        values: [
          "Coins & Currency",
          "Stamps",
          "Trading Cards",
          "Antiques",
          "Vintage Items",
          "Memorabilia",
          "Art & Prints",
          "Other Collectibles",
        ],
        message: "Invalid subcategory for Collectibles",
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
    era: { type: String, trim: true },
    material: { type: String, trim: true },
    color: { type: String, trim: true },
    rarity: {
      type: String,
      enum: ["Common", "Uncommon", "Rare", "Very Rare", "Extremely Rare", ""],
      default: "",
    },
    authenticity: {
      type: String,
      enum: ["Certified", "Uncertified", ""],
      default: "",
    },
    origin: { type: String, trim: true },

    seller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    sellerName: { type: String, required: true },
    sellerRating: { type: Number, default: 5.0, min: 0, max: 5 },
    sellerReviews: { type: Number, default: 0 },
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

collectibleSchema.virtual("postedTime").get(function () {
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

collectibleSchema.index({ status: 1, createdAt: -1 });
collectibleSchema.index({ seller: 1, status: 1 });
collectibleSchema.index({ price: 1 });
collectibleSchema.index({ savedBy: 1 });
collectibleSchema.index({
  title: "text",
  description: "text",
  brand: "text",
  era: "text",
  material: "text",
});
collectibleSchema.index({ coordinates: "2dsphere" }, { sparse: true });

attachListingVideosField(collectibleSchema);
attachSlugPlugin(collectibleSchema);

module.exports = mongoose.model("Collectible", collectibleSchema);

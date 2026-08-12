const mongoose = require("mongoose");
const s3Service = require("../services/s3.service.js");
const { attachListingVideosField } = require('./plugins/listing-videos.plugin');
const { attachSlugPlugin } = require("../utils/slugify");

const forSaleSchema = new mongoose.Schema(
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
      required: [true, "Category is required"],
      trim: true,
      enum: {
        values: [
          "Mobiles",
          "Furniture",
          "Fashion",
          "Books, Sports",
          "Books",
          "Sports",
          "Toys & Games",
          "Collectibles",
          "Pets",
          "Beauty",
          "Others",
        ],
        message: "Invalid For Sale category",
      },
    },
    subcategory: {
      type: String,
      required: [true, "Subcategory is required"],
      trim: true,
      enum: {
        values: [
          "Mobile Phones", "Accessories", "Tablets",
          "Sofas & Dining", "Beds & Wardrobes", "Tables & Chairs", "Home Decor", "Office Furniture",
          "Men's Clothing", "Women's Clothing", "Kids Clothing", "Footwear", "Watches",
          "Fiction", "Non-Fiction", "Children's Books", "Textbooks", "Comics", "Magazines",
          "Exercise", "Camping", "Bikes", "Sports Equipment", "Hunting", "Fishing",
          "Books", "Gym & Fitness", "Musical Instruments", "Hobbies", "Cycling",
          "Video Games", "Puzzles", "RC Toys", "Soft Toys & Dolls", "Building Toys", "Baby Toys", "Action Figures", "Other",
          "Antiques", "Art", "Coins", "Memorabilia", "Vintage", "Stamps",
          "Dog Supplies", "Cat Supplies", "Bird Supplies", "Fish Supplies", "Reptile Supplies",
          "Makeup", "Skincare", "Hair Care", "Fragrance", "Vitamins", "Personal Care",
          "Other Items",
        ],
        message: "Invalid subcategory for this category",
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
        type: String, // S3 URLs
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

    // ── Mobiles-specific fields ──────────────────────────────
    brand: {
      type: String,
      trim: true,
    },
    model: {
      type: String,
      trim: true,
    },
    storage: {
      type: String,
      trim: true,
    },
    ram: {
      type: String,
      trim: true,
    },
    screenSize: {
      type: String,
      trim: true,
    },
    batteryHealth: {
      type: String,
      trim: true,
    },
    warranty: {
      type: String,
      trim: true,
    },
    color: {
      type: String,
      trim: true,
    },

    // ── Furniture-specific fields ────────────────────────────
    material: {
      type: String,
      trim: true,
    },
    dimensions: {
      type: String,
      trim: true,
    },
    weight: {
      type: String,
      trim: true,
    },
    assemblyRequired: {
      type: String,
      enum: ["Yes", "No", ""],
      default: "",
    },
    numberOfPieces: {
      type: String,
      trim: true,
    },

    // ── Fashion-specific fields ──────────────────────────────
    size: {
      type: String,
      trim: true,
    },
    gender: {
      type: String,
      enum: ["Men", "Women", "Kids", "Unisex", ""],
      default: "",
    },
    fabricType: {
      type: String,
      trim: true,
    },

    // ── Books, Sports-specific fields ────────────────────────
    author: {
      type: String,
      trim: true,
    },
    isbn: {
      type: String,
      trim: true,
    },
    publisher: {
      type: String,
      trim: true,
    },
    edition: {
      type: String,
      trim: true,
    },
    sportType: {
      type: String,
      trim: true,
    },

    // ── Seller information ───────────────────────────────────
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

    // ── Status & metadata ────────────────────────────────────
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
forSaleSchema.virtual("postedTime").get(function () {
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
forSaleSchema.index({ status: 1, createdAt: -1 });
forSaleSchema.index({ category: 1, status: 1 });
forSaleSchema.index({ category: 1, subcategory: 1, status: 1 });
forSaleSchema.index({ subcategory: 1, status: 1, createdAt: -1 });
forSaleSchema.index({ seller: 1, status: 1 });
forSaleSchema.index({ price: 1 });
forSaleSchema.index({ savedBy: 1 });
forSaleSchema.index({ title: "text", description: "text" });
forSaleSchema.index({ "coordinates": "2dsphere" });

attachListingVideosField(forSaleSchema);
attachSlugPlugin(forSaleSchema);

module.exports = mongoose.model("ForSale", forSaleSchema);

const mongoose = require("mongoose");
const { attachListingVideosField } = require('./plugins/listing-videos.plugin');
const { attachSlugPlugin } = require("../utils/slugify");

const propertySchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
      maxlength: [100, "Title cannot exceed 100 characters"],
    },
    description: {
      type: String,
      required: [true, "Description is required"],
      maxlength: [5000, "Description cannot exceed 5000 characters"],
    },
    price: {
      type: Number,
      required: [true, "Price/Rent is required"],
      min: [0, "Price cannot be negative"],
    },
    category: {
      type: String,
      required: [true, "Category is required"],
      enum: ["Properties", "Rentals", "Roommates"],
    },
    subcategory: {
      type: String,
      required: [true, "Subcategory is required"],
    },
    location: {
      type: String,
      required: [true, "Location is required"],
      trim: true,
    },
    coordinates: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number],
        default: undefined,
      },
    },
    images: {
      type: [String],
      validate: [
        (val) => val.length <= 15,
        "Cannot upload more than 15 images",
      ],
    },
    bedrooms: {
      type: Number,
      min: [0, "Bedrooms cannot be negative"],
    },
    bathrooms: {
      type: Number,
      min: [0, "Bathrooms cannot be negative"],
    },
    furnishing: {
      type: String,
      enum: ["Fully Furnished", "Semi-Furnished", "Unfurnished", ""],
      default: "",
    },
    squareFeet: {
      type: Number,
      min: [0, "Area cannot be negative"],
    },
    availableFrom: {
      type: Date,
    },
    // Roommate specific
    genderPreference: {
      type: String,
      enum: ["Any", "Male Only", "Female Only", ""],
      default: "Any",
    },
    occupancy: {
      type: String,
      enum: ["Single", "Shared", "Any", ""],
      default: "Any",
    },
    petFriendly: {
      type: Boolean,
      default: false,
    },
    features: {
      type: [String],
      default: [],
    },
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
      index: true,
    },
    sellerName: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "draft", "sold", "rented"],
      default: "active",
      index: true,
    },
    savedBy: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    }],
    views: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

propertySchema.index({ coordinates: "2dsphere" });
propertySchema.index({
  title: "text",
  description: "text",
  location: "text",
  category: "text",
  subcategory: "text",
});
propertySchema.index({ status: 1, createdAt: -1 });
propertySchema.index({ category: 1, status: 1 });
propertySchema.index({ category: 1, subcategory: 1, status: 1 });
propertySchema.index({ seller: 1, status: 1 });
propertySchema.index({ price: 1 });
propertySchema.index({ savedBy: 1 });

attachListingVideosField(propertySchema);
attachSlugPlugin(propertySchema);

module.exports = mongoose.model("Property", propertySchema);

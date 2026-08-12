const mongoose = require("mongoose");
const s3Service = require("../services/s3.service.js");
const { attachListingVideosField } = require('./plugins/listing-videos.plugin');
const { attachSlugPlugin } = require("../utils/slugify");

const jobSchema = new mongoose.Schema(
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
        values: ["Jobs"],
        message: "Category must be Jobs for this model",
      },
    },
    subcategory: {
      type: String,
      required: [true, "Subcategory is required"],
      trim: true,
      enum: {
        values: ["IT Jobs", "Non IT Jobs", "Part Time", "Contract Type"],
        message: "Invalid subcategory for Jobs",
      },
    },
    condition: {
      type: String,
      enum: ["New", "Like New", "Good", "Fair", "Used"],
      default: "Good",
    },
    companyName: {
      type: String,
      trim: true,
      maxlength: [120, "Company name cannot exceed 120 characters"],
    },
    companyWebsite: {
      type: String,
      trim: true,
      maxlength: [200, "Company website cannot exceed 200 characters"],
    },
    companyEmail: {
      type: String,
      trim: true,
      maxlength: [120, "Company email cannot exceed 120 characters"],
    },
    applyLink: {
      type: String,
      trim: true,
      maxlength: [500, "Apply link cannot exceed 500 characters"],
    },
    companyLogo: {
      type: String,
      trim: true,
    },
    jobType: {
      type: String,
      trim: true,
      maxlength: [50, "Job type cannot exceed 50 characters"],
    },
    experience: {
      type: String,
      trim: true,
      maxlength: [80, "Experience cannot exceed 80 characters"],
    },
    education: {
      type: String,
      trim: true,
      maxlength: [150, "Education cannot exceed 150 characters"],
    },
    skills: [{ type: String, trim: true }],
    employmentType: {
      type: String,
      trim: true,
      maxlength: [50, "Employment type cannot exceed 50 characters"],
    },
    workMode: {
      type: String,
      trim: true,
      maxlength: [50, "Work mode cannot exceed 50 characters"],
    },
    workSchedule: {
      type: String,
      trim: true,
      maxlength: [100, "Work schedule cannot exceed 100 characters"],
    },
    shiftTiming: {
      type: String,
      trim: true,
      maxlength: [100, "Shift timing cannot exceed 100 characters"],
    },
    salary: {
      min: { type: Number, min: 0, default: 0 },
      max: { type: Number, min: 0, default: 0 },
      type: {
        type: String,
        enum: ["hourly", "daily", "weekly", "monthly", "yearly"],
        default: "monthly",
      },
    },
    salaryType: {
      type: String,
      enum: ["hourly", "daily", "weekly", "monthly", "yearly"],
      default: "monthly",
    },
    benefits: [{ type: String, trim: true }],
    industry: {
      type: String,
      trim: true,
      maxlength: [100, "Industry cannot exceed 100 characters"],
    },
    department: {
      type: String,
      trim: true,
      maxlength: [100, "Department cannot exceed 100 characters"],
    },
    noticePeriod: {
      type: String,
      trim: true,
      maxlength: [50, "Notice period cannot exceed 50 characters"],
    },
    responsibilities: {
      type: String,
      trim: true,
      maxlength: [5000, "Responsibilities cannot exceed 5000 characters"],
    },
    requirements: {
      type: String,
      trim: true,
      maxlength: [5000, "Requirements cannot exceed 5000 characters"],
    },
    functionalArea: {
      type: String,
      trim: true,
      maxlength: [120, "Functional area cannot exceed 120 characters"],
    },
    techStack: {
      type: String,
      trim: true,
      maxlength: [500, "Tech stack cannot exceed 500 characters"],
    },
    tools: {
      type: String,
      trim: true,
      maxlength: [500, "Tools cannot exceed 500 characters"],
    },
    certificationsRequired: {
      type: String,
      trim: true,
      maxlength: [500, "Certifications cannot exceed 500 characters"],
    },
    languageRequirement: {
      type: String,
      trim: true,
      maxlength: [200, "Language requirement cannot exceed 200 characters"],
    },
    contractDuration: {
      type: String,
      trim: true,
      maxlength: [100, "Contract duration cannot exceed 100 characters"],
    },
    workHoursPerWeek: {
      type: String,
      trim: true,
      maxlength: [50, "Work hours cannot exceed 50 characters"],
    },
    joiningDate: {
      type: Date,
    },
    applicationDeadline: {
      type: Date,
    },
    contactPerson: {
      type: String,
      trim: true,
      maxlength: [120, "Contact person cannot exceed 120 characters"],
    },
    contactEmail: {
      type: String,
      trim: true,
      maxlength: [120, "Contact email cannot exceed 120 characters"],
    },
    positions: {
      type: Number,
      min: [1, "Positions must be at least 1"],
      default: 1,
    },
    aboutCompany: {
      type: String,
      trim: true,
      maxlength: [2000, "About company cannot exceed 2000 characters"],
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
    phoneCode: { type: String, trim: true, default: '+91' },
    currency: { type: String, trim: true, default: '₹' },
    countryCode: { type: String, trim: true, index: true },
    contactPhone: { type: String, trim: true },
    employerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
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
    appliedBy: [
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
        if (ret.companyLogo) {
          ret.companyLogo = s3Service.toProxyUrl(ret.companyLogo);
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

jobSchema.virtual("postedTime").get(function () {
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

jobSchema.index({ status: 1, createdAt: -1 });
jobSchema.index({ category: 1, subcategory: 1, status: 1 });
jobSchema.index({ seller: 1, status: 1 });
jobSchema.index({ price: 1 });
jobSchema.index({ savedBy: 1 });
jobSchema.index({ title: "text", description: "text", companyName: "text", skills: "text" });
jobSchema.index({ coordinates: "2dsphere" });

attachListingVideosField(jobSchema);
attachSlugPlugin(jobSchema);

module.exports = mongoose.model("Job", jobSchema);

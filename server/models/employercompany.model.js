const mongoose = require("mongoose");
const s3Service = require("../services/s3.service.js");

const employerCompanySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    companyName: {
      type: String,
      trim: true,
      maxlength: [120, "Company name cannot exceed 120 characters"],
    },
    companyLogo: {
      type: String,
      trim: true,
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
    aboutCompany: {
      type: String,
      trim: true,
      maxlength: [2000, "About company cannot exceed 2000 characters"],
    },
    industry: {
      type: String,
      trim: true,
      maxlength: [100, "Industry cannot exceed 100 characters"],
    },
    location: {
      type: String,
      trim: true,
      maxlength: [200, "Location cannot exceed 200 characters"],
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

employerCompanySchema.set("toJSON", {
  transform(_doc, ret) {
    if (ret.companyLogo) {
      ret.companyLogo = s3Service.toProxyUrl(ret.companyLogo);
    }
    return ret;
  },
});

module.exports = mongoose.model("EmployerCompany", employerCompanySchema);

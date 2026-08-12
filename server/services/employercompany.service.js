const EmployerCompany = require("../models/employercompany.model.js");
const Job = require("../models/job.model.js");
const S3Service = require("../services/s3.service.js");

function pickCompanyFields(source = {}) {
  const fields = {};
  const keys = [
    "companyName",
    "companyLogo",
    "companyWebsite",
    "companyEmail",
    "aboutCompany",
    "industry",
    "location",
  ];

  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) {
      fields[key] = value.trim();
    }
  }

  return fields;
}

function mergeCompanyFields(requestFields = {}, profile = null) {
  const profileObj = profile ? pickCompanyFields(profile) : {};
  const requestObj = pickCompanyFields(requestFields);
  return {
    companyName: requestObj.companyName || profileObj.companyName,
    companyLogo: requestObj.companyLogo || profileObj.companyLogo,
    companyWebsite: requestObj.companyWebsite || profileObj.companyWebsite,
    companyEmail: requestObj.companyEmail || profileObj.companyEmail,
    aboutCompany: requestObj.aboutCompany || profileObj.aboutCompany,
    industry: requestObj.industry || profileObj.industry,
    location: requestObj.location || profileObj.location,
  };
}

async function getProfileByUserId(userId) {
  return EmployerCompany.findOne({ userId }).lean();
}

async function upsertProfile(userId, fields = {}) {
  const payload = pickCompanyFields(fields);
  if (Object.keys(payload).length === 0) {
    return getProfileByUserId(userId);
  }

  return EmployerCompany.findOneAndUpdate(
    { userId },
    { $set: { userId, ...payload } },
    { upsert: true, new: true, runValidators: true },
  ).lean();
}

async function syncActiveJobs(userId, fields = {}) {
  const update = pickCompanyFields(fields);
  if (Object.keys(update).length === 0) return;

  await Job.updateMany({ seller: userId, status: "active" }, { $set: update });
}

function attachCompanyMeta(listing, profile) {
  if (!listing) return listing;

  listing.company = {
    id: profile?._id ? String(profile._id) : null,
    name: listing.companyName || profile?.companyName || null,
    logo: listing.companyLogo || profile?.companyLogo || null,
    website: listing.companyWebsite || profile?.companyWebsite || null,
    email: listing.companyEmail || profile?.companyEmail || null,
    industry: listing.industry || profile?.industry || null,
    location: profile?.location || null,
    isVerified: Boolean(profile?.isVerified),
  };

  if (listing.company.logo) {
    listing.company.logo = S3Service.toProxyUrl(listing.company.logo);
  }

  return listing;
}

module.exports = {
  pickCompanyFields,
  mergeCompanyFields,
  getProfileByUserId,
  upsertProfile,
  syncActiveJobs,
  attachCompanyMeta,
};

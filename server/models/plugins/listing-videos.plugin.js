const mongoose = require('mongoose');

const listingVideoEntrySchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    thumbnailUrl: { type: String },
    duration: { type: Number, min: 0 },
    mimeType: { type: String },
    order: { type: Number, default: 0 },
    size: { type: Number, min: 0 },
  },
  { _id: false },
);

function attachListingVideosField(schema) {
  schema.add({
    videos: {
      type: [listingVideoEntrySchema],
      default: [],
    },
  });
}

module.exports = {
  attachListingVideosField,
  listingVideoEntrySchema,
};

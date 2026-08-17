const mongoose = require("mongoose");

const eventTicketTypeSchema = new mongoose.Schema(
  {
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    description: { type: String, trim: true, maxlength: 500 },
    /** Price in smallest currency unit (paise for INR) */
    pricePaise: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: { type: String, default: "INR", trim: true },
    totalQuantity: {
      type: Number,
      required: true,
      min: 0,
    },
    soldQuantity: { type: Number, default: 0, min: 0 },
    heldQuantity: { type: Number, default: 0, min: 0 },
    maxPerOrder: { type: Number, default: 10, min: 1 },
    saleStart: { type: Date },
    saleEnd: { type: Date },
    cancellationAllowed: { type: Boolean, default: true },
    /** Hours before event start when cancellation is no longer allowed */
    cancellationCutoffHours: { type: Number, default: 24, min: 0 },
    refundPercentage: { type: Number, default: 90, min: 0, max: 100 },
    status: {
      type: String,
      enum: ["active", "inactive", "sold_out"],
      default: "active",
      index: true,
    },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

eventTicketTypeSchema.virtual("availableQuantity").get(function () {
  return Math.max(0, this.totalQuantity - this.soldQuantity - this.heldQuantity);
});

eventTicketTypeSchema.index({ eventId: 1, status: 1, sortOrder: 1 });

module.exports = mongoose.model("EventTicketType", eventTicketTypeSchema);

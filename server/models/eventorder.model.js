const mongoose = require("mongoose");

const ORDER_STATUSES = [
  "PENDING",
  "PAYMENT_PROCESSING",
  "PAID",
  "CONFIRMED",
  "FAILED",
  "CANCELLED",
  "REFUND_PENDING",
  "REFUNDED",
  "EXPIRED",
];

const eventOrderSchema = new mongoose.Schema(
  {
    bookingId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true,
      index: true,
    },
    ticketTypeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EventTicketType",
      required: true,
    },
    holdId: { type: String, index: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPricePaise: { type: Number, required: true, min: 0 },
    subtotalPaise: { type: Number, required: true, min: 0 },
    feesPaise: { type: Number, default: 0, min: 0 },
    taxPaise: { type: Number, default: 0, min: 0 },
    totalAmountPaise: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "INR" },
    status: {
      type: String,
      enum: ORDER_STATUSES,
      default: "PENDING",
      index: true,
    },
    razorpayOrderId: { type: String, index: true, sparse: true },
    razorpayPaymentId: { type: String, index: true, sparse: true },
    razorpaySignature: { type: String },
    paymentProvider: {
      type: String,
      enum: ["payu", "razorpay", "free"],
      sparse: true,
    },
    paymentVerifiedAt: { type: Date },
    idempotencyKey: { type: String, unique: true, sparse: true },
    webhookProcessedAt: { type: Date },
    failureReason: { type: String },
    /** Snapshot for display */
    eventSnapshot: {
      title: String,
      venue: String,
      location: String,
      eventDate: String,
      eventTime: String,
      image: String,
      subcategory: String,
    },
    ticketTypeName: { type: String },
  },
  { timestamps: true },
);

eventOrderSchema.index({ userId: 1, status: 1, createdAt: -1 });
eventOrderSchema.index({ eventId: 1, status: 1 });

module.exports = mongoose.model("EventOrder", eventOrderSchema);
module.exports.ORDER_STATUSES = ORDER_STATUSES;

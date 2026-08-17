const mongoose = require("mongoose");
const crypto = require("crypto");

const TICKET_STATUSES = [
  "ACTIVE",
  "CHECKED_IN",
  "CANCELLED",
  "REFUNDED",
  "EXPIRED",
];

const eventTicketSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EventOrder",
      required: true,
      index: true,
    },
    bookingId: { type: String, required: true, index: true },
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
    ticketTypeName: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    /** Non-guessable token encoded in QR — LISTIFYS:TICKET:<token> */
    secureToken: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    status: {
      type: String,
      enum: TICKET_STATUSES,
      default: "ACTIVE",
      index: true,
    },
    checkedInAt: { type: Date },
    checkedInBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    cancelledAt: { type: Date },
    refundStatus: {
      type: String,
      enum: ["NONE", "PENDING", "COMPLETED", "FAILED"],
      default: "NONE",
    },
  },
  { timestamps: true },
);

eventTicketSchema.statics.generateSecureToken = function generateSecureToken() {
  return crypto.randomBytes(24).toString("hex");
};

eventTicketSchema.index({ userId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model("EventTicket", eventTicketSchema);
module.exports.TICKET_STATUSES = TICKET_STATUSES;

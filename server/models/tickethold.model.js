const mongoose = require("mongoose");

const ticketHoldSchema = new mongoose.Schema(
  {
    holdId: {
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
      index: true,
    },
    quantity: { type: Number, required: true, min: 1 },
    status: {
      type: String,
      enum: ["ACTIVE", "EXPIRED", "CONVERTED", "CANCELLED"],
      default: "ACTIVE",
      index: true,
    },
    expiresAt: { type: Date, required: true, index: true },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EventOrder",
    },
    idempotencyKey: { type: String, index: true, sparse: true },
  },
  { timestamps: true },
);

ticketHoldSchema.index({ status: 1, expiresAt: 1 });

module.exports = mongoose.model("TicketHold", ticketHoldSchema);

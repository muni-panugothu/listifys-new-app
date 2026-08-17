const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth.middleware.js");
const { createRateLimiter } = require("../middleware/ratelimiter.middleware.js");
const controller = require("../controllers/eventticketing.controller.js");

const bookingLimiter = createRateLimiter({
  keyPrefix: "ticket:book",
  windowSec: 60,
  maxHits: 20,
  message: "Too many booking attempts. Please wait a moment.",
  keyFn: (req) => req.user?._id?.toString() || req.ip,
  failClosed: true,
});

const paymentLimiter = createRateLimiter({
  keyPrefix: "ticket:pay",
  windowSec: 60,
  maxHits: 15,
  message: "Too many payment attempts. Please wait a moment.",
  keyFn: (req) => req.user?._id?.toString() || req.ip,
  failClosed: true,
});

router.get("/payment/config", controller.paymentConfig);
router.get("/checkout/:orderId/page", controller.renderCheckoutPage);
router.post("/payu/return/success", controller.handlePayuReturn);
router.post("/payu/return/failure", controller.handlePayuReturn);
router.get("/payu/return/success", controller.handlePayuReturn);
router.get("/payu/return/failure", controller.handlePayuReturn);

router.get("/events/:eventId/availability", controller.getAvailability);
router.post("/events/:eventId/holds", protect, bookingLimiter, controller.createHold);
router.post("/orders", protect, paymentLimiter, controller.createOrder);
router.post("/payments/verify", protect, paymentLimiter, controller.verifyPayment);
router.post("/payments/verify-in-app", protect, paymentLimiter, controller.verifyInAppPayment);

router.get("/events/:eventId/my-ticket", protect, controller.getMyEventTicket);
router.get("/my-tickets", protect, controller.getMyTickets);
router.get("/tickets/:ticketId", protect, controller.getTicket);
router.post("/tickets/:ticketId/cancel", protect, controller.cancelTicket);

router.post("/scan/validate", protect, controller.validateScan);
router.post("/scan/check-in", protect, controller.checkIn);

module.exports = router;

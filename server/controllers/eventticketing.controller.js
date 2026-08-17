const ticketing = require("../services/eventticketing.service");
const { getPaymentConfigForClient } = require("../services/payment-gateway.service");
const { verifyWebhookSignature } = require("../services/razorpay.service");
const { logger } = require("../utils/logger");

function handleError(res, err) {
  const status = err.statusCode || 500;
  return res.status(status).json({
    success: false,
    message: err.message || "Something went wrong",
    code: err.code,
    available: err.available,
  });
}

/** Same host that created the checkout token (must match JWT signing server). */
function resolveRequestApiBase(req) {
  const forwardedProto = req.headers["x-forwarded-proto"];
  const forwardedHost = req.headers["x-forwarded-host"];
  const proto = forwardedProto ? String(forwardedProto).split(",")[0].trim() : req.protocol;
  const host = forwardedHost ? String(forwardedHost).split(",")[0].trim() : req.get("host");
  if (host) {
    return `${proto}://${host}`.replace(/\/$/, "");
  }
  return null;
}

exports.getAvailability = async (req, res) => {
  try {
    const data = await ticketing.getAvailability(req.params.eventId);
    return res.json({ success: true, data });
  } catch (err) {
    return handleError(res, err);
  }
};

exports.createHold = async (req, res) => {
  try {
    const { ticketTypeId, quantity, idempotencyKey } = req.body;
    const data = await ticketing.createHold({
      userId: req.user._id,
      eventId: req.params.eventId,
      ticketTypeId,
      quantity,
      idempotencyKey,
    });
    return res.status(201).json({ success: true, data });
  } catch (err) {
    return handleError(res, err);
  }
};

exports.createOrder = async (req, res) => {
  try {
    const { holdId, idempotencyKey } = req.body;
    const data = await ticketing.createCheckoutOrder({
      userId: req.user._id,
      holdId,
      idempotencyKey,
      apiBase: resolveRequestApiBase(req),
    });
    return res.status(201).json({ success: true, data });
  } catch (err) {
    return handleError(res, err);
  }
};

exports.verifyPayment = async (req, res) => {
  try {
    const {
      orderId,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    } = req.body;

    const data = await ticketing.verifyAndConfirmPayment({
      userId: req.user._id,
      orderId,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    });

    return res.json({ success: true, data });
  } catch (err) {
    return handleError(res, err);
  }
};

exports.verifyInAppPayment = async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) {
      return res.status(400).json({ success: false, message: "orderId is required" });
    }

    const data = await ticketing.verifyInAppPayuPayment({
      userId: req.user._id,
      orderId,
    });

    return res.json({ success: true, data });
  } catch (err) {
    return handleError(res, err);
  }
};

exports.getMyTickets = async (req, res) => {
  try {
    const tab = req.query.tab || "upcoming";
    const tickets = await ticketing.listUserTickets(req.user._id, { tab });
    return res.json({ success: true, tickets });
  } catch (err) {
    return handleError(res, err);
  }
};

exports.getTicket = async (req, res) => {
  try {
    const data = await ticketing.getTicketForUser(req.params.ticketId, req.user._id);
    return res.json({ success: true, data });
  } catch (err) {
    return handleError(res, err);
  }
};

exports.cancelTicket = async (req, res) => {
  try {
    const data = await ticketing.cancelTicket({
      ticketId: req.params.ticketId,
      userId: req.user._id,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return handleError(res, err);
  }
};

exports.validateScan = async (req, res) => {
  try {
    const { token, eventId } = req.body;
    const data = await ticketing.validateTicketScan({
      token,
      scannerUserId: req.user._id,
      eventId,
    });
    return res.json({ success: true, ...data });
  } catch (err) {
    return handleError(res, err);
  }
};

exports.checkIn = async (req, res) => {
  try {
    const { token, eventId } = req.body;
    const data = await ticketing.checkInTicket({
      token,
      scannerUserId: req.user._id,
      eventId,
    });
    return res.json({ success: true, ...data });
  } catch (err) {
    return handleError(res, err);
  }
};

exports.paymentConfig = async (_req, res) => {
  const config = getPaymentConfigForClient();
  return res.json({
    success: true,
    configured: config.configured,
    provider: config.provider,
    keyId: config.keyId,
  });
};

exports.renderCheckoutPage = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { token } = req.query;
    if (!token || typeof token !== "string") {
      return res.status(401).send("Missing checkout token");
    }
    const html = await ticketing.getCheckoutPage(orderId, token);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    return res.send(html);
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).send(err.message || "Checkout unavailable");
  }
};

exports.handlePayuReturn = async (req, res) => {
  try {
    const params = { ...req.query, ...req.body };
    const redirectUrl = await ticketing.handlePayuReturn(params);
    return res.redirect(302, redirectUrl);
  } catch (err) {
    logger.error("[Ticketing] PayU return error", { err: err.message });
    const qs = new URLSearchParams({
      cancelled: "1",
      message: err.message || "Payment return failed",
    }).toString();
    return res.redirect(302, `listifyapp://event-payment?${qs}`);
  }
};

exports.razorpayWebhook = async (req, res) => {
  try {
    const signature = req.headers["x-razorpay-signature"];
    const rawBody = req.rawBody || JSON.stringify(req.body);

    if (!verifyWebhookSignature(rawBody, signature)) {
      logger.securityLog("razorpay_webhook_invalid_signature", {});
      return res.status(400).json({ success: false, message: "Invalid signature" });
    }

    const event = req.body?.event;
    const result = await ticketing.handlePaymentWebhook(event, req.body?.payload);

    return res.json({ success: true, ...result });
  } catch (err) {
    logger.error("[Ticketing] Webhook error", { err: err.message });
    return res.status(500).json({ success: false });
  }
};

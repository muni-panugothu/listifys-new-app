const crypto = require("crypto");
const { logger } = require("../utils/logger");

let razorpayClient = null;

function getRazorpayClient() {
  if (razorpayClient) return razorpayClient;

  const keyId = (process.env.RAZORPAY_KEY_ID || "").trim();
  const keySecret = (process.env.RAZORPAY_KEY_SECRET || "").trim();

  if (!keyId || !keySecret) {
    return null;
  }

  const Razorpay = require("razorpay");
  razorpayClient = new Razorpay({ key_id: keyId, key_secret: keySecret });
  return razorpayClient;
}

function isRazorpayConfigured() {
  return Boolean(
    (process.env.RAZORPAY_KEY_ID || "").trim() &&
      (process.env.RAZORPAY_KEY_SECRET || "").trim(),
  );
}

function getPublicKeyId() {
  return (process.env.RAZORPAY_KEY_ID || "").trim();
}

async function createRazorpayOrder({
  amountPaise,
  currency = "INR",
  receipt,
  notes = {},
}) {
  const client = getRazorpayClient();
  if (!client) {
    const err = new Error(
      "Payment gateway is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.",
    );
    err.code = "PAYMENT_NOT_CONFIGURED";
    throw err;
  }

  const order = await client.orders.create({
    amount: Math.round(amountPaise),
    currency,
    receipt: receipt.slice(0, 40),
    notes,
  });

  return order;
}

function verifyPaymentSignature(orderId, paymentId, signature) {
  const secret = (process.env.RAZORPAY_KEY_SECRET || "").trim();
  if (!secret || !orderId || !paymentId || !signature) return false;

  const body = `${orderId}|${paymentId}`;
  const expected = crypto.createHmac("sha256", secret).update(body).digest("hex");
  return expected === signature;
}

function verifyWebhookSignature(rawBody, signature) {
  const secret = (process.env.RAZORPAY_WEBHOOK_SECRET || "").trim();
  if (!secret || !rawBody || !signature) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  return expected === signature;
}

async function createRefund({ paymentId, amountPaise, notes = {} }) {
  const client = getRazorpayClient();
  if (!client) {
    const err = new Error("Payment gateway is not configured.");
    err.code = "PAYMENT_NOT_CONFIGURED";
    throw err;
  }

  return client.payments.refund(paymentId, {
    amount: Math.round(amountPaise),
    notes,
  });
}

module.exports = {
  getRazorpayClient,
  isRazorpayConfigured,
  getPublicKeyId,
  createRazorpayOrder,
  verifyPaymentSignature,
  verifyWebhookSignature,
  createRefund,
};

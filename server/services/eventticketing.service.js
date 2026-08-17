const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const Event = require("../models/event.model");
const EventTicketType = require("../models/eventtickettype.model");
const TicketHold = require("../models/tickethold.model");
const EventOrder = require("../models/eventorder.model");
const EventTicket = require("../models/eventticket.model");
const User = require("../models/user.model");
const redis = require("../config/redis");
const { logger } = require("../utils/logger");
const {
  getActivePaymentProvider,
  isPaymentConfigured,
  payu: payuService,
  razorpay: razorpayService,
} = require("./payment-gateway.service");
const {
  createRazorpayOrder,
  verifyPaymentSignature,
  isRazorpayConfigured,
} = razorpayService;
const { createRefund } = require("./razorpay.service");
const s3Service = require("./s3.service");

const CHECKOUT_APP_SCHEME = "listifyapp://event-payment";
const HOLD_TTL_MS = 10 * 60 * 1000; // 10 minutes
const PLATFORM_FEE_PAISE = 0; // configurable later
const TAX_RATE = 0; // GST can be added per event later

function startPrimarySession() {
  return mongoose.startSession({
    defaultTransactionOptions: { readPreference: "primary" },
  });
}

function generateBookingId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[crypto.randomInt(0, chars.length)];
  }
  return `LST-${code}`;
}

function getJwtSecret() {
  return process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET;
}

function createCheckoutToken(orderId, userId) {
  return jwt.sign(
    {
      orderId: String(orderId),
      userId: String(userId),
      purpose: "ticket-checkout",
    },
    getJwtSecret(),
    { expiresIn: "15m" },
  );
}

function verifyCheckoutToken(token, orderId) {
  const decoded = jwt.verify(token, getJwtSecret());
  if (decoded.purpose !== "ticket-checkout") {
    const err = new Error("Invalid checkout token");
    err.statusCode = 401;
    throw err;
  }
  if (String(decoded.orderId) !== String(orderId)) {
    const err = new Error("Checkout token mismatch");
    err.statusCode = 401;
    throw err;
  }
  return decoded;
}

function generateHoldId() {
  return `hold_${crypto.randomBytes(12).toString("hex")}`;
}

function rupeesToPaise(rupees) {
  return Math.round(Number(rupees || 0) * 100);
}

function paiseToRupees(paise) {
  return Number(paise || 0) / 100;
}

/**
 * Ensure at least one ticket type exists for an event (migrate from legacy event.price).
 */
async function ensureDefaultTicketTypes(event) {
  const existing = await EventTicketType.find({
    eventId: event._id,
    status: { $ne: "inactive" },
  }).sort({ sortOrder: 1 });

  if (existing.length > 0) return existing;

  const total =
    event.ticketsAvailable > 0 ? event.ticketsAvailable : 2000;
  const pricePaise =
    event.price != null && event.price > 0
      ? rupeesToPaise(event.price)
      : 0;

  const created = await EventTicketType.create({
    eventId: event._id,
    name: pricePaise > 0 ? "General Admission" : "Free Entry",
    pricePaise,
    currency: "INR",
    totalQuantity: total,
    soldQuantity: 0,
    heldQuantity: 0,
    maxPerOrder: 10,
    cancellationAllowed: true,
    cancellationCutoffHours: 24,
    refundPercentage: 90,
    status: "active",
    sortOrder: 0,
  });

  return [created];
}

async function getEventForBooking(eventId) {
  const event = await Event.findById(eventId).populate(
    "seller",
    "name email profileImage",
  );
  if (!event) {
    const err = new Error("Event not found");
    err.statusCode = 404;
    throw err;
  }
  if (event.status !== "active") {
    const err = new Error("This event is not available for booking");
    err.statusCode = 400;
    throw err;
  }
  return event;
}

function pickEventCoverUrl(event) {
  const images = event?.images || [];
  for (const raw of images) {
    if (raw) {
      const proxied = s3Service.toProxyUrl(String(raw));
      if (proxied) return proxied;
    }
  }

  const videos = event?.videos || [];
  for (const entry of videos) {
    if (!entry) continue;
    if (typeof entry === "object") {
      const thumb = entry.thumbnailUrl || entry.posterUrl || entry.url;
      if (thumb) {
        const proxied = s3Service.toProxyUrl(String(thumb));
        if (proxied) return proxied;
      }
    } else if (typeof entry === "string" && entry.trim()) {
      const proxied = s3Service.toProxyUrl(entry.trim());
      if (proxied) return proxied;
    }
  }

  return "";
}

function buildEventSnapshot(event) {
  return {
    title: event.title,
    venue: event.venue || "",
    location: event.location || "",
    eventDate: event.eventDate || "",
    eventTime: event.eventTime || "",
    image: pickEventCoverUrl(event),
    subcategory: event.subcategory || "",
  };
}

async function resolveTicketEventSnapshot(order) {
  if (!order) return null;

  let snapshot = order.eventSnapshot ? { ...order.eventSnapshot } : null;
  if (order.eventId) {
    const live = await Event.findById(order.eventId)
      .select("title venue location eventDate eventTime images videos subcategory")
      .lean();
    if (live) {
      const fresh = buildEventSnapshot(live);
      snapshot = { ...(snapshot || {}), ...fresh, image: fresh.image || snapshot?.image || "" };
    }
  }

  if (snapshot?.image) {
    snapshot.image = s3Service.toProxyUrl(snapshot.image) || snapshot.image;
  }

  return snapshot;
}

function calculateOrderAmounts(ticketType, quantity) {
  const unitPricePaise = ticketType.pricePaise;
  const subtotalPaise = unitPricePaise * quantity;
  const feesPaise = PLATFORM_FEE_PAISE;
  const taxPaise = Math.round((subtotalPaise + feesPaise) * TAX_RATE);
  const totalAmountPaise = subtotalPaise + feesPaise + taxPaise;
  return { unitPricePaise, subtotalPaise, feesPaise, taxPaise, totalAmountPaise };
}

/**
 * Atomically reserve inventory on ticket type.
 */
async function atomicHoldInventory(ticketTypeId, quantity, session) {
  const updated = await EventTicketType.findOneAndUpdate(
    {
      _id: ticketTypeId,
      status: "active",
      $expr: {
        $gte: [
          {
            $subtract: [
              "$totalQuantity",
              { $add: ["$soldQuantity", "$heldQuantity"] },
            ],
          },
          quantity,
        ],
      },
    },
    { $inc: { heldQuantity: quantity } },
    { new: true, session },
  );

  return updated;
}

async function releaseHoldInventory(ticketTypeId, quantity, session) {
  await EventTicketType.findByIdAndUpdate(
    ticketTypeId,
    { $inc: { heldQuantity: -quantity } },
    { session },
  );
}

async function convertHoldToSold(ticketTypeId, quantity, session) {
  await EventTicketType.findByIdAndUpdate(
    ticketTypeId,
    {
      $inc: {
        heldQuantity: -quantity,
        soldQuantity: quantity,
      },
    },
    { session },
  );
}

async function releaseSoldInventory(ticketTypeId, quantity, session) {
  await EventTicketType.findByIdAndUpdate(
    ticketTypeId,
    { $inc: { soldQuantity: -quantity } },
    { session },
  );
}

async function getAvailability(eventId) {
  const event = await getEventForBooking(eventId);
  const types = await ensureDefaultTicketTypes(event);

  return {
    event: {
      id: event._id,
      title: event.title,
      status: event.status,
      venue: event.venue,
      location: event.location,
      eventDate: event.eventDate,
      eventTime: event.eventTime,
      image: event.images?.[0] || null,
    },
    ticketTypes: types.map((t) => ({
      id: t._id,
      name: t.name,
      description: t.description,
      pricePaise: t.pricePaise,
      price: paiseToRupees(t.pricePaise),
      currency: t.currency,
      available: Math.max(
        0,
        t.totalQuantity - t.soldQuantity - t.heldQuantity,
      ),
      totalQuantity: t.totalQuantity,
      maxPerOrder: t.maxPerOrder,
      cancellationAllowed: t.cancellationAllowed,
      cancellationCutoffHours: t.cancellationCutoffHours,
      refundPercentage: t.refundPercentage,
      status: t.status,
    })),
  };
}

async function createHold({ userId, eventId, ticketTypeId, quantity, idempotencyKey }) {
  if (!Number.isInteger(quantity) || quantity < 1) {
    const err = new Error("Invalid quantity");
    err.statusCode = 400;
    throw err;
  }

  const event = await getEventForBooking(eventId);
  await ensureDefaultTicketTypes(event);

  const ticketType = await EventTicketType.findOne({
    _id: ticketTypeId,
    eventId: event._id,
    status: "active",
  });

  if (!ticketType) {
    const err = new Error("Ticket type not found");
    err.statusCode = 404;
    throw err;
  }

  if (quantity > ticketType.maxPerOrder) {
    const err = new Error(
      `Maximum ${ticketType.maxPerOrder} tickets allowed per order`,
    );
    err.statusCode = 400;
    throw err;
  }

  const existingTicket = await EventTicket.findOne({
    userId,
    eventId: event._id,
    status: { $in: ["ACTIVE", "CHECKED_IN"] },
  }).sort({ createdAt: -1 });

  if (existingTicket) {
    const existingOrder = await EventOrder.findById(existingTicket.orderId);
    if (existingOrder?.status === "CONFIRMED") {
      const err = new Error("You already have a confirmed ticket for this event");
      err.statusCode = 409;
      err.code = "ALREADY_BOOKED";
      err.ticketId = String(existingTicket._id);
      throw err;
    }
  }

  const session = await startPrimarySession();
  session.startTransaction();

  try {
    const reserved = await atomicHoldInventory(ticketType._id, quantity, session);

    if (!reserved) {
      const fresh = await EventTicketType.findById(ticketType._id).session(session);
      const available = fresh
        ? Math.max(0, fresh.totalQuantity - fresh.soldQuantity - fresh.heldQuantity)
        : 0;
      const err = new Error(
        available > 0
          ? `Only ${available} ticket${available === 1 ? "" : "s"} are currently available.`
          : "This ticket type is sold out.",
      );
      err.statusCode = 409;
      err.available = available;
      throw err;
    }

    const holdId = generateHoldId();
    const expiresAt = new Date(Date.now() + HOLD_TTL_MS);

    const hold = await TicketHold.create(
      [
        {
          holdId,
          userId,
          eventId: event._id,
          ticketTypeId: ticketType._id,
          quantity,
          status: "ACTIVE",
          expiresAt,
          idempotencyKey,
        },
      ],
      { session },
    );

    await session.commitTransaction();

    const amounts = calculateOrderAmounts(ticketType, quantity);

    return {
      holdId,
      expiresAt: expiresAt.toISOString(),
      expiresInSeconds: Math.floor(HOLD_TTL_MS / 1000),
      quantity,
      ticketType: {
        id: ticketType._id,
        name: ticketType.name,
        pricePaise: ticketType.pricePaise,
        price: paiseToRupees(ticketType.pricePaise),
      },
      amounts: {
        ...amounts,
        totalAmount: paiseToRupees(amounts.totalAmountPaise),
        subtotal: paiseToRupees(amounts.subtotalPaise),
      },
      cancellationPolicy: {
        allowed: ticketType.cancellationAllowed,
        cutoffHours: ticketType.cancellationCutoffHours,
        refundPercentage: ticketType.refundPercentage,
      },
      hold: hold[0],
    };
  } catch (e) {
    await session.abortTransaction();
    throw e;
  } finally {
    session.endSession();
  }
}

async function expireHold(holdDoc, session) {
  if (!holdDoc || holdDoc.status !== "ACTIVE") return false;

  holdDoc.status = "EXPIRED";
  await holdDoc.save({ session });
  await releaseHoldInventory(holdDoc.ticketTypeId, holdDoc.quantity, session);
  return true;
}

async function expireStaleHolds() {
  const now = new Date();
  const stale = await TicketHold.find({
    status: "ACTIVE",
    expiresAt: { $lte: now },
  }).limit(100);

  let count = 0;
  for (const hold of stale) {
    const session = await startPrimarySession();
    session.startTransaction();
    try {
      const fresh = await TicketHold.findById(hold._id).session(session);
      if (fresh && fresh.status === "ACTIVE") {
        await expireHold(fresh, session);
        count++;
      }
      await session.commitTransaction();
    } catch (e) {
      await session.abortTransaction();
      logger.error("[Ticketing] Hold expiry failed", { holdId: hold.holdId, err: e.message });
    } finally {
      session.endSession();
    }
  }
  return count;
}

async function getActiveHold(holdId, userId) {
  await expireStaleHolds();

  const hold = await TicketHold.findOne({ holdId, userId });
  if (!hold) {
    const err = new Error("Ticket hold not found");
    err.statusCode = 404;
    throw err;
  }
  if (hold.status !== "ACTIVE") {
    const err = new Error("Ticket hold is no longer active");
    err.statusCode = 410;
    throw err;
  }
  if (hold.expiresAt <= new Date()) {
    const session = await startPrimarySession();
    session.startTransaction();
    try {
      await expireHold(hold, session);
      await session.commitTransaction();
    } catch {
      await session.abortTransaction();
    } finally {
      session.endSession();
    }
    const err = new Error("Ticket hold has expired. Please select tickets again.");
    err.statusCode = 410;
    throw err;
  }
  return hold;
}

async function buildPayuPaymentExtras(order, userId, apiBase) {
  const user = await User.findById(userId).select("name email phone").lean();
  const productinfo = `${order.ticketTypeName} x ${order.quantity}`.slice(0, 100);
  const checkoutToken = createCheckoutToken(order._id, userId);
  const callbackBase = (apiBase || payuService.getCallbackBaseUrl()).replace(/\/$/, "");
  const paymentSession = payuService.buildPaymentSession({
    orderId: order._id,
    txnid: order.bookingId,
    amountPaise: order.totalAmountPaise,
    productinfo,
    firstname: (user?.name || "Listifys User").slice(0, 60),
    email: (user?.email || "guest@listifys.app").slice(0, 60),
    phone:
      (user?.phone || "9999999999").replace(/\D/g, "").slice(-10) || "9999999999",
    callbackBase,
  });

  const launchBase = (apiBase || payuService.getCallbackBaseUrl()).replace(/\/$/, "");
  const launchUrl = `${launchBase}/api/event-tickets/checkout/${order._id}/page?token=${encodeURIComponent(checkoutToken)}`;

  return {
    paymentProvider: "payu",
    razorpayKeyId: payuService.getMerchantKey(),
    razorpayOrderId: order.bookingId,
    amountPaise: order.totalAmountPaise,
    checkoutToken,
    paymentSession,
    launchUrl,
  };
}

async function createCheckoutOrder({ userId, holdId, idempotencyKey, apiBase }) {
  if (idempotencyKey) {
    const existing = await EventOrder.findOne({ idempotencyKey });
    if (existing) {
      const pending =
        existing.totalAmountPaise > 0 && existing.status === "PAYMENT_PROCESSING";
      if (pending && (existing.paymentProvider || getActivePaymentProvider()) === "payu") {
        return formatOrderResponse(existing, await buildPayuPaymentExtras(existing, userId, apiBase));
      }
      return formatOrderResponse(existing, pending
        ? {
            paymentProvider: existing.paymentProvider || getActivePaymentProvider(),
            razorpayKeyId:
              existing.paymentProvider === "payu"
                ? payuService.getMerchantKey()
                : process.env.RAZORPAY_KEY_ID?.trim(),
            razorpayOrderId: existing.razorpayOrderId || existing.bookingId,
            amountPaise: existing.totalAmountPaise,
            checkoutToken: createCheckoutToken(existing._id, userId),
          }
        : {});
    }
  }

  const hold = await getActiveHold(holdId, userId);
  const event = await getEventForBooking(hold.eventId);
  const ticketType = await EventTicketType.findById(hold.ticketTypeId);
  if (!ticketType) {
    const err = new Error("Ticket type not found");
    err.statusCode = 404;
    throw err;
  }

  const amounts = calculateOrderAmounts(ticketType, hold.quantity);
  const bookingId = generateBookingId();

  const paymentProvider = getActivePaymentProvider();
  let razorpayOrder = null;
  let paymentTxnId = null;

  if (amounts.totalAmountPaise > 0) {
    if (!paymentProvider) {
      const err = new Error("Payment gateway is not configured on the server.");
      err.statusCode = 503;
      throw err;
    }

    if (paymentProvider === "payu") {
      paymentTxnId = bookingId;
    } else {
      razorpayOrder = await createRazorpayOrder({
        amountPaise: amounts.totalAmountPaise,
        currency: ticketType.currency || "INR",
        receipt: bookingId,
        notes: {
          eventId: String(event._id),
          holdId,
          userId: String(userId),
        },
      });
      paymentTxnId = razorpayOrder.id;
    }
  }

  const order = await EventOrder.create({
    bookingId,
    userId,
    eventId: event._id,
    ticketTypeId: ticketType._id,
    holdId: hold.holdId,
    quantity: hold.quantity,
    ...amounts,
    currency: ticketType.currency || "INR",
    status: amounts.totalAmountPaise > 0 ? "PAYMENT_PROCESSING" : "PAID",
    paymentProvider: amounts.totalAmountPaise > 0 ? paymentProvider : "free",
    razorpayOrderId: paymentTxnId,
    idempotencyKey,
    eventSnapshot: buildEventSnapshot(event),
    ticketTypeName: ticketType.name,
  });

  if (amounts.totalAmountPaise === 0) {
    return confirmOrderPayment({
      orderId: order._id,
      userId,
      razorpayPaymentId: "free",
      razorpayOrderId: razorpayOrder?.id || "free",
      razorpaySignature: "free",
      isFree: true,
    });
  }

  if (paymentProvider === "payu") {
    return formatOrderResponse(order, await buildPayuPaymentExtras(order, userId, apiBase));
  }

  return formatOrderResponse(order, {
    paymentProvider: order.paymentProvider,
    razorpayKeyId: process.env.RAZORPAY_KEY_ID?.trim(),
    razorpayOrderId: paymentTxnId,
    amountPaise: amounts.totalAmountPaise,
    checkoutToken: createCheckoutToken(order._id, userId),
  });
}

async function confirmOrderPayment({
  orderId,
  userId,
  razorpayPaymentId,
  razorpayOrderId,
  razorpaySignature,
  isFree = false,
  webhook = false,
  payuServerVerify = false,
  trustedPayuReturn = false,
}) {
  const idempotencyRedisKey = `ticket:payment:done:${razorpayPaymentId || orderId}`;
  const alreadyDone = await redis.get(idempotencyRedisKey);
  if (alreadyDone) {
    const parsed = JSON.parse(alreadyDone);
    const order = await EventOrder.findById(parsed.orderId);
    if (order) {
      const ticket = parsed.ticketId
        ? await EventTicket.findById(parsed.ticketId)
        : null;
      return formatOrderResponse(order, ticket ? { ticketId: ticket._id, ticket } : { ticketId: parsed.ticketId });
    }
  }

  const session = await startPrimarySession();
  session.startTransaction();

  try {
    const order = await EventOrder.findById(orderId).session(session);
    if (!order) {
      const err = new Error("Order not found");
      err.statusCode = 404;
      throw err;
    }

    if (userId && String(order.userId) !== String(userId)) {
      const err = new Error("Unauthorized");
      err.statusCode = 403;
      throw err;
    }

    if (order.status === "CONFIRMED") {
      const ticket = await EventTicket.findOne({ orderId: order._id }).session(session);
      await session.commitTransaction();
      return formatOrderResponse(order, ticket ? { ticketId: ticket._id, ticket } : {});
    }

    if (!["PAYMENT_PROCESSING", "PAID", "PENDING"].includes(order.status)) {
      const err = new Error(`Order cannot be confirmed (status: ${order.status})`);
      err.statusCode = 400;
      throw err;
    }

    if (!isFree && !webhook) {
      const provider = order.paymentProvider || "razorpay";
      let verified = false;

      if (provider === "payu") {
        if (payuServerVerify) {
          let payuVerify = { verified: false };
          const txnRef = razorpayOrderId || order.bookingId;
          for (let attempt = 0; attempt < 5; attempt += 1) {
            payuVerify = await payuService.verifyTransactionWithPayu(txnRef);
            if (payuVerify.verified) break;
            if (attempt < 4) {
              await new Promise((resolve) => setTimeout(resolve, 1200));
            }
          }
          verified = payuVerify.verified;
          if (verified) {
            if (
              typeof payuVerify.amountPaise === "number" &&
              payuVerify.amountPaise !== order.totalAmountPaise
            ) {
              const err = new Error("Payment amount mismatch");
              err.statusCode = 400;
              throw err;
            }
            if (payuVerify.paymentId) {
              razorpayPaymentId = payuVerify.paymentId;
            }
          } else if (payuServerVerify) {
            const payuStatus = String(payuVerify.status || payuVerify.reason || "").toLowerCase();
            const err = new Error(
              payuService.isPayuTestMode()
                ? payuStatus === "failure"
                  ? "PayU test payment failed. Use card 5123456789012346 with OTP 123456."
                  : "PayU test payment is still processing. Wait a few seconds, or retry with OTP 123456."
                : "PayU has not confirmed this payment yet. If money was debited, wait a moment and try again.",
            );
            err.statusCode = 400;
            err.retryable = payuStatus !== "failure";
            throw err;
          }
        } else {
          const user = await User.findById(order.userId).select("name email phone").lean();
          verified = payuService.verifyPaymentForOrder(order, user, {
            txnid: razorpayOrderId || order.razorpayOrderId || order.bookingId,
            mihpayid: razorpayPaymentId,
            hash: razorpaySignature,
          });
        }
      } else {
        verified = verifyPaymentSignature(
          razorpayOrderId || order.razorpayOrderId,
          razorpayPaymentId,
          razorpaySignature,
        );
      }

      if (!verified) {
        const err = new Error(
          provider === "payu" && payuService.isPayuTestMode()
            ? "Payment verification failed. In PayU test mode use Net Banking (payu / payu) or card 5123456789012346 with OTP 123456."
            : "Payment verification failed",
        );
        err.statusCode = 400;
        throw err;
      }

      const expectedTxnId = order.razorpayOrderId || order.bookingId;
      const actualTxnId = razorpayOrderId || order.razorpayOrderId;
      if (expectedTxnId && actualTxnId && expectedTxnId !== actualTxnId) {
        const err = new Error("Payment order mismatch");
        err.statusCode = 400;
        throw err;
      }
    }

    const hold = await TicketHold.findOne({
      holdId: order.holdId,
      status: "ACTIVE",
    }).session(session);

    if (!hold) {
      const err = new Error("Ticket hold expired or invalid");
      err.statusCode = 410;
      throw err;
    }

    await convertHoldToSold(hold.ticketTypeId, hold.quantity, session);

    hold.status = "CONVERTED";
    hold.orderId = order._id;
    await hold.save({ session });

    order.status = "CONFIRMED";
    order.razorpayPaymentId = razorpayPaymentId;
    order.razorpayOrderId = razorpayOrderId || order.razorpayOrderId;
    order.razorpaySignature = razorpaySignature;
    order.paymentVerifiedAt = new Date();
    if (webhook) order.webhookProcessedAt = new Date();
    await order.save({ session });

    const secureToken = EventTicket.generateSecureToken();
    const [ticket] = await EventTicket.create(
      [
        {
          orderId: order._id,
          bookingId: order.bookingId,
          userId: order.userId,
          eventId: order.eventId,
          ticketTypeId: order.ticketTypeId,
          ticketTypeName: order.ticketTypeName,
          quantity: order.quantity,
          secureToken,
          status: "ACTIVE",
        },
      ],
      { session },
    );

    await session.commitTransaction();

    await redis.setex(
      idempotencyRedisKey,
      86400,
      JSON.stringify({ orderId: String(order._id), ticketId: String(ticket._id) }),
    );

    logger.info("[Ticketing] Booking confirmed", {
      bookingId: order.bookingId,
      orderId: order._id,
      userId: order.userId,
    });

    return formatOrderResponse(order, { ticketId: ticket._id, ticket });
  } catch (e) {
    await session.abortTransaction();
    throw e;
  } finally {
    session.endSession();
  }
}

function formatOrderResponse(order, extras = {}) {
  const ticket = extras.ticket;
  return {
    order: {
      id: order._id,
      bookingId: order.bookingId,
      status: order.status,
      quantity: order.quantity,
      ticketTypeName: order.ticketTypeName,
      totalAmountPaise: order.totalAmountPaise,
      totalAmount: paiseToRupees(order.totalAmountPaise),
      currency: order.currency,
      eventSnapshot: order.eventSnapshot,
      razorpayOrderId: order.razorpayOrderId,
      createdAt: order.createdAt,
    },
    ticket: ticket
      ? {
          id: ticket._id,
          secureToken: ticket.secureToken,
          qrPayload: `LISTIFYS:TICKET:${ticket.secureToken}`,
          status: ticket.status,
          quantity: ticket.quantity,
        }
      : extras.ticketId
        ? { id: extras.ticketId }
        : null,
    payment: extras.checkoutToken
      ? {
          provider: extras.paymentProvider || getActivePaymentProvider(),
          razorpayKeyId: extras.razorpayKeyId,
          razorpayOrderId: extras.razorpayOrderId,
          amountPaise: extras.amountPaise,
          checkoutToken: extras.checkoutToken,
          session: extras.paymentSession || null,
          launchUrl: extras.launchUrl || null,
        }
      : null,
  };
}

function buildRazorpayCheckoutPageHtml({ orderId, keyId, razorpayOrderId, amountPaise, currency, description }) {
  const payload = JSON.stringify({
    key: keyId,
    order_id: razorpayOrderId,
    amount: amountPaise,
    currency: currency || "INR",
    name: "Listifys",
    description: description || "Event ticket",
    theme: { color: "#27BB97" },
  });
  const orderIdJson = JSON.stringify(String(orderId));

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://checkout.razorpay.com/v1/checkout.js"><\/script>
  <style>
    body { font-family: -apple-system, sans-serif; background: #f6f7f8; margin: 0; padding: 24px; }
    .wrap { max-width: 420px; margin: 40px auto; text-align: center; color: #333; }
  </style>
</head>
<body>
  <div class="wrap"><p>Opening secure payment…</p></div>
  <script>
    function redirect(params) {
      window.location.href = ${JSON.stringify(CHECKOUT_APP_SCHEME)} + "?" + new URLSearchParams(params).toString();
    }
    try {
      var options = ${payload};
      var orderId = ${orderIdJson};
      options.handler = function (response) {
        redirect({
          orderId: orderId,
          razorpay_payment_id: response.razorpay_payment_id,
          razorpay_order_id: response.razorpay_order_id,
          razorpay_signature: response.razorpay_signature,
        });
      };
      options.modal = {
        ondismiss: function () {
          redirect({ orderId: orderId, cancelled: "1" });
        },
      };
      var rzp = new Razorpay(options);
      rzp.on("payment.failed", function (resp) {
        redirect({
          orderId: orderId,
          cancelled: "1",
          message: (resp.error && resp.error.description) || "Payment failed",
        });
      });
      rzp.open();
    } catch (e) {
      redirect({ orderId: ${orderIdJson}, cancelled: "1", message: e.message || "Unable to start checkout" });
    }
  <\/script>
</body>
</html>`;
}

async function getCheckoutPage(orderId, token) {
  let decoded;
  try {
    decoded = verifyCheckoutToken(token, orderId);
  } catch (err) {
    err.statusCode = err.statusCode || 401;
    throw err;
  }

  const order = await EventOrder.findById(orderId);
  if (!order) {
    const err = new Error("Order not found");
    err.statusCode = 404;
    throw err;
  }

  if (String(order.userId) !== String(decoded.userId)) {
    const err = new Error("Unauthorized");
    err.statusCode = 403;
    throw err;
  }

  if (order.status === "CONFIRMED") {
    const err = new Error("Order already confirmed");
    err.statusCode = 400;
    throw err;
  }

  if (order.totalAmountPaise <= 0) {
    const err = new Error("Payment not required for this order");
    err.statusCode = 400;
    throw err;
  }

  const provider = order.paymentProvider || getActivePaymentProvider();
  if (!provider) {
    const err = new Error("Payment gateway is not configured");
    err.statusCode = 503;
    throw err;
  }

  if (provider === "payu") {
    const user = await User.findById(order.userId).select("name email phone").lean();
    if (!user) {
      const err = new Error("User not found");
      err.statusCode = 404;
      throw err;
    }

    const productinfo = `${order.ticketTypeName} x ${order.quantity}`.slice(0, 100);
    return payuService.buildHostedCheckoutHtml({
      orderId: order._id,
      txnid: order.bookingId,
      amountPaise: order.totalAmountPaise,
      productinfo,
      firstname: (user.name || "Listifys User").slice(0, 60),
      email: (user.email || "guest@listifys.app").slice(0, 60),
      phone: (user.phone || "9999999999").replace(/\D/g, "").slice(-10) || "9999999999",
    });
  }

  if (!order.razorpayOrderId) {
    const err = new Error("Payment not required for this order");
    err.statusCode = 400;
    throw err;
  }

  if (!isRazorpayConfigured()) {
    const err = new Error("Payment gateway is not configured");
    err.statusCode = 503;
    throw err;
  }

  return buildRazorpayCheckoutPageHtml({
    orderId: order._id,
    keyId: process.env.RAZORPAY_KEY_ID.trim(),
    razorpayOrderId: order.razorpayOrderId,
    amountPaise: order.totalAmountPaise,
    currency: order.currency,
    description: `${order.ticketTypeName} × ${order.quantity}`,
  });
}

function buildPayuAppRedirect(params) {
  const qs = new URLSearchParams(params).toString();
  return `${CHECKOUT_APP_SCHEME}?${qs}`;
}

async function handlePayuReturn(params) {
  const status = (params.status || "").toLowerCase();
  const orderId = params.udf1;
  const txnid = params.txnid;

  if (!orderId) {
    return buildPayuAppRedirect({ cancelled: "1", message: "Missing order reference" });
  }

  const order = await EventOrder.findById(orderId);
  if (!order) {
    return buildPayuAppRedirect({ cancelled: "1", message: "Order not found" });
  }

  if (status !== "success") {
    return buildPayuAppRedirect({
      orderId: String(order._id),
      cancelled: "1",
      message: params.error_Message || params.error || "Payment failed",
    });
  }

  if (!payuService.verifyResponseHash(params)) {
    logger.securityLog("payu_return_invalid_hash", { orderId, txnid });
    return buildPayuAppRedirect({
      orderId: String(order._id),
      cancelled: "1",
      message: "Payment verification failed",
    });
  }

  if (txnid && txnid !== order.bookingId && txnid !== order.razorpayOrderId) {
    return buildPayuAppRedirect({
      orderId: String(order._id),
      cancelled: "1",
      message: "Transaction mismatch",
    });
  }

  if (order.status !== "CONFIRMED") {
    try {
      await confirmOrderPayment({
        orderId: String(order._id),
        userId: order.userId,
        razorpayOrderId: txnid || order.bookingId,
        razorpayPaymentId: params.mihpayid || "",
        razorpaySignature: params.hash || "",
        trustedPayuReturn: true,
      });
    } catch (err) {
      logger.error("[Ticketing] PayU return confirm failed", {
        orderId,
        txnid,
        err: err.message,
      });
    }
  }

  return buildPayuAppRedirect({
    orderId: String(order._id),
    razorpay_payment_id: params.mihpayid || "",
    razorpay_order_id: txnid || order.bookingId,
    razorpay_signature: params.hash || "",
  });
}

async function verifyAndConfirmPayment({
  userId,
  orderId,
  razorpayOrderId,
  razorpayPaymentId,
  razorpaySignature,
}) {
  return confirmOrderPayment({
    orderId,
    userId,
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
  });
}

/** In-app PayU checkout: verify with PayU API only — never load callback URL in WebView. */
async function verifyInAppPayuPayment({ userId, orderId }) {
  const order = await EventOrder.findById(orderId);
  if (!order) {
    const err = new Error("Order not found");
    err.statusCode = 404;
    throw err;
  }

  if (userId && String(order.userId) !== String(userId)) {
    const err = new Error("Unauthorized");
    err.statusCode = 403;
    throw err;
  }

  if (order.paymentProvider !== "payu") {
    const err = new Error("In-app verification is only supported for PayU orders");
    err.statusCode = 400;
    throw err;
  }

  if (order.status === "CONFIRMED") {
    const ticket = await EventTicket.findOne({ orderId: order._id });
    return formatOrderResponse(order, ticket ? { ticketId: ticket._id, ticket } : {});
  }

  if (!["PAYMENT_PROCESSING", "PAID", "PENDING"].includes(order.status)) {
    const err = new Error(`Order cannot be confirmed (status: ${order.status})`);
    err.statusCode = 400;
    throw err;
  }

  try {
    return await confirmOrderPayment({
      orderId,
      userId,
      razorpayOrderId: order.bookingId,
      razorpayPaymentId: order.bookingId,
      razorpaySignature: "",
      payuServerVerify: true,
    });
  } catch (err) {
    const refreshed = await EventOrder.findById(orderId);
    if (refreshed?.status === "CONFIRMED") {
      const ticket = await EventTicket.findOne({ orderId: refreshed._id });
      return formatOrderResponse(refreshed, ticket ? { ticketId: ticket._id, ticket } : {});
    }
    throw err;
  }
}

async function getUserEventTicket({ userId, eventId }) {
  const ticket = await EventTicket.findOne({
    userId,
    eventId,
    status: { $in: ["ACTIVE", "CHECKED_IN"] },
  }).sort({ createdAt: -1 });

  if (!ticket) {
    return { booked: false };
  }

  const order = await EventOrder.findById(ticket.orderId);
  if (!order || order.status !== "CONFIRMED") {
    return { booked: false };
  }

  const detail = await getTicketForUser(ticket._id, userId);
  return {
    booked: true,
    ...detail,
    order: detail.order
      ? {
          ...detail.order,
          paymentStatus: "PAID",
        }
      : null,
  };
}

async function getTicketForUser(ticketId, userId) {
  const ticket = await EventTicket.findById(ticketId);
  if (!ticket) {
    const err = new Error("Ticket not found");
    err.statusCode = 404;
    throw err;
  }
  if (String(ticket.userId) !== String(userId)) {
    const err = new Error("Unauthorized");
    err.statusCode = 403;
    throw err;
  }

  const order = await EventOrder.findById(ticket.orderId);
  const ticketType = await EventTicketType.findById(ticket.ticketTypeId);
  const eventSnapshot = await resolveTicketEventSnapshot(order);

  return {
    ticket: {
      id: ticket._id,
      bookingId: ticket.bookingId,
      secureToken: ticket.secureToken,
      qrPayload: `LISTIFYS:TICKET:${ticket.secureToken}`,
      status: ticket.status,
      quantity: ticket.quantity,
      ticketTypeName: ticket.ticketTypeName,
      checkedInAt: ticket.checkedInAt,
      createdAt: ticket.createdAt,
    },
    order: order
      ? {
          id: order._id,
          status: order.status,
          totalAmount: paiseToRupees(order.totalAmountPaise),
          currency: order.currency,
        }
      : null,
    event: eventSnapshot,
    cancellationPolicy: ticketType
      ? {
          allowed: ticketType.cancellationAllowed,
          cutoffHours: ticketType.cancellationCutoffHours,
          refundPercentage: ticketType.refundPercentage,
        }
      : null,
  };
}

async function listUserTickets(userId, { tab = "upcoming" } = {}) {
  const tickets = await EventTicket.find({ userId })
    .sort({ createdAt: -1 })
    .limit(100);

  const orderIds = tickets.map((t) => t.orderId);
  const orders = await EventOrder.find({ _id: { $in: orderIds } });
  const orderMap = new Map(orders.map((o) => [String(o._id), o]));

  const items = await Promise.all(
    tickets.map(async (t) => {
      const order = orderMap.get(String(t.orderId));
      return {
        id: t._id,
        bookingId: t.bookingId,
        status: t.status,
        quantity: t.quantity,
        ticketTypeName: t.ticketTypeName,
        event: await resolveTicketEventSnapshot(order),
        totalAmount: order ? paiseToRupees(order.totalAmountPaise) : 0,
        createdAt: t.createdAt,
      };
    }),
  );

  return items.filter((item) => {
    if (tab === "cancelled") {
      return ["CANCELLED", "REFUNDED"].includes(item.status);
    }
    if (tab === "past") {
      return item.status === "CHECKED_IN";
    }
    return ["ACTIVE", "CHECKED_IN"].includes(item.status);
  });
}

async function cancelTicket({ ticketId, userId }) {
  const session = await startPrimarySession();
  session.startTransaction();

  try {
    const ticket = await EventTicket.findById(ticketId).session(session);
    if (!ticket) {
      const err = new Error("Ticket not found");
      err.statusCode = 404;
      throw err;
    }
    if (String(ticket.userId) !== String(userId)) {
      const err = new Error("Unauthorized");
      err.statusCode = 403;
      throw err;
    }
    if (ticket.status === "CHECKED_IN") {
      const err = new Error("Checked-in tickets cannot be cancelled");
      err.statusCode = 400;
      throw err;
    }
    if (["CANCELLED", "REFUNDED"].includes(ticket.status)) {
      const err = new Error("Ticket is already cancelled");
      err.statusCode = 400;
      throw err;
    }

    const ticketType = await EventTicketType.findById(ticket.ticketTypeId).session(session);
    const order = await EventOrder.findById(ticket.orderId).session(session);

    if (!ticketType?.cancellationAllowed) {
      const err = new Error("Cancellation is not allowed for this event");
      err.statusCode = 400;
      throw err;
    }

    ticket.status = "CANCELLED";
    ticket.cancelledAt = new Date();
    ticket.refundStatus = order?.totalAmountPaise > 0 ? "PENDING" : "NONE";
    await ticket.save({ session });

    await releaseSoldInventory(ticket.ticketTypeId, ticket.quantity, session);

    if (order) {
      order.status = order.totalAmountPaise > 0 ? "REFUND_PENDING" : "CANCELLED";
      await order.save({ session });
    }

    await session.commitTransaction();

    if (order?.totalAmountPaise > 0 && order.razorpayPaymentId && order.razorpayPaymentId !== "free") {
      if (order.paymentProvider === "razorpay" || !order.paymentProvider) {
        try {
          const refundAmount = Math.round(
            (order.totalAmountPaise * ticketType.refundPercentage) / 100,
          );
          await createRefund({
            paymentId: order.razorpayPaymentId,
            amountPaise: refundAmount,
            notes: { bookingId: order.bookingId, ticketId: String(ticket._id) },
          });
          ticket.refundStatus = "COMPLETED";
          order.status = "REFUNDED";
          await ticket.save();
          await order.save();
        } catch (refundErr) {
          logger.error("[Ticketing] Refund failed", {
            bookingId: order.bookingId,
            err: refundErr.message,
          });
          ticket.refundStatus = "FAILED";
          await ticket.save();
        }
      } else {
        logger.warn("[Ticketing] PayU refund not automated yet", {
          bookingId: order.bookingId,
        });
        ticket.refundStatus = "PENDING";
        await ticket.save();
      }
    }

    return { success: true, ticketId: ticket._id, status: ticket.status };
  } catch (e) {
    await session.abortTransaction();
    throw e;
  } finally {
    session.endSession();
  }
}

function parseQrToken(raw) {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (trimmed.startsWith("LISTIFYS:TICKET:")) {
    return trimmed.slice("LISTIFYS:TICKET:".length);
  }
  return trimmed;
}

async function validateTicketScan({ token, scannerUserId, eventId }) {
  const secureToken = parseQrToken(token);
  if (!secureToken) {
    return { valid: false, code: "INVALID", message: "Invalid ticket" };
  }

  const ticket = await EventTicket.findOne({ secureToken });
  if (!ticket) {
    return { valid: false, code: "INVALID", message: "Invalid ticket" };
  }

  if (eventId && String(ticket.eventId) !== String(eventId)) {
    return { valid: false, code: "WRONG_EVENT", message: "Ticket is for a different event" };
  }

  const event = await Event.findById(ticket.eventId);
  const order = await EventOrder.findById(ticket.orderId);

  const isOrganizer =
    event &&
    (String(event.seller) === String(scannerUserId) ||
      String(event.seller?._id) === String(scannerUserId));

  if (!isOrganizer) {
    const err = new Error("You are not authorized to scan tickets for this event");
    err.statusCode = 403;
    throw err;
  }

  if (ticket.status === "CHECKED_IN") {
    return {
      valid: false,
      code: "ALREADY_USED",
      message: "Ticket already checked in",
      ticket: summarizeTicket(ticket, order, event),
    };
  }

  if (ticket.status === "CANCELLED") {
    return { valid: false, code: "CANCELLED", message: "Ticket cancelled", ticket: summarizeTicket(ticket, order, event) };
  }

  if (ticket.status === "REFUNDED") {
    return { valid: false, code: "REFUNDED", message: "Ticket refunded", ticket: summarizeTicket(ticket, order, event) };
  }

  if (ticket.status !== "ACTIVE") {
    return { valid: false, code: "INVALID", message: "Invalid ticket status" };
  }

  return {
    valid: true,
    code: "VALID",
    message: "Valid ticket",
    ticket: summarizeTicket(ticket, order, event),
  };
}

function summarizeTicket(ticket, order, event) {
  return {
    id: ticket._id,
    bookingId: ticket.bookingId,
    ticketTypeName: ticket.ticketTypeName,
    quantity: ticket.quantity,
    status: ticket.status,
    eventTitle: order?.eventSnapshot?.title || event?.title,
    checkedInAt: ticket.checkedInAt,
  };
}

async function checkInTicket({ token, scannerUserId, eventId }) {
  const secureToken = parseQrToken(token);
  const session = await startPrimarySession();
  session.startTransaction();

  try {
    const validation = await validateTicketScan({ token: secureToken, scannerUserId, eventId });
    if (!validation.valid) {
      await session.abortTransaction();
      return validation;
    }

    const updated = await EventTicket.findOneAndUpdate(
      { secureToken, status: "ACTIVE" },
      {
        $set: {
          status: "CHECKED_IN",
          checkedInAt: new Date(),
          checkedInBy: scannerUserId,
        },
      },
      { new: true, session },
    );

    if (!updated) {
      await session.abortTransaction();
      return {
        valid: false,
        code: "ALREADY_USED",
        message: "Ticket already checked in",
      };
    }

    await session.commitTransaction();

    const order = await EventOrder.findById(updated.orderId);
    const event = await Event.findById(updated.eventId);

    return {
      valid: true,
      code: "CHECKED_IN",
      message: "Entry approved",
      ticket: summarizeTicket(updated, order, event),
    };
  } catch (e) {
    await session.abortTransaction();
    throw e;
  } finally {
    session.endSession();
  }
}

async function handlePaymentWebhook(event, payload) {
  if (event !== "payment.captured") return { handled: false };

  const payment = payload?.payment?.entity || payload;
  const orderId = payment?.order_id;
  const paymentId = payment?.id;

  if (!orderId || !paymentId) return { handled: false };

  const webhookKey = `ticket:webhook:${paymentId}`;
  const processed = await redis.get(webhookKey);
  if (processed) return { handled: true, duplicate: true };

  const order = await EventOrder.findOne({ razorpayOrderId: orderId });
  if (!order) return { handled: false, reason: "order_not_found" };

  const result = await confirmOrderPayment({
    orderId: order._id,
    razorpayOrderId: orderId,
    razorpayPaymentId: paymentId,
    razorpaySignature: "webhook",
    isFree: false,
    webhook: true,
  });

  await redis.setex(webhookKey, 86400 * 7, "1");
  return { handled: true, result };
}

function startHoldExpiryScheduler() {
  const interval = setInterval(() => {
    expireStaleHolds().catch((err) =>
      logger.error("[Ticketing] Hold expiry scheduler error", { err: err.message }),
    );
  }, 60_000);
  interval.unref();
  return interval;
}

module.exports = {
  HOLD_TTL_MS,
  getAvailability,
  createHold,
  createCheckoutOrder,
  getCheckoutPage,
  handlePayuReturn,
  verifyAndConfirmPayment,
  verifyInAppPayuPayment,
  getTicketForUser,
  getUserEventTicket,
  listUserTickets,
  cancelTicket,
  validateTicketScan,
  checkInTicket,
  handlePaymentWebhook,
  expireStaleHolds,
  startHoldExpiryScheduler,
  paiseToRupees,
  rupeesToPaise,
};

/**
 * FCM Push Notification Service (Firebase Admin SDK)
 *
 * Supports:
 *   - Rich data-only notifications (Myntra/Amazon style)
 *   - Big image / big text styles (rendered by Notifee on device)
 *   - CTA action buttons (Add to Cart, View Offer, Open Product…)
 *   - Deep-link routing via `route` + `params` data fields
 *   - Notification grouping
 *   - Silent background pushes
 *   - Multicast (batch) sends
 *   - Incoming call pushes (high-priority, TTL=30s)
 *   - Scheduled notifications (server-side setTimeout / queue)
 *
 * Requires FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY
 * (or FIREBASE_SERVICE_ACCOUNT_PATH) in .env.
 */
const { logger } = require('../utils/logger');
const fs = require('fs');
const path = require('path');

const DEFAULT_SERVICE_ACCOUNT_PATH = path.resolve(__dirname, '../config/firebase-service-account.json');

let admin = null;
let messaging = null;

function parseServiceAccountJson(raw, sourceLabel) {
  if (!raw?.trim()) return null;
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    return JSON.parse(trimmed);
  } catch (err) {
    logger.error(`[FCM] ${sourceLabel} contains invalid JSON`, { error: err.message });
    return null;
  }
}

function loadServiceAccount() {
  const fromJsonEnv = parseServiceAccountJson(
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
    'FIREBASE_SERVICE_ACCOUNT_JSON',
  );
  if (fromJsonEnv) return fromJsonEnv;

  const configuredPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim();
  if (configuredPath) {
    const fromPathAsJson = parseServiceAccountJson(
      configuredPath,
      'FIREBASE_SERVICE_ACCOUNT_PATH',
    );
    if (fromPathAsJson) {
      logger.warn(
        '[FCM] FIREBASE_SERVICE_ACCOUNT_PATH holds JSON, not a file path. ' +
        'Rename it to FIREBASE_SERVICE_ACCOUNT_JSON or use FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY.',
      );
      return fromPathAsJson;
    }

    const resolvedPath = path.isAbsolute(configuredPath)
      ? configuredPath
      : path.resolve(__dirname, '..', configuredPath);
    if (fs.existsSync(resolvedPath)) {
      return require(resolvedPath);
    }
    logger.warn('[FCM] FIREBASE_SERVICE_ACCOUNT_PATH file not found', { path: resolvedPath });
  }

  if (fs.existsSync(DEFAULT_SERVICE_ACCOUNT_PATH)) {
    return require(DEFAULT_SERVICE_ACCOUNT_PATH);
  }

  if (
    process.env.FIREBASE_PRIVATE_KEY &&
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL
  ) {
    return {
      project_id: process.env.FIREBASE_PROJECT_ID,
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    };
  }

  return null;
}

function resolveServiceAccountPath() {
  const configured = process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim();
  if (!configured || configured.startsWith('{')) return null;

  const resolvedPath = path.isAbsolute(configured)
    ? configured
    : path.resolve(__dirname, '..', configured);
  return fs.existsSync(resolvedPath) ? resolvedPath : null;
}

function isInvalidTokenError(err) {
  const code = err?.code || err?.errorInfo?.code || '';
  return (
    code === 'messaging/invalid-registration-token' ||
    code === 'messaging/registration-token-not-registered'
  );
}

async function clearInvalidFcmToken(fcmToken) {
  if (!fcmToken) return;
  try {
    const User = require('../models/user.model');
    await User.updateMany({ fcmToken }, { $unset: { fcmToken: '' } });
    logger.info('[FCM] Cleared invalid device token from user record');
  } catch (err) {
    logger.warn('[FCM] Failed to clear invalid token', { error: err.message });
  }
}

function isFirebaseConfigured() {
  return Boolean(loadServiceAccount());
}

function getAdmin() {
  if (admin) return admin;

  try {
    admin = require('firebase-admin');

    if (admin.apps.length > 0) {
      messaging = admin.messaging();
      return admin;
    }

    let credential;
    let projectId;
    const serviceAccount = loadServiceAccount();
    if (serviceAccount) {
      projectId = serviceAccount.project_id;
      credential = admin.credential.cert(serviceAccount);
    } else {
      logger.warn('[FCM] No Firebase credentials configured — push notifications disabled');
      return null;
    }

    admin.initializeApp({ credential, projectId });
    messaging = admin.messaging();
    logger.info('[FCM] Firebase Admin SDK initialized', { projectId });
  } catch (err) {
    logger.error('[FCM] Failed to initialize Firebase Admin SDK', { error: err.message });
    admin = null;
    messaging = null;
  }

  return admin;
}

/**
 * Send an incoming call push notification to a device token.
 * Uses data-only message so the app can display a full-screen incoming call UI.
 */
async function sendCallNotification(fcmToken, { callId, callType, callerName, callerPhoto, from }) {
  if (!getAdmin() || !messaging) return;

  try {
    await messaging.send({
      token: fcmToken,
      data: stringifyData({
        type:           'incoming_call',
        notificationId: callId      || '',
        title:          `📞 ${callerName || 'Unknown'} is calling`,
        body:           callType === 'video' ? 'Incoming video call' : 'Incoming audio call',
        callId:         callId      || '',
        callType:       callType    || 'audio',
        callerName:     callerName  || 'Unknown',
        callerPhoto:    callerPhoto || '',
        from:           from        || '',
        groupKey:       'calls',
      }),
      android: { priority: 'high', ttl: 30_000 },
      apns:    { headers: { 'apns-priority': '10', 'apns-push-type': 'voip' } },
    });
    logger.debug('[FCM] Call notification sent', { callId, callerName });
  } catch (err) {
    logger.warn('[FCM] Failed to send call notification', { error: err.message, fcmToken: fcmToken?.slice(0, 20) });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Stringify all values in a data object so FCM accepts them. */
function stringifyData(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue;
    out[k] = typeof v === 'string' ? v : JSON.stringify(v);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Rich notification  (Myntra / Flipkart / Amazon style)
// All display logic lives on the client (Notifee). We only send data fields.
// ─────────────────────────────────────────────────────────────────────────────
async function sendRichNotification(fcmToken, {
  notificationId, type, title, body,
  imageUrl, iconUrl, route, params,
  actions, groupKey, sound, extra = {},
}) {
  if (!getAdmin() || !messaging) {
    return { success: false, error: 'firebase_not_configured' };
  }
  if (!fcmToken || !title || !body) {
    return { success: false, error: 'invalid_payload' };
  }

  const data = stringifyData({
    type:           type           || 'general',
    notificationId: notificationId || '',
    title, body,
    ...(imageUrl ? { imageUrl }  : {}),
    ...(iconUrl  ? { iconUrl }   : {}),
    ...(route    ? { route }     : {}),
    ...(params   ? { params: JSON.stringify(params) } : {}),
    ...(actions  ? { actions: JSON.stringify(actions) } : {}),
    ...(groupKey ? { groupKey }  : {}),
    ...(sound    ? { sound }     : {}),
    ...stringifyData(extra),
  });

  try {
    const messageId = await messaging.send({
      token: fcmToken,
      data,
      android: { priority: 'high' },
      apns:    { headers: { 'apns-priority': '5' } },
    });
    logger.debug('[FCM] Rich notification sent', { type, notificationId, messageId });
    return { success: true, messageId };
  } catch (err) {
    logger.warn('[FCM] sendRichNotification failed', { error: err.message, type });
    if (isInvalidTokenError(err)) {
      await clearInvalidFcmToken(fcmToken);
    }
    return { success: false, error: err.message, code: err.code };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Multicast  (up to 500 tokens per call)
// ─────────────────────────────────────────────────────────────────────────────
async function sendMulticast(fcmTokens, payload) {
  if (!getAdmin() || !messaging || !fcmTokens?.length) return;
  const BATCH = 500;
  for (let i = 0; i < fcmTokens.length; i += BATCH) {
    const batch = fcmTokens.slice(i, i + BATCH);
    try {
      const res = await messaging.sendEachForMulticast({
        tokens: batch,
        data:   stringifyData(payload),
        android: { priority: 'high' },
        apns:    { headers: { 'apns-priority': '5' } },
      });
      logger.debug('[FCM] Multicast batch', {
        total: batch.length, success: res.successCount, failed: res.failureCount,
      });
    } catch (err) {
      logger.warn('[FCM] sendMulticast batch failed', { error: err.message });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Silent / data-only background push
// ─────────────────────────────────────────────────────────────────────────────
async function sendSilentNotification(fcmToken, data = {}) {
  if (!getAdmin() || !messaging) return;
  try {
    await messaging.send({
      token: fcmToken,
      data:  stringifyData({ type: 'silent', ...data }),
      android: { priority: 'normal' },
      apns: {
        headers: { 'apns-priority': '5', 'apns-push-type': 'background' },
        payload: { aps: { 'content-available': 1 } },
      },
    });
  } catch (err) {
    logger.debug('[FCM] sendSilentNotification failed', { error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// General push notification  (backward-compat wrapper)
// ─────────────────────────────────────────────────────────────────────────────
async function sendPushNotification(fcmToken, { title, body, data = {} }) {
  return sendRichNotification(fcmToken, {
    notificationId: data.notificationId ?? '',
    type:           data.type ?? 'general',
    title, body,
    extra: data,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Typed helpers per notification type
// ─────────────────────────────────────────────────────────────────────────────

async function sendPriceDropNotification(fcmToken, {
  notificationId, userName, productTitle, oldPrice, newPrice,
  imageUrl, listingId, listingType, currency = '₹',
}) {
  return sendRichNotification(fcmToken, {
    notificationId,
    type:     'price_drop',
    title:    `🏷️ Price Drop! ${productTitle}`,
    body:     `Hi ${userName}! Price dropped from ${currency}${oldPrice} → ${currency}${newPrice}`,
    imageUrl,
    route:    '/listing-detail-template',
    params:   { id: listingId, category: listingType ?? 'electronics' },
    actions:  [{ id: 'open_product', title: '🛒 View Deal' }],
    groupKey: 'price_alerts',
    extra:    { listingId, listingType },
  });
}

async function sendPromoNotification(fcmToken, {
  notificationId, title, body, imageUrl, route, params, actions,
}) {
  return sendRichNotification(fcmToken, {
    notificationId,
    type:     'promotion',
    title, body, imageUrl,
    route:    route ?? '/(tabs)/home-feed-root',
    params,
    actions:  actions ?? [{ id: 'view_offer', title: '🎁 View Offer' }],
    groupKey: 'promotions',
  });
}

async function sendOfferNotification(fcmToken, {
  notificationId, buyerName, productTitle,
  listingId, listingType, imageUrl, conversationId,
}) {
  return sendRichNotification(fcmToken, {
    notificationId,
    type:     'offer_received',
    title:    `💬 New offer on "${productTitle}"`,
    body:     `${buyerName} made an offer on your listing`,
    imageUrl,
    route:    '/chat-conversation',
    params:   { conversationId, listingId, listingType },
    actions:  [
      { id: 'view_offer', title: '👀 View Offer' },
      { id: 'open_chat',  title: '💬 Reply' },
    ],
    groupKey: 'messages',
    extra:    { conversationId, listingId, listingType },
  });
}

async function sendBookingNotification(fcmToken, {
  notificationId, serviceTitle, event, bookingId,
}) {
  const msgs = {
    created:   { title: '📅 Booking Confirmed',  body: `Your booking for "${serviceTitle}" is confirmed.` },
    confirmed: { title: '✅ Booking Approved',    body: `"${serviceTitle}" booking approved!` },
    cancelled: { title: '❌ Booking Cancelled',   body: `Your booking for "${serviceTitle}" was cancelled.` },
    completed: { title: '🎉 Booking Completed',  body: `"${serviceTitle}" marked as complete!` },
  };
  const { title, body } = msgs[event] ?? { title: 'Booking Update', body: `Status: ${event}` };
  return sendRichNotification(fcmToken, {
    notificationId, type: `booking_${event}`, title, body,
    groupKey: 'orders', extra: { bookingId },
  });
}

async function sendFollowNotification(fcmToken, {
  notificationId, followerName, followerId, followerPhoto,
}) {
  return sendRichNotification(fcmToken, {
    notificationId,
    type:    'follow',
    title:   '👤 New Follower',
    body:    `${followerName} started following you`,
    iconUrl: followerPhoto,
    route:   '/seller-public-profile',
    params:  { sellerId: followerId, sellerName: followerName },
    extra:   { followerId, senderName: followerName, senderPhoto: followerPhoto },
  });
}

async function sendSecurityAlertNotification(fcmToken, {
  notificationId, deviceName, deviceId, deviceType,
  city, state, country, ipAddress, loginTime, timezone,
  isNewDevice, isNewLocation,
}) {
  const locationStr = [city, state, country].filter(Boolean).join(', ');
  return sendRichNotification(fcmToken, {
    notificationId,
    type:     'security_alert',
    title:    '🔐 New Login Detected',
    body:     `A new sign-in to your Listify account was detected.\n\nDevice: ${deviceName}\nLocation: ${locationStr}\nTime: ${loginTime}\n\nIf this wasn't you, TAP TO TAKE ACTION immediately.`,
    route:    '/security-alert',
    params:   { deviceId, deviceName, deviceType, city, state, country, ipAddress, loginTime, timezone, isNewDevice, isNewLocation },
    actions:  [
      { id: 'secure_account', title: '🔒 Secure Account' },
      { id: 'dismiss',        title: '✓ This Was Me' },
    ],
    groupKey: 'security',
    sound:    'default',
    extra:    { deviceId, deviceName, deviceType, city, state, country, ipAddress, loginTime, timezone, isNewDevice, isNewLocation },
  });
}

async function sendEngagementNotification(fcmToken, {
  notificationId, title, body, campaign,
}) {
  return sendRichNotification(fcmToken, {
    notificationId,
    type: campaign === 're_engagement' ? 're_engagement' : 'engagement_digest',
    title,
    body,
    route: '/(tabs)/home-feed-root',
    actions: [{ id: 'browse', title: '🔍 Browse now' }],
    groupKey: 'promotions',
    extra: { campaign },
  });
}

module.exports = {
  isFirebaseConfigured,
  sendCallNotification,
  sendRichNotification,
  sendMulticast,
  sendSilentNotification,
  sendPushNotification,
  sendPriceDropNotification,
  sendPromoNotification,
  sendOfferNotification,
  sendBookingNotification,
  sendFollowNotification,
  sendSecurityAlertNotification,
  sendEngagementNotification,
};

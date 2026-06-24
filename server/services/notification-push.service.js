'use strict';

const User = require('../models/user.model');
const { sendRichNotification } = require('./fcm.service');
const { logger } = require('../utils/logger');

function prefEnabled(prefs, key) {
  if (!prefs || prefs[key] === undefined || prefs[key] === null) return true;
  return Boolean(prefs[key]);
}

const LISTING_ROUTE_MAP = {
  events: '/event-detail',
  properties: '/property-detail',
  jobs: '/job-detail',
};

const TITLE_BY_TYPE = {
  follow: 'New follower',
  message: 'New message',
  offer_received: 'New offer',
  offer_accepted: 'Offer accepted',
  offer_rejected: 'Offer declined',
  offer: 'New offer',
  price_drop: 'Price drop',
  listing_saved: 'Listing saved',
  listing_sold: 'Listing sold',
  new_listing: 'New listing',
  booking_created: 'Booking update',
  booking_confirmed: 'Booking confirmed',
  booking_completed: 'Booking complete',
  booking_cancelled: 'Booking cancelled',
  booking: 'Booking update',
  review_received: 'New review',
  promotion: 'Listifys',
  flash_sale: 'Flash sale',
  engagement_digest: 'Listifys',
  re_engagement: 'Listifys',
  system: 'Listifys',
  security_alert: 'Security alert',
};

function listingRoute(listingType) {
  return LISTING_ROUTE_MAP[listingType] || '/listing-detail-template';
}

function resolveUserArea(user) {
  const current = user.devices?.find((d) => d.isCurrentDevice) || user.devices?.[0];
  if (current?.location?.city) return current.location.city;
  const history = user.loginHistory;
  if (history?.length) {
    const last = history[history.length - 1];
    if (last?.location?.city) return last.location.city;
  }
  return null;
}

function buildFcmPayload({
  notificationId,
  notifType,
  message,
  title,
  imageUrl,
  iconUrl,
  metadata = {},
  senderName,
}) {
  const type = notifType || 'general';
  const listingId = metadata.listingId ? String(metadata.listingId) : null;
  const listingType = metadata.listingType || metadata.entity || 'electronics';
  const conversationId = metadata.conversationId ? String(metadata.conversationId) : null;
  const threadId = metadata.threadId ? String(metadata.threadId) : null;

  let route;
  let params;
  let groupKey;
  let actions;

  switch (type) {
    case 'message':
      route = '/chat-conversation';
      params = {
        ...(conversationId ? { conversationId } : {}),
        ...(threadId ? { threadId } : {}),
        ...(metadata.senderId ? { recipientId: String(metadata.senderId) } : {}),
        ...(senderName ? { name: senderName } : {}),
      };
      groupKey = 'messages';
      actions = [{ id: 'reply', title: '💬 Reply' }];
      break;
    case 'offer_received':
    case 'offer_accepted':
    case 'offer_rejected':
    case 'offer':
      if (listingId) {
        route = listingRoute(listingType);
        params = { id: listingId, category: listingType };
      } else {
        route = '/messages-inbox';
      }
      groupKey = 'messages';
      actions = [{ id: 'view_offer', title: '👀 View' }];
      break;
    case 'new_listing':
    case 'listing_saved':
    case 'listing_sold':
    case 'price_drop':
      if (listingId) {
        route = listingRoute(listingType);
        params = { id: listingId, category: listingType };
      } else {
        route = '/(tabs)/home-feed-root';
      }
      groupKey = type === 'price_drop' ? 'price_alerts' : 'listings';
      actions = [{ id: 'open_listing', title: '👀 View listing' }];
      break;
    case 'follow': {
      const followerId = String(metadata.followerId || metadata.senderId || '');
      route = '/seller-public-profile';
      params = {
        sellerId: followerId,
        sellerName: senderName || '',
      };
      groupKey = 'social';
      actions = [{ id: 'view_profile', title: '👤 View profile' }];
      break;
    }
    case 'engagement_digest':
    case 're_engagement':
    case 'promotion':
    case 'flash_sale':
      route = '/(tabs)/home-feed-root';
      groupKey = 'promotions';
      actions = [{ id: 'browse', title: '🔍 Browse now' }];
      break;
    default:
      route = '/(tabs)/home-feed-root';
      groupKey = 'general';
  }

  const resolvedTitle = title || TITLE_BY_TYPE[type] || 'Listifys';
  const resolvedImage = imageUrl || metadata.listingImage || metadata.imageUrl || null;
  const resolvedIcon = iconUrl || metadata.senderPhoto || metadata.iconUrl || null;

  return {
    notificationId: notificationId ? String(notificationId) : `notif_${Date.now()}`,
    type,
    title: resolvedTitle,
    body: message,
    imageUrl: resolvedImage,
    iconUrl: resolvedIcon,
    route,
    params,
    actions,
    groupKey,
    extra: {
      ...(listingId ? { listingId, listingType } : {}),
      ...(conversationId ? { conversationId, threadId: threadId || '' } : {}),
      ...(metadata.campaign ? { campaign: metadata.campaign } : {}),
    },
  };
}

async function dispatchPushToUser(userId, payload, { transactional = true, forceEngagement = false } = {}) {
  try {
    const user = await User.findById(userId)
      .select('fcmToken preferences')
      .lean();

    if (!user?.fcmToken) {
      logger.info('[NotificationPush] Skipped — recipient has no FCM token', {
        userId,
        type: payload?.type,
        hint: 'Recipient must open the app, sign in, and allow notifications',
      });
      return false;
    }

    // Master switch: if the user has disabled push notifications, never send.
    // `forceEngagement` may bypass engagement-specific gating below, but it
    // can NEVER override the master push preference — the user opted out.
    if (!prefEnabled(user.preferences, 'pushNotifications')) {
      logger.info('[NotificationPush] Skipped — push disabled in user preferences', {
        userId,
        type: payload?.type,
      });
      return false;
    }

    if (!forceEngagement) {
      if (!transactional && !prefEnabled(user.preferences, 'engagementNotifications')) {
        logger.info('[NotificationPush] Skipped — engagement notifications disabled', {
          userId,
          type: payload?.type,
        });
        return false;
      }
    }

    const result = await sendRichNotification(user.fcmToken, payload);
    if (!result?.success) {
      logger.warn('[NotificationPush] FCM send failed', {
        userId,
        type: payload?.type,
        error: result?.error,
        code: result?.code,
      });
      return false;
    }

    logger.info('[NotificationPush] FCM push sent', {
      userId,
      type: payload?.type,
      messageId: result.messageId,
    });
    return true;
  } catch (err) {
    logger.warn('[NotificationPush] dispatch failed', { userId, err: err.message });
    return false;
  }
}

async function dispatchInAppNotificationPush({
  notificationId,
  recipientId,
  notifType,
  message,
  title,
  imageUrl,
  iconUrl,
  metadata,
  senderName,
}) {
  const payload = buildFcmPayload({
    notificationId,
    notifType,
    message,
    title,
    imageUrl,
    iconUrl,
    metadata,
    senderName,
  });
  return dispatchPushToUser(recipientId, payload, { transactional: true });
}

module.exports = {
  buildFcmPayload,
  dispatchPushToUser,
  dispatchInAppNotificationPush,
  resolveUserArea,
  listingRoute,
};

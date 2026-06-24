/**
 * Deep-link handler for push notification payloads.
 */
import type { RichNotificationPayload } from './types';
import type { Href } from '@/lib/safe-router';
import { normalizeNotificationPayload } from './payload-normalizer';
import { queueNotificationNavigation } from './pending-notification-navigation';

/** Resolve the expo-router href for a notification payload. */
export function getHrefForNotificationPayload(payload: RichNotificationPayload): Href | null {
  const normalized = normalizeNotificationPayload(payload);
  return resolveHref(normalized);
}

/** Navigate from a push / Notifee notification payload (queued until navigator is ready). */
export function navigateFromNotification(payload: RichNotificationPayload): void {
  const normalized = normalizeNotificationPayload(payload);
  const href = resolveHref(normalized);

  if (!href) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn('[Notifications] No route resolved for type:', normalized.type, normalized);
    }
    return;
  }

  queueNotificationNavigation(href);
}

function mergeChatParams(payload: RichNotificationPayload): Record<string, string> {
  const parsed = safeParseParams(payload.params) ?? {};
  const merged: Record<string, string> = { ...parsed };

  if (payload.conversationId) merged.conversationId = payload.conversationId;
  if (payload.threadId) merged.threadId = payload.threadId;
  if (payload.senderId) {
    merged.recipientId = payload.senderId;
    merged.senderId = payload.senderId;
  }
  if (payload.senderName) merged.name = payload.senderName;
  if (payload.listingId) merged.listingId = payload.listingId;
  if (payload.listingType) merged.listingType = payload.listingType;
  if (payload.productTitle) merged.productTitle = payload.productTitle;

  return merged;
}

function chatHrefFromPayload(payload: RichNotificationPayload): Href | null {
  const params = mergeChatParams(payload);
  if (!params.conversationId && !params.recipientId) return null;
  return { pathname: '/chat-conversation', params } as Href;
}

function resolveHref(payload: RichNotificationPayload): Href | null {
  const type = (payload.type ?? '').toLowerCase();

  if (type === 'follow') {
    const sellerId = payload.followerId ?? payload.senderId;
    if (sellerId) {
      return {
        pathname: '/seller-public-profile',
        params: {
          sellerId,
          sellerName: payload.senderName ?? '',
        },
      } as Href;
    }
    return '/(tabs)/home-feed-root' as Href;
  }

  const isChatType =
    type === 'message' ||
    type === 'offer' ||
    type === 'offer_received' ||
    type === 'offer_accepted' ||
    type === 'offer_rejected';

  if (isChatType) {
    const chat = chatHrefFromPayload(payload);
    if (chat) return chat;
    return '/messages-inbox' as Href;
  }

  if (payload.route) {
    if (payload.route.includes('chat-conversation')) {
      const chat = chatHrefFromPayload(payload);
      if (chat) return chat;
    }

    const params = mergeRouteParams(payload);
    if (params && Object.keys(params).length > 0) {
      return { pathname: payload.route as never, params } as Href;
    }
    return payload.route as Href;
  }

  if (type === 'message') {
    const chat = chatHrefFromPayload(payload);
    if (chat) return chat;
    return '/messages-inbox' as Href;
  }

  if (type === 'listing_saved' || type === 'new_listing' || type === 'listing_sold') {
    if (payload.listingId) {
      return listingHref(payload.listingId, payload.listingType ?? 'electronics');
    }
    return '/(tabs)/home-feed-root' as Href;
  }

  if (type === 'price_drop') {
    if (payload.listingId) {
      return listingHref(payload.listingId, payload.listingType ?? 'electronics');
    }
    return '/saved-items' as Href;
  }

  if (
    type === 'booking_created' ||
    type === 'booking_confirmed' ||
    type === 'booking_completed' ||
    type === 'booking_cancelled' ||
    type === 'order_update'
  ) {
    return '/(tabs)/home-feed-root' as Href;
  }

  if (type === 'review_received') {
    if (payload.listingId) {
      return listingHref(payload.listingId, payload.listingType ?? 'services');
    }
    return '/(tabs)/home-feed-root' as Href;
  }

  if (type === 'promotion' || type === 'flash_sale' || type === 'engagement_digest' || type === 're_engagement') {
    return '/(tabs)/home-feed-root' as Href;
  }

  if (type === 'incoming_call') {
    return '/incoming-call' as Href;
  }

  if (type === 'security_alert') {
    return {
      pathname: '/security-alert',
      params: {
        ...(payload.deviceId ? { deviceId: payload.deviceId } : {}),
        ...(payload.deviceName ? { deviceName: payload.deviceName } : {}),
        ...(payload.deviceType ? { deviceType: payload.deviceType } : {}),
        ...(payload.city ? { city: payload.city } : {}),
        ...(payload.state ? { state: payload.state } : {}),
        ...(payload.country ? { country: payload.country } : {}),
        ...(payload.ipAddress ? { ipAddress: payload.ipAddress } : {}),
        ...(payload.loginTime ? { loginTime: payload.loginTime } : {}),
        ...(payload.timezone ? { timezone: payload.timezone } : {}),
        ...(payload.isNewDevice ? { isNewDevice: payload.isNewDevice } : {}),
        ...(payload.isNewLocation ? { isNewLocation: payload.isNewLocation } : {}),
      },
    } as Href;
  }

  return '/(tabs)/home-feed-root' as Href;
}

function mergeRouteParams(payload: RichNotificationPayload): Record<string, string> | null {
  const parsed = safeParseParams(payload.params);
  if (parsed) return parsed;

  if (payload.route?.includes('chat-conversation')) {
    const chatParams = mergeChatParams(payload);
    return Object.keys(chatParams).length > 0 ? chatParams : null;
  }

  return null;
}

function listingHref(listingId: string, listingType: string): Href {
  const specialRoutes: Record<string, string> = {
    events: '/event-detail',
    properties: '/property-detail',
    jobs: '/job-detail',
  };
  const pathname = (specialRoutes[listingType] ?? '/listing-detail-template') as never;
  return { pathname, params: { category: listingType, id: listingId } } as Href;
}

function safeParseParams(raw: string | undefined): Record<string, string> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed as Record<string, string>;
    }
  } catch {
    /* ignore */
  }
  return null;
}

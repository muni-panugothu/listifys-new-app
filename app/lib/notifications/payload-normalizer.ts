/**
 * Normalize FCM / Notifee data into a RichNotificationPayload with top-level routing fields.
 */
import type { RichNotificationPayload } from './types';

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

/** Lift nested `params` JSON onto top-level fields used by the deep-link resolver. */
export function normalizeNotificationPayload(
  data: Record<string, string | undefined>,
): RichNotificationPayload {
  const payload = { ...data } as RichNotificationPayload;
  const parsed = safeParseParams(payload.params);

  if (parsed) {
    if (!payload.conversationId && parsed.conversationId) {
      payload.conversationId = parsed.conversationId;
    }
    if (!payload.threadId && parsed.threadId) {
      payload.threadId = parsed.threadId;
    }
    if (!payload.senderId && parsed.recipientId) {
      payload.senderId = parsed.recipientId;
    }
    if (!payload.senderId && parsed.senderId) {
      payload.senderId = parsed.senderId;
    }
    if (!payload.senderName && parsed.name) {
      payload.senderName = parsed.name;
    }
    if (!payload.listingId && parsed.listingId) {
      payload.listingId = parsed.listingId;
    }
    if (!payload.listingType && parsed.listingType) {
      payload.listingType = parsed.listingType;
    }
    if (!payload.followerId && parsed.followerId) {
      payload.followerId = parsed.followerId;
    }
  }

  return payload;
}

/** Convert an in-app notification list item into a push-style payload. */
export function notificationItemToPayload(item: {
  _id: string;
  type?: string;
  title?: string;
  message?: string;
  metadata?: Record<string, unknown>;
  data?: Record<string, unknown>;
  sender?: { id?: string; name?: string } | null;
}): RichNotificationPayload {
  const metadata = (item.metadata ?? item.data ?? {}) as Record<string, string>;
  const type = (item.type ?? 'general').toLowerCase();
  const senderId = item.sender?.id ?? metadata.senderId ?? metadata.followerId ?? '';
  const senderName = item.sender?.name ?? metadata.senderName ?? metadata.followerName ?? '';
  const followerId = metadata.followerId ? String(metadata.followerId) : (type === 'follow' ? senderId : undefined);

  const route =
    type === 'follow'
      ? '/seller-public-profile'
      : type === 'message' ||
          type === 'offer' ||
          type === 'offer_received' ||
          type === 'offer_accepted' ||
          type === 'offer_rejected'
        ? '/chat-conversation'
        : undefined;

  return normalizeNotificationPayload({
    type: item.type ?? 'general',
    notificationId: item._id,
    title: item.title ?? '',
    body: item.message ?? '',
    ...(route ? { route } : {}),
    params: JSON.stringify({
      ...metadata,
      ...(type === 'follow' && followerId
        ? { sellerId: followerId, sellerName: senderName }
        : {}),
      ...(type !== 'follow' && senderId ? { recipientId: String(senderId), name: senderName } : {}),
    }),
    conversationId: metadata.conversationId ? String(metadata.conversationId) : undefined,
    threadId: metadata.threadId ? String(metadata.threadId) : undefined,
    senderId: senderId ? String(senderId) : undefined,
    senderName,
    listingId: metadata.listingId ? String(metadata.listingId) : undefined,
    listingType: metadata.listingType ? String(metadata.listingType) : undefined,
    followerId,
  });
}

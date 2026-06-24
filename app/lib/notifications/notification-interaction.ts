/**
 * Shared Notifee press / action handling for foreground + background.
 */
import notifee, { EventType } from '@notifee/react-native';

import { store } from '@/store';
import { incomingCallReceived } from '@/store/slices/call-slice';
import { trackNotificationEvent } from '@/lib/notifications/analytics';
import { navigateFromNotification } from '@/lib/notifications/deep-link-handler';
import { normalizeNotificationPayload } from '@/lib/notifications/payload-normalizer';
import type { RichNotificationPayload } from '@/lib/notifications/types';
import { devLog } from '@/lib/dev-log';

import { isPersistedNotificationId } from './notification-id';
import { readCachedNotificationPayload } from './notification-payload-cache';

function safeParseJSON<T>(raw: string | undefined): T | null {
  try {
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function safeParseOffer(raw: string | undefined): object {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function hasRoutingContext(payload: RichNotificationPayload): boolean {
  return Boolean(
    payload.type &&
      (payload.conversationId ||
        payload.route ||
        payload.listingId ||
        payload.senderId ||
        payload.followerId ||
        payload.params),
  );
}

/** Recover routing data when Android drops payload fields on press. */
async function resolvePayload(
  data: RichNotificationPayload,
  notifId?: string,
): Promise<RichNotificationPayload> {
  let payload = normalizeNotificationPayload(data);
  if (hasRoutingContext(payload)) return payload;

  if (!notifId) return payload;

  try {
    const cached = await readCachedNotificationPayload(notifId);
    if (cached) {
      payload = normalizeNotificationPayload(cached);
      if (hasRoutingContext(payload)) return payload;
    }

    const displayed = await notifee.getDisplayedNotifications();
    const match = displayed.find((n) => n.id === notifId);
    const stored = match?.notification?.data as RichNotificationPayload | undefined;
    if (stored) {
      payload = normalizeNotificationPayload(stored);
    }
  } catch {
    /* ignore */
  }

  return payload;
}

function eventLabel(type: number): string {
  switch (type) {
    case EventType.DISMISSED:
      return 'DISMISSED';
    case EventType.PRESS:
      return 'PRESS';
    case EventType.ACTION_PRESS:
      return 'ACTION_PRESS';
    case EventType.DELIVERED:
      return 'DELIVERED';
    default:
      return `UNKNOWN(${type})`;
  }
}

/** Handle a Notifee notification tap or action button press. */
export async function handleNotificationInteraction(
  type: number,
  data: RichNotificationPayload,
  options?: {
    notifId?: string;
    actionId?: string;
  },
): Promise<void> {
  const { notifId, actionId } = options ?? {};

  // DELIVERED fires when a notification is posted — not a user tap.
  // Cancelling here was instantly removing notifications from the tray.
  if (type === EventType.DELIVERED) {
    return;
  }

  const payload = await resolvePayload(data, notifId);

  if (__DEV__) {
    devLog('[Notifications] Interaction', {
      event: eventLabel(type),
      actionId,
      notifId,
      payloadType: payload.type,
      conversationId: payload.conversationId,
    });
  }

  if (type === EventType.DISMISSED) {
    if (isPersistedNotificationId(payload.notificationId)) {
      void trackNotificationEvent({
        notificationId: payload.notificationId,
        event: 'dismissed',
        timestamp: Date.now(),
      });
    }
    return;
  }

  const isUserPress =
    type === EventType.PRESS ||
    type === EventType.ACTION_PRESS;

  if (!isUserPress) {
    return;
  }

  if (notifId) {
    await notifee.cancelNotification(notifId).catch(() => {});
  }

  if (payload.type === 'incoming_call') {
    if (type === EventType.ACTION_PRESS && actionId === 'reject') {
      return;
    }
    store.dispatch(
      incomingCallReceived({
        callId: payload.callId ?? '',
        remoteUserId: payload.from ?? '',
        remoteUserName: payload.callerName ?? 'Unknown',
        remoteUserPhoto: payload.callerPhoto ?? '',
        callType: (payload.callType as 'audio' | 'video') ?? 'audio',
        offer: safeParseOffer(payload.offer),
      }),
    );
    navigateFromNotification({ ...payload, route: '/incoming-call' });
    return;
  }

  const isBodyPress =
    type === EventType.PRESS ||
    (type === EventType.ACTION_PRESS && (!actionId || actionId === 'default'));

  if (isBodyPress) {
    if (isPersistedNotificationId(payload.notificationId)) {
      void trackNotificationEvent({
        notificationId: payload.notificationId,
        event: 'clicked',
        timestamp: Date.now(),
      });
    }
    navigateFromNotification(payload);
    return;
  }

  if (type === EventType.ACTION_PRESS && actionId) {
    if (isPersistedNotificationId(payload.notificationId)) {
      void trackNotificationEvent({
        notificationId: payload.notificationId,
        event: 'action_clicked',
        actionId,
        timestamp: Date.now(),
      });
    }

    if (actionId === 'reply' || actionId === 'open_chat' || actionId === 'view_offer') {
      navigateFromNotification(payload);
      return;
    }

    const actions =
      safeParseJSON<Array<{ id: string; route?: string; params?: Record<string, string> }>>(
        payload.actions,
      ) ?? [];
    const action = actions.find((a) => a.id === actionId);
    if (action?.route) {
      navigateFromNotification({
        ...payload,
        route: action.route,
        params: action.params ? JSON.stringify(action.params) : payload.params,
      });
      return;
    }

    if (actionId !== 'reject' && actionId !== 'dismiss') {
      navigateFromNotification(payload);
    }
    return;
  }
}

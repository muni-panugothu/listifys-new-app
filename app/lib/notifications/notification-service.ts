/**
 * Core notification display service.
 *
 * Renders rich Notifee notifications from raw FCM data payloads:
 *   - Big text / big picture (Myntra-style expandable)
 *   - CTA action buttons (Add to Cart, View Offer, Open Product…)
 *   - Notification grouping / summary
 *   - Incoming call full-screen overlay
 *   - Sound + vibration per channel
 *   - Silent / data-only pass-through
 */
import notifee, {
  AndroidCategory,
  AndroidImportance,
  AndroidStyle,
  AndroidVisibility,
  type AndroidAction,
  type AndroidNotification,
  type IOSNotificationAttachment,
} from '@notifee/react-native';
import { Platform } from 'react-native';
import { devLog } from '@/lib/dev-log';
import type { RichNotificationPayload, NotificationAction } from './types';
import { channelForType, CHANNEL } from './channels';
import { trackNotificationEvent } from './analytics';
import { isPersistedNotificationId } from './notification-id';
import { getHrefForNotificationPayload } from './deep-link-handler';
import { hrefToDeepLink } from './notification-deeplink';
import { cacheNotificationPayload } from './notification-payload-cache';

const SMALL_ICON = 'ic_notification';
const BRAND_COLOR = '#27BB97';

function resolveLargeIcon(
  type: string,
  payload: RichNotificationPayload,
): string | undefined {
  if (payload.iconUrl?.trim()) return payload.iconUrl.trim();
  if (payload.senderPhoto?.trim()) return payload.senderPhoto.trim();
  if (type === 'message') return 'ic_notif_message';
  if (
    type === 'offer_received'
    || type === 'offer_accepted'
    || type === 'offer_rejected'
    || type === 'new_listing'
    || type === 'listing_saved'
    || type === 'price_drop'
  ) {
    return 'ic_notif_product';
  }
  return 'ic_listifys_logo';
}

/** Notifee requires every data value to be a non-empty string. */
function toNotifeeData(payload: RichNotificationPayload): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value == null || value === '') continue;
    out[key] = String(value);
  }
  return out;
}

/** Build iOS config without undefined fields (Notifee rejects undefined attachments). */
function buildIosConfig(
  payload: RichNotificationPayload,
  options?: { categoryId?: string; imageUrl?: string },
) {
  if (Platform.OS !== 'ios') return undefined;

  const { sound, badge, type } = payload;
  const imageUrl = options?.imageUrl ?? payload.imageUrl;
  const ios: {
    sound?: string;
    badgeCount?: number;
    categoryId?: string;
    attachments?: IOSNotificationAttachment[];
  } = {
    sound: sound ?? 'default',
    categoryId: options?.categoryId ?? type,
  };

  if (badge) {
    const count = parseInt(badge, 10);
    if (!Number.isNaN(count)) ios.badgeCount = count;
  }

  if (imageUrl) {
    ios.attachments = [{ url: imageUrl, typeHint: 'public.image' }];
  }

  return ios;
}

// ─────────────────────────────────────────────────────────────────────────────
// displayRichNotification
// Called from: background message handler, foreground message handler
// ─────────────────────────────────────────────────────────────────────────────
export async function displayRichNotification(
  data: Record<string, string>,
): Promise<void> {
  const payload = data as unknown as RichNotificationPayload;
  const { type, title, body } = payload;

  if (!title?.trim() || !body?.trim()) return; // guard: malformed payload
  if (type === 'silent') return;               // data-only — nothing to show

  if (type === 'incoming_call') {
    await displayCallNotification(payload);
    return;
  }

  await displayStandardNotification(payload);
}

// ── Standard rich notification (all types except call) ───────────────────────
async function displayStandardNotification(
  payload: RichNotificationPayload,
): Promise<void> {
  const {
    notificationId,
    type,
    title,
    body,
    imageUrl,
    iconUrl,
    actions: actionsJson,
    groupKey,
    sound,
  } = payload;

  const channelId = channelForType(type ?? 'general');
  const notifId = notificationId ?? String(Date.now());
  const notifData = toNotifeeData(payload);
  const largeIcon = resolveLargeIcon(type ?? 'general', payload);
  const deepLink = (() => {
    const href = getHrefForNotificationPayload(payload);
    return href ? hrefToDeepLink(href) : undefined;
  })();
  const defaultPressAction = {
    id: 'default',
    launchActivity: 'default' as const,
    ...(deepLink ? { link: deepLink } : {}),
  };

  void cacheNotificationPayload(notifId, payload);

  // ── Parse CTA action buttons ─────────────────────────────────────────────
  let parsedActions: NotificationAction[] = [];
  try {
    if (actionsJson) parsedActions = JSON.parse(actionsJson);
  } catch { /* ignore */ }

  const androidActions: AndroidAction[] = parsedActions.map((a) => ({
    title: a.title,
    pressAction: {
      id: a.id,
      launchActivity: 'default',
      ...(deepLink ? { link: deepLink } : {}),
    },
  }));

  // ── Android-specific config ───────────────────────────────────────────────
  const android: AndroidNotification = {
    channelId,
    smallIcon: SMALL_ICON,
    color: BRAND_COLOR,
    importance: AndroidImportance.HIGH,
    visibility: AndroidVisibility.PRIVATE,
    ...(groupKey ? { groupId: groupKey } : {}),
    groupSummary: false,
    sound: sound ?? 'default',
    vibrationPattern: [300, 150, 300, 150],
    pressAction: defaultPressAction,
    actions: androidActions,
    largeIcon,
    style: imageUrl
      ? {
          type: AndroidStyle.BIGPICTURE,
          picture: imageUrl,
          largeIcon: imageUrl,
          summary: body,
        }
      : {
          type: AndroidStyle.BIGTEXT,
          text: body,
        },
  };

  const ios = buildIosConfig(payload, { imageUrl });

  // ── Post a summary notification when groupKey is set (collapsed count) ───
  if (groupKey) {
    try {
      await notifee.displayNotification({
        id: `grp_${groupKey}`,
        title,
        body: 'New notifications',
        data: notifData,
        ...(ios ? { ios } : {}),
        android: {
          channelId,
          smallIcon: SMALL_ICON,
          color: BRAND_COLOR,
          largeIcon: 'ic_listifys_logo',
          groupId: groupKey,
        groupSummary: true,
        importance: AndroidImportance.LOW,
        pressAction: defaultPressAction,
        },
      });
    } catch (err) {
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.warn('[Notifications] Group summary display failed:', err);
      }
    }
  }

  // ── Display the notification ──────────────────────────────────────────────
  try {
    await notifee.displayNotification({
      id: notifId,
      title,
      body,
      data: notifData,
      ...(ios ? { ios } : {}),
      android,
    });
  } catch (err) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn('[Notifications] Rich display failed, using fallback:', err);
    }
    await notifee.displayNotification({
      id: notifId,
      title,
      body,
      data: notifData,
      android: {
        channelId,
        smallIcon: SMALL_ICON,
        color: BRAND_COLOR,
        largeIcon: 'ic_listifys_logo',
        importance: AndroidImportance.HIGH,
        pressAction: { id: 'default', launchActivity: 'default' },
      },
    });
  }

  if (__DEV__) {
    devLog('[Notifications] Displayed', { type, notifId, conversationId: payload.conversationId, deepLink });
  }

  // Fire-and-forget analytics
  if (notificationId && isPersistedNotificationId(notificationId)) {
    trackNotificationEvent({
      notificationId,
      event: 'shown',
      timestamp: Date.now(),
    }).catch(() => {});
  }
}

// ── WhatsApp/full-screen incoming call notification ───────────────────────────
async function displayCallNotification(
  payload: RichNotificationPayload,
): Promise<void> {
  const { notificationId, callerName, callerPhoto, callType } = payload;

  const channelId = CHANNEL.CALLS;
  const title = `📞 ${callerName ?? 'Unknown'} is calling`;
  const body = callType === 'video' ? 'Incoming video call' : 'Incoming audio call';
  const notifId = notificationId ?? `call_${Date.now()}`;
  const notifData = toNotifeeData(payload);
  const ios = buildIosConfig(payload, { categoryId: 'incoming_call' });

  await notifee.displayNotification({
    id: notifId,
    title,
    body,
    data: notifData,
    ...(ios ? { ios } : {}),
    android: {
      channelId,
      smallIcon: SMALL_ICON,
      color: BRAND_COLOR,
      largeIcon: 'ic_listifys_logo',
      importance: AndroidImportance.HIGH,
      visibility: AndroidVisibility.PUBLIC,
      category: AndroidCategory.CALL,
      sound: 'default',
      vibrationPattern: [500, 200, 500, 200, 500, 200],
      pressAction: { id: 'default', launchActivity: 'default' },
      fullScreenAction: { id: 'default', launchActivity: 'default' },
      actions: [
        {
          title: '✅ Accept',
          pressAction: { id: 'accept', launchActivity: 'default' },
        },
        {
          title: '❌ Reject',
          pressAction: { id: 'reject' },
        },
      ],
      ...(callerPhoto ? { largeIcon: callerPhoto } : {}),
    },
  });
}

// ── Register iOS notification categories (call action buttons) ────────────────
export async function registerIOSCategories(): Promise<void> {
  if (Platform.OS !== 'ios') return;

  await notifee.setNotificationCategories([
    {
      id: 'incoming_call',
      actions: [
        { id: 'accept', title: '✅ Accept' },
        { id: 'reject', title: '❌ Reject', destructive: true },
      ],
    },
    {
      id: 'offer_received',
      actions: [
        { id: 'view_offer', title: '👀 View Offer' },
        { id: 'add_to_cart', title: '🛒 Add to Cart' },
      ],
    },
    {
      id: 'price_drop',
      actions: [
        { id: 'open_product', title: '🏷️ View Deal' },
      ],
    },
    {
      id: 'promotion',
      actions: [
        { id: 'view_offer', title: '🎁 View Offer' },
      ],
    },
    {
      id: 'new_listing',
      actions: [
        { id: 'open_listing', title: '👀 View listing' },
      ],
    },
    {
      id: 'engagement_digest',
      actions: [
        { id: 'browse', title: '🔍 Browse now' },
      ],
    },
    {
      id: 're_engagement',
      actions: [
        { id: 'browse', title: '👀 See deals' },
      ],
    },
    {
      id: 'message',
      actions: [
        { id: 'reply', title: '💬 Reply' },
      ],
    },
  ]);
}

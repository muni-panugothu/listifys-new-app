/**
 * Notification system — shared TypeScript types.
 * Used by the display layer, deep-link handler, analytics, and the hook.
 */

// ── Notification category / type ──────────────────────────────────────────────
export type NotificationType =
  | 'incoming_call'
  | 'message'
  | 'offer_received'
  | 'offer_accepted'
  | 'offer_rejected'
  | 'order_update'
  | 'booking_created'
  | 'booking_confirmed'
  | 'booking_completed'
  | 'booking_cancelled'
  | 'review_received'
  | 'follow'
  | 'listing_saved'
  | 'listing_sold'
  | 'new_listing'
  | 'organizer_new_event'
  | 'price_drop'
  | 'promotion'
  | 'flash_sale'
  | 'security_alert'
  | 'engagement_digest'
  | 're_engagement'
  | 'system'
  | 'silent'; // data-only, no visible notification

// ── CTA action button attached to a notification ──────────────────────────────
export interface NotificationAction {
  /** Unique identifier, e.g. 'add_to_cart', 'view_offer', 'open_product' */
  id: string;
  /** Label shown on the button */
  title: string;
  /** Route to navigate when this action is pressed (optional override) */
  route?: string;
  /** Route params as key-value map */
  params?: Record<string, string>;
  /** If true, this action is destructive (shown differently on iOS) */
  destructive?: boolean;
}

/**
 * The full rich notification payload that travels as FCM `data` fields.
 * All values must be strings (FCM data limitation).
 */
export interface RichNotificationPayload {
  /** Notification type — controls channel, display style, and deep link */
  type: NotificationType | string;
  /** MongoDB _id of the Notification document — used for analytics */
  notificationId: string;
  /** Title shown in notification */
  title: string;
  /** Body text */
  body: string;

  // ── Media ─────────────────────────────────────────────────────────────────
  /** Big picture / banner image URL */
  imageUrl?: string;
  /** Sender avatar / icon URL */
  iconUrl?: string;

  // ── Routing ───────────────────────────────────────────────────────────────
  /** Explicit expo-router path, e.g. '/listing-detail-template' */
  route?: string;
  /** JSON-encoded Record<string,string> of route params */
  params?: string;

  // ── CTA actions ──────────────────────────────────────────────────────────
  /** JSON-encoded NotificationAction[] */
  actions?: string;

  // ── Grouping ─────────────────────────────────────────────────────────────
  /** Group key for collapsing related notifications, e.g. 'messages' */
  groupKey?: string;

  // ── Sound / badge ─────────────────────────────────────────────────────────
  /** Android: custom sound file name (without extension), or 'default' */
  sound?: string;
  /** iOS: badge count to display on app icon */
  badge?: string;

  // ── Common contextual metadata ────────────────────────────────────────────
  /** userId of the user who triggered the notification */
  senderId?: string;
  senderName?: string;
  senderPhoto?: string;

  /** Listing context */
  listingId?: string;
  listingType?: string;
  listingTitle?: string;
  listingImage?: string;

  /** Conversation context */
  conversationId?: string;

  /** Call context */
  callId?: string;
  callType?: string;
  callerName?: string;
  callerPhoto?: string;
  offer?: string; // JSON-encoded WebRTC offer
  from?: string;  // caller userId

  /** Booking context */
  bookingId?: string;

  /** Follower context */
  followerId?: string;

  // ── Scheduling (resolved server-side, not needed on client) ──────────────
  [key: string]: string | undefined;
}

// ── Analytics ─────────────────────────────────────────────────────────────────
export type NotificationEvent =
  | 'shown'
  | 'clicked'
  | 'action_clicked'
  | 'dismissed';

export interface NotificationAnalyticsPayload {
  notificationId: string;
  event: NotificationEvent;
  actionId?: string;
  timestamp: number;
}

// ── Permission status ─────────────────────────────────────────────────────────
export type PermissionStatus = 'granted' | 'denied' | 'provisional' | 'unknown';

/**
 * NotificationProvider
 *
 * Boots the entire notification system:
 *   1. Creates Android notification channels
 *   2. Registers iOS categories
 *   3. Handles app-opened-from-notification (quit state)
 *   4. Attaches the useNotifications hook
 *
 * Bootstrap functions (background handlers) are exported for module-level
 * call in app/_layout.tsx — they MUST run before the first React render.
 */
import { useEffect, type ReactNode } from 'react';
// Lazy-load native Firebase/Notifee modules to avoid crashing in Expo Go
let notifee: any = null;
let messaging: any = null;
try {
  const notifeeMod = require('@notifee/react-native');
  notifee = notifeeMod.default;
  messaging = require('@react-native-firebase/messaging').default;
} catch {
  // Expo Go — native modules unavailable
}
import { displayRichNotification, registerIOSCategories } from '@/lib/notifications/notification-service';
import { createAllChannels } from '@/lib/notifications/channels';
import { navigateFromNotification } from '@/lib/notifications/deep-link-handler';
import { handleNotificationInteraction } from '@/lib/notifications/notification-interaction';
import { useNotifications } from '@/hooks/use-notifications';
import type { RichNotificationPayload } from '@/lib/notifications/types';

// ─────────────────────────────────────────────────────────────────────────────
// MODULE-LEVEL BOOTSTRAP  (call in app/_layout.tsx OUTSIDE any component)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register FCM background + quit message handler and Notifee background event
 * handler. Must be called at module level before any React tree renders.
 */
export function bootstrapNotifications(): void {
  if (!messaging || !notifee) return; // Expo Go guard

  messaging().setBackgroundMessageHandler(async (remoteMessage: any) => {
    const data = remoteMessage.data as Record<string, string> | undefined;
    if (!data) return;

    if (data.type === 'incoming_call') {
      await displayRichNotification(data);
      return;
    }
    if (data.type === 'silent') return;

    await displayRichNotification(data);
  });

  notifee.onBackgroundEvent(async ({ type, detail }) => {
    const data = (detail.notification?.data ?? {}) as RichNotificationPayload;

    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.info('[Notifications] Background event', {
        type,
        id: detail.notification?.id,
        actionId: detail.pressAction?.id,
      });
    }

    await handleNotificationInteraction(type, data, {
      notifId: detail.notification?.id,
      actionId: detail.pressAction?.id,
    });
  });

  notifee.onForegroundEvent(({ type, detail }) => {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.info('[Notifications] Foreground event (bootstrap)', {
        type,
        id: detail.notification?.id,
        actionId: detail.pressAction?.id,
        dataKeys: Object.keys(detail.notification?.data ?? {}),
      });
    }

    const data = (detail.notification?.data ?? {}) as RichNotificationPayload;

    void handleNotificationInteraction(type, data, {
      notifId: detail.notification?.id,
      actionId: detail.pressAction?.id,
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// REACT PROVIDER COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface NotificationProviderProps {
  children: ReactNode;
}

export function NotificationProvider({ children }: NotificationProviderProps) {
  useNotifications();

  useEffect(() => {
    createAllChannels().catch(() => {});
    registerIOSCategories().catch(() => {});
  }, []);

  // FCM background tap (backup when notification opened from system tray).
  useEffect(() => {
    if (!messaging) return;
    try {
      const unsubOpened = messaging().onNotificationOpenedApp((remoteMessage: any) => {
        if (!remoteMessage?.data) return;
        const data = remoteMessage.data as RichNotificationPayload;
        if (data.type !== 'incoming_call' && data.type !== 'silent') {
          navigateFromNotification(data);
        }
      });

      // Cold start: app launched from FCM system notification (killed state).
      void messaging()
        .getInitialNotification()
        .then((remoteMessage: any) => {
          const data = remoteMessage?.data as RichNotificationPayload | undefined;
          if (!data?.type || data.type === 'silent') return;
          navigateFromNotification(data);
        })
        .catch(() => {});

      return unsubOpened;
    } catch {
      return undefined;
    }
  }, []);

  return <>{children}</>;
}

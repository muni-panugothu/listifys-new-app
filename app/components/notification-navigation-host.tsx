/**
 * Flushes queued notification deep-links once navigation + auth are ready.
 */
import { useRootNavigationState, useRouter as useExpoRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { useCallback, useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import type { Href } from '@/lib/safe-router';
import { navigateFromNotification } from '@/lib/notifications/deep-link-handler';
import { deepLinkToHref } from '@/lib/notifications/notification-deeplink';
import {
  hasPendingNotificationNavigation,
  queueNotificationNavigation,
  subscribePendingNotificationNavigation,
  takePendingNotificationNavigation,
} from '@/lib/notifications/pending-notification-navigation';
import {
  consumePersistedNotificationNavigation,
  peekPersistedNotificationNavigation,
} from '@/lib/notifications/pending-notification-storage';
import type { RichNotificationPayload } from '@/lib/notifications/types';
import { devLog } from '@/lib/dev-log';
import { useAppSelector } from '@/store/hooks';

let notifee: any = null;
try {
  notifee = require('@notifee/react-native').default;
} catch {
  /* Expo Go */
}

export function NotificationNavigationHost() {
  const router = useExpoRouter();
  const rootState = useRootNavigationState();
  const { isAuthenticated, sessionHydrated } = useAppSelector((s) => s.auth);
  const initialCheckedRef = useRef(false);

  const canNavigate = Boolean(rootState?.key && sessionHydrated && isAuthenticated);

  const flush = useCallback(async () => {
    if (!canNavigate) return;

    let href = takePendingNotificationNavigation();
    if (!href) {
      href = await consumePersistedNotificationNavigation();
    }
    if (!href) return;

    if (__DEV__) {
      devLog('[Notifications] Flushing navigation:', href);
    }

    router.push(href as Href);
  }, [canNavigate, router]);

  // Flush as soon as navigation is ready — no artificial debounce.
  // The splash screen already routed to the notification target if there was
  // one queued at cold start; this effect handles the remaining background /
  // warm-start cases where the queue fills after canNavigate becomes true.
  useEffect(() => {
    if (!canNavigate) return;
    void flush();
  }, [canNavigate, flush]);

  useEffect(() => subscribePendingNotificationNavigation(() => {
    void flush();
  }), [flush]);

  useEffect(() => {
    const onAppState = (state: AppStateStatus) => {
      if (state === 'active') {
        void flush();
        if (!notifee) return;
        void notifee.getInitialNotification().then((initial: any) => {
          const data = initial?.notification?.data as RichNotificationPayload | undefined;
          if (!data?.type) return;
          if (__DEV__) {
            devLog('[Notifications] getInitialNotification on resume', data.type);
          }
          navigateFromNotification(data);
          void flush();
        });
      }
    };
    const sub = AppState.addEventListener('change', onAppState);
    return () => sub.remove();
  }, [flush]);

  // Deep-link fallback: Notifee pressAction.link opens listifyapp:// URLs.
  const handleDeepLink = useCallback(
    (url: string | null) => {
      if (!url || !canNavigate) return;

      const href = deepLinkToHref(url);
      if (!href) return;

      if (__DEV__) {
        devLog('[Notifications] Deep link opened:', { url, href });
      }

      queueNotificationNavigation(href);
      router.push(href as Href);
    },
    [canNavigate, router],
  );

  useEffect(() => {
    if (!canNavigate) return;

    void Linking.getInitialURL().then(handleDeepLink);
    const sub = Linking.addEventListener('url', ({ url }) => handleDeepLink(url));
    return () => sub.remove();
  }, [canNavigate, handleDeepLink]);

  // Cold start: read Notifee initial notification once navigation is ready.
  // Shortened the retry schedule from [0, 150, 400, 800, 1500] (up to 2.85s)
  // to [0, 200] (up to 200ms). The notifee payload is reliably available by
  // the time canNavigate is true; the long retry was masking the auth/nav
  // hydration delay we already fixed elsewhere.
  useEffect(() => {
    if (!canNavigate || !notifee || initialCheckedRef.current) return;
    initialCheckedRef.current = true;

    let cancelled = false;
    const delays = [0, 200];

    const checkInitial = async (index: number) => {
      if (cancelled || index >= delays.length) return;

      try {
        const initial = await notifee.getInitialNotification();
        const data = initial?.notification?.data as RichNotificationPayload | undefined;

        if (data?.type) {
          navigateFromNotification(data);
          await flush();
          return;
        }
      } catch {
        /* retry */
      }

      setTimeout(() => {
        void checkInitial(index + 1);
      }, delays[index] ?? 200);
    };

    void checkInitial(0);

    return () => {
      cancelled = true;
    };
  }, [canNavigate, flush]);

  // Also flush any persisted href left by the headless background handler.
  useEffect(() => {
    if (!canNavigate) return;

    void (async () => {
      const persisted = await peekPersistedNotificationNavigation();
      if (persisted) {
        if (__DEV__) {
          devLog('[Notifications] Found persisted navigation on mount');
        }
        await flush();
      }
    })();
  }, [canNavigate, flush]);

  return null;
}

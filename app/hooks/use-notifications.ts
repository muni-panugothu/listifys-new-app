/**
 * useNotifications — React hook.
 *
 * Wires up:
 *  1. FCM token registration + refresh subscription
 *  2. FCM foreground message handler
 *
 * Notifee tap handling lives in NotificationProvider (always active).
 */
import { useEffect, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
// Lazy-load to avoid crash when google-services.json is missing.
let messaging: (() => any) | null = null;
try {
  messaging = require("@react-native-firebase/messaging").default;
} catch {
  /* Expo Go */
}
import { getSettingsPreferences } from "@/features/auth/services/auth-api";
import { useAppSelector } from "@/store/hooks";
import { store } from "@/store";
import { incomingCallReceived } from "@/store/slices/call-slice";
import {
  checkPermission,
  deleteFCMToken,
  subscribeTokenRefresh,
} from "@/lib/notifications/token-manager";
import {
  hydratePushEnabledCache,
  setCachedPushEnabled,
  subscribePushEnabledChange,
} from "@/lib/notifications/push-preference";
import { syncFcmTokenWithServer } from "@/lib/notifications/sync-fcm-token";
import { displayRichNotification } from "@/lib/notifications/notification-service";
import { navigateFromNotification } from "@/lib/notifications/deep-link-handler";
import type { RichNotificationPayload } from "@/lib/notifications/types";

export function useNotifications() {
  const isAuthenticated = useAppSelector((s) => s.auth.isAuthenticated);
  const sessionHydrated = useAppSelector((s) => s.auth.sessionHydrated);
  const enabled = isAuthenticated && sessionHydrated;

  // null = still loading; use cached default quickly so token sync is not blocked.
  const [pushEnabled, setPushEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;

    const loadPreference = async () => {
      const cached = await hydratePushEnabledCache();

      if (!enabled) {
        if (active) setPushEnabled(false);
        return;
      }

      // Don't wait for the server — register with cached preference first.
      if (active) setPushEnabled(cached);

      try {
        const response = await getSettingsPreferences();
        await setCachedPushEnabled(response.preferences.pushNotifications);
        if (active) setPushEnabled(response.preferences.pushNotifications);
      } catch {
        if (active) setPushEnabled(cached);
      }
    };

    void loadPreference();

    const unsub = subscribePushEnabledChange((value) => {
      if (active) setPushEnabled(value);
    });

    return () => {
      active = false;
      unsub();
    };
  }, [enabled]);

  // ── Token registration (silent — never prompts OS dialog here) ───────────
  useEffect(() => {
    if (!enabled || pushEnabled === null) return;

    if (!pushEnabled) {
      void deleteFCMToken();
      return;
    }

    const syncIfGranted = async () => {
      const permission = await checkPermission();
      if (permission === "granted" || permission === "provisional") {
        void syncFcmTokenWithServer({ force: true, promptPermission: false });
      }
    };

    void syncIfGranted();

    const unsubRefresh = subscribeTokenRefresh(() => {
      void syncFcmTokenWithServer({ force: true, promptPermission: false });
    });

    const onAppState = (state: AppStateStatus) => {
      if (state === "active") {
        void syncIfGranted();
      }
    };
    const appStateSub = AppState.addEventListener("change", onAppState);

    return () => {
      unsubRefresh();
      appStateSub.remove();
    };
  }, [enabled, pushEnabled]);

  // ── FCM foreground message handler ───────────────────────────────────────
  useEffect(() => {
    if (!enabled || pushEnabled !== true) return;
    if (!messaging) return;

    try {
      return messaging().onMessage(async (remoteMessage: any) => {
        const data = remoteMessage.data as Record<string, string> | undefined;
        if (!data) return;

        const callStatus = store.getState().call.status;

        if (data.type === "incoming_call") {
          if (callStatus === "incoming" || callStatus === "active") return;
          store.dispatch(
            incomingCallReceived({
              callId: data.callId ?? "",
              remoteUserId: data.from ?? "",
              remoteUserName: data.callerName ?? "Unknown",
              remoteUserPhoto: data.callerPhoto ?? "",
              callType: (data.callType as "audio" | "video") ?? "audio",
              offer: safeParseOffer(data.offer),
            }),
          );
          navigateFromNotification({ ...data, route: "/incoming-call" } as RichNotificationPayload);
          return;
        }

        if (data.type !== "silent") {
          await displayRichNotification(data);
        }
      });
    } catch {
      return undefined;
    }
  }, [enabled, pushEnabled]);
}

function safeParseOffer(raw: string | undefined): object {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
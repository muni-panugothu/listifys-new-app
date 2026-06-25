/**
 * Prompts for notification permission only after the user reaches Home Feed.
 *
 * Swiggy / Zomato pattern: never interrupt Login or Onboarding — ask once
 * the user is on the main screen and has had a moment to orient.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@/lib/safe-router";
import { useCallback, useRef } from "react";

import { checkPermission } from "@/lib/notifications/token-manager";
import { syncFcmTokenWithServer } from "@/lib/notifications/sync-fcm-token";
import { useAppSelector } from "@/store/hooks";

const PROMPT_ASKED_KEY = "@listify/notification_prompt_asked";
/** Delay so location / feed paint first — avoids stacked system dialogs. */
const PROMPT_DELAY_MS = 1_500;

export function useHomeNotificationPrompt() {
  const isAuthenticated = useAppSelector((s) => s.auth.isAuthenticated);
  const sessionHydrated = useAppSelector((s) => s.auth.sessionHydrated);
  const inFlightRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (!sessionHydrated || !isAuthenticated) return;

      const timer = setTimeout(() => {
        if (inFlightRef.current) return;
        inFlightRef.current = true;

        void (async () => {
          try {
            const permission = await checkPermission();
            if (permission === "granted" || permission === "provisional") {
              await syncFcmTokenWithServer({ force: true, promptPermission: false });
              return;
            }

            const alreadyAsked = await AsyncStorage.getItem(PROMPT_ASKED_KEY);
            if (alreadyAsked === "1") {
              return;
            }

            await AsyncStorage.setItem(PROMPT_ASKED_KEY, "1");
            await syncFcmTokenWithServer({ force: true, promptPermission: true });
          } finally {
            inFlightRef.current = false;
          }
        })();
      }, PROMPT_DELAY_MS);

      return () => {
        clearTimeout(timer);
      };
    }, [isAuthenticated, sessionHydrated]),
  );
}

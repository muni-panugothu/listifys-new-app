import { type Href, useRouter } from "@/lib/safe-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef } from "react";
import { ActivityIndicator, Image, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { configureGoogleSignIn } from "@/lib/google-sign-in";
import { useAppDispatch } from "@/store/hooks";
import { store } from "@/store";
import { getAccessToken, getRefreshToken, restoreTokens } from "@/features/auth/services/auth-api";
import { restoreSession } from "@/store/slices/auth-slice";
import { checkOnboarding } from "@/store/slices/onboarding-slice";
import {
  hasPendingNotificationNavigation,
  takePendingNotificationNavigation,
} from "@/lib/notifications/pending-notification-navigation";
import { consumePersistedNotificationNavigation } from "@/lib/notifications/pending-notification-storage";

const HOME_ROUTE = "/(tabs)/home-feed-root" as Href;

export function SplashScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const hasNavigatedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      try {
        await dispatch(checkOnboarding());
        const sessionResult = await dispatch(restoreSession());
        await configureGoogleSignIn().catch(() => {});

        if (cancelled) return;

        const authenticated =
          restoreSession.fulfilled.match(sessionResult) &&
          sessionResult.payload.isAuthenticated;

        await finishNavigation(authenticated);
      } catch {
        if (cancelled) return;
        await restoreTokens().catch(() => {});
        const hasTokens = Boolean(getAccessToken() || getRefreshToken());
        await finishNavigation(hasTokens);
      }
    };

    const finishNavigation = async (authenticated: boolean) => {
      if (hasNavigatedRef.current) return;
      hasNavigatedRef.current = true;

      if (authenticated) {
        // Cold-start notification routing: if the user launched the app by
        // tapping a notification (or via a deep link queued by the notifee
        // background handler), navigate STRAIGHT to that target — don't bounce
        // through HOME first. Saves an entire route transition (~300–400ms)
        // and avoids loading home-feed data the user isn't going to look at.
        let target: Href | null = null;
        if (hasPendingNotificationNavigation()) {
          target = takePendingNotificationNavigation();
        }
        if (!target) {
          try {
            target = await consumePersistedNotificationNavigation();
          } catch {
            target = null;
          }
        }
        router.replace(target ?? HOME_ROUTE);
        return;
      }

      // Always show onboarding when not authenticated — covers:
      // • new users (first launch)
      // • users who logged out and restarted the app
      router.replace("/onboarding-slide-3" as Href);
    };

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [dispatch, router]);

  return (
    <View
      className="flex-1 items-center justify-center bg-white"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      <StatusBar style="dark" />

      <Image
        source={require("../../../assets/splashscreenImg/splashImg.png")}
        className="h-52 w-52"
        resizeMode="contain"
      />

      <View className="mt-8">
        <ActivityIndicator size="large" color="#111827" />
      </View>
    </View>
  );
}

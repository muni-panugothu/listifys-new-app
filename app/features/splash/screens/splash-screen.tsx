import { type Href, useRouter } from "@/lib/safe-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef } from "react";
import { ActivityIndicator, Image, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { configureGoogleSignIn } from "@/lib/google-sign-in";
import { ensureSessionRestored } from "@/lib/session-bootstrap";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { store } from "@/store";
import {
  checkFirstInstallIntro,
  checkOnboarding,
} from "@/store/slices/onboarding-slice";
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
        await Promise.all([
          dispatch(checkOnboarding()),
          dispatch(checkFirstInstallIntro()),
        ]);
        await ensureSessionRestored(dispatch);
        await configureGoogleSignIn().catch(() => {});

        if (cancelled) return;

        const authenticated = Boolean(
          store.getState().auth.isAuthenticated &&
            store.getState().auth.sessionHydrated,
        );

        await finishNavigation(authenticated);
      } catch {
        if (cancelled) return;
        try {
          await ensureSessionRestored(dispatch);
        } catch {
          // ignore — finishNavigation uses hydrated auth state when available
        }
        const { isAuthenticated, sessionHydrated } = store.getState().auth;
        await finishNavigation(Boolean(sessionHydrated && isAuthenticated));
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

      const { hasCompletedFirstInstallIntro } = store.getState().onboarding;

      if (hasCompletedFirstInstallIntro === false) {
        router.replace("/first-install-onboarding" as Href);
        return;
      }

      // Returning / logged-out users — existing auth welcome screen.
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

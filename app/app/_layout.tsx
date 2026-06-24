import { AuthGateBottomSheet } from "@/features/auth/components/auth-gate-bottom-sheet";
import { TopSaveToast } from "@/components/top-save-toast";
import { AppMessageModal } from "@/components/app-message-modal";
import { PageTransitionLoader } from "@/components/page-transition-loader";
import { NetworkStatusLayer } from "@/lib/network-status-layer";
import { subscribeToasts, type AppToastPayload } from "@/lib/toast";
import { initOfflineQueue } from "@/lib/offline-queue";
import {
    DarkTheme,
    DefaultTheme,
    ThemeProvider,
} from "@react-navigation/native";
import { subscribeRouteTransitions, type Href, Stack, useRouter } from "@/lib/safe-router";
import { usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef, useState } from "react";
import "react-native-gesture-handler";
import "react-native-reanimated";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Provider } from "react-redux";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { KeyboardProvider } from "@/lib/safe-keyboard-controller";
import "../global.css";

import { ListifyFonts } from "@/constants/typography";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { LocaleProvider } from "@/providers/locale-provider";
import { TypographyProvider } from "@/providers/typography-provider";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { hideAuthGate } from "@/store/slices/auth-gate-slice";
import { logout } from "@/store/slices/auth-slice";
import { hydrateAppLocation } from "@/store/slices/location-slice";
import { store } from "@/store";
import { NotificationProvider } from "@/providers/notification-provider";
import { NotificationNavigationHost } from "@/components/notification-navigation-host";
import { connectSocket, getSocket, disconnectSocket } from "@/features/messaging/services/socket-service";

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Provider store={store}>
        <KeyboardProvider statusBarTranslucent navigationBarTranslucent preserveEdgeToEdge>
          <TypographyProvider>
            <LocaleProvider>
              <NotificationProvider>
                <AppLayout />
              </NotificationProvider>
            </LocaleProvider>
          </TypographyProvider>
        </KeyboardProvider>
      </Provider>
    </GestureHandlerRootView>
  );
}

/**
 * Paths that should NOT show the page-transition loader.
 * Auth screens, modals, onboarding, and the tabs root are excluded.
 */
const SKIP_LOADER_PATHS = new Set([
  '/',
  '/sign-in',
  '/sign-up',
  '/forgot-password',
  '/new-password',
  '/otp-verification',
  '/reset-otp-verification',
  '/mobile',
  '/mobile-auth',
  '/onboarding-slide-1',
  '/onboarding-slide-2',
  '/onboarding-slide-3',
  '/create-offer-modal',
  '/report-listing-modal',
  '/logout-modal',
  '/listing-success',
  '/listing-draft-saved',
  '/location-picker',
  '/change-password',
  '/search-results-entity-tabs',
  '/my-listings-active',
  '/outgoing-call',
  '/incoming-call',
  '/active-call',
]);

const LOADER_FAILSAFE_MS = 1200;

function AppLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { visible, action, redirectTo } = useAppSelector((state) => state.authGate);
  const { isAuthenticated, sessionHydrated } = useAppSelector((s) => s.auth);
  const [toastPayload, setToastPayload] = useState<AppToastPayload | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastKey, setToastKey] = useState(0);

  // ── Page transition loader ──────────────────────────────────────────────
  const pathname = usePathname();
  const prevPathRef = useRef(pathname);
  const loadTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const loaderStartedAtRef = useRef<number | null>(null);
  const [pageLoading, setPageLoading] = useState(false);

  const clearLoaderTimers = useCallback(() => {
    clearTimeout(loadTimerRef.current);
  }, []);

  const startPageLoader = useCallback((nextPath: string | null) => {
    if (nextPath && SKIP_LOADER_PATHS.has(nextPath)) return;

    clearLoaderTimers();
    loaderStartedAtRef.current = Date.now();
    setPageLoading(true);

    // Safety net for unexpected interrupted navigations.
    loadTimerRef.current = setTimeout(() => {
      setPageLoading(false);
      loaderStartedAtRef.current = null;
    }, LOADER_FAILSAFE_MS);
  }, [clearLoaderTimers]);

  const finishPageLoader = useCallback(() => {
    clearLoaderTimers();
    setPageLoading(false);
    loaderStartedAtRef.current = null;
  }, [clearLoaderTimers]);

  useEffect(() => {
    const unsubscribe = subscribeRouteTransitions(({ nextPath, action }) => {
      // Back navigation already has a slide-out animation — no loader needed.
      if (action === 'back') return;
      startPageLoader(nextPath);
    });

    return unsubscribe;
  }, [startPageLoader]);

  useEffect(() => {
    if (prevPathRef.current !== pathname) {
      prevPathRef.current = pathname;
      if (pageLoading) {
        finishPageLoader();
      }
    }
  }, [finishPageLoader, pageLoading, pathname]);

  // Clean up safety-net timer on unmount
  useEffect(() => clearLoaderTimers, [clearLoaderTimers]);

  useEffect(() => {
    const unsubscribe = subscribeToasts((payload) => {
      setToastVisible(false);
      setToastPayload(payload);
      setToastKey((prev) => prev + 1);
      setTimeout(() => setToastVisible(true), 0);
    });

    return unsubscribe;
  }, []);

  // Initialise offline queue — loads persisted items from AsyncStorage on mount.
  useEffect(() => {
    void initOfflineQueue();
  }, []);

  // Restore saved location from storage only — permission prompt runs on home feed.
  useEffect(() => {
    if (!sessionHydrated) return;
    void dispatch(hydrateAppLocation());
  }, [dispatch, sessionHydrated]);

  // ── Attach call socket listeners after session hydration ─────────────────
  // We wait for sessionHydrated + isAuthenticated so the socket connects with
  // a valid (or freshly-refreshed) access token instead of an expired one.
  useEffect(() => {
    if (!sessionHydrated || !isAuthenticated) return;

    void connectSocket()
      .then(async () => {
        const { attachCallListeners } = await import('@/features/calling/services/call-socket-service');
        attachCallListeners();
        const { syncFcmTokenWithServer } = await import('@/lib/notifications/sync-fcm-token');
        void syncFcmTokenWithServer({ force: true });
      })
      .catch(() => {});
  }, [sessionHydrated, isAuthenticated]);

  // ── Real-time force-logout listener ───────────────────────────────────────
  // The server emits `auth:force_logout` to the user's socket room whenever
  // `POST /api/auth/logout-all` is called from another device.
  // We listen here (in the root layout) so ALL screens are covered.
  useEffect(() => {
    if (!sessionHydrated || !isAuthenticated) return;

    const socket = getSocket();
    if (!socket) return;

    const handleForceLogout = () => {
      disconnectSocket();
      dispatch(logout());
      router.replace('/sign-in' as Href);
    };

    socket.on('auth:force_logout', handleForceLogout);
    return () => {
      socket.off('auth:force_logout', handleForceLogout);
    };
  }, [sessionHydrated, isAuthenticated, dispatch, router]);

  const handleCloseAuthGate = useCallback(() => {
    dispatch(hideAuthGate());
  }, [dispatch]);

  const handleAuthenticated = useCallback(() => {
    dispatch(hideAuthGate());
    if (redirectTo) {
      router.replace(redirectTo as Href);
    }
  }, [dispatch, redirectTo, router]);

  const authGateEmailSignInHref = useCallback(() => {
    if (!redirectTo) return "/sign-in" as Href;
    return {
      pathname: "/sign-in",
      params: { redirectTo },
    } as Href;
  }, [redirectTo]);

  const navigationTheme = colorScheme === "dark" ? DarkTheme : DefaultTheme;
  const themeWithFonts = {
    ...navigationTheme,
    fonts: {
      regular: { fontFamily: ListifyFonts.regular, fontWeight: "400" as const },
      medium: { fontFamily: ListifyFonts.medium, fontWeight: "500" as const },
      bold: { fontFamily: ListifyFonts.bold, fontWeight: "700" as const },
      heavy: { fontFamily: ListifyFonts.bold, fontWeight: "700" as const },
    },
  };

  return (
    <SafeAreaProvider>
      <ThemeProvider value={themeWithFonts}>
        <Stack
          screenOptions={{
            headerShown: false,
            animation: "slide_from_right",
            gestureEnabled: true,
            fullScreenGestureEnabled: true,
            animationMatchesGesture: true,
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen
            name="onboarding-slide-1"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="onboarding-slide-2"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="onboarding-slide-3"
            options={{ headerShown: false }}
          />
          <Stack.Screen name="sign-in" options={{ headerShown: false }} />
          <Stack.Screen name="sign-up" options={{ headerShown: false }} />
          <Stack.Screen
            name="forgot-password"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="reset-otp-verification"
            options={{ headerShown: false }}
          />
          <Stack.Screen name="new-password" options={{ headerShown: false }} />
          <Stack.Screen
            name="(tabs)"
            options={{ headerShown: false, animation: "fade" }}
          />
          <Stack.Screen
            name="category-listing-template"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="listing-detail-template"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="search-results-entity-tabs"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="nearby-map-view-bottom-sheet"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="services-category-hub"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="service-listing-grid"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="service-detail"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="properties-listing"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="property-detail"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="post-ad-step1-category"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="post-ad-step2-details"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="post-ad-step3-media"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="edit-listing"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="create-offer-modal"
            options={{ headerShown: false, presentation: "transparentModal", animation: "slide_from_bottom" }}
          />
          <Stack.Screen
            name="report-listing-modal"
            options={{ headerShown: false, presentation: "transparentModal", animation: "slide_from_bottom" }}
          />
          <Stack.Screen
            name="listing-success"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="listing-draft-saved"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="my-listings-active"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="my-listings-expired"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="my-listings-drafts"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="saved-items"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="followers-following"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="profile-details-edit"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="location-picker"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="messages-inbox"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="chat-conversation"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="notifications-center"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="devices"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="activity-log"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="app-settings"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="security"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="logout-modal"
            options={{ headerShown: false, presentation: "transparentModal", animation: "fade" }}
          />
          <Stack.Screen
            name="outgoing-call"
            options={{ headerShown: false, presentation: "fullScreenModal" }}
          />
          <Stack.Screen
            name="incoming-call"
            options={{ headerShown: false, presentation: "fullScreenModal" }}
          />
          <Stack.Screen
            name="active-call"
            options={{ headerShown: false, presentation: "fullScreenModal" }}
          />
        </Stack>
        <NotificationNavigationHost />
        <AuthGateBottomSheet
          visible={visible}
          onClose={handleCloseAuthGate}
          action={action}
          onAuthenticated={handleAuthenticated}
          emailSignInHref={authGateEmailSignInHref()}
        />
        {toastPayload ? (
          <TopSaveToast
            key={toastKey}
            visible={toastVisible}
            title={toastPayload.title}
            message={toastPayload.message}
            type={toastPayload.type}
            onHidden={() => setToastVisible(false)}
          />
        ) : null}
        <AppMessageModal />
        {/* Page-transition loading overlay (Zepto / OLX style) */}
        <PageTransitionLoader visible={pageLoading} />
        {/* Global real-time network status banner (offline / slow / back-online) */}
        <NetworkStatusLayer />
        <StatusBar style="auto" />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

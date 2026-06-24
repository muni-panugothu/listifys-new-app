import { usePathname, useRouter } from "@/lib/safe-router";
import { useNavigation } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import { useCallback, useRef } from "react";
import { Platform } from "react-native";

import { acquireNavigationLock, isNavigationLocked } from "@/lib/navigation-guard";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { showAuthGate, type AuthGateAction } from "@/store/slices/auth-gate-slice";

/** Expo Router hrefs for tabs (used outside the tab navigator). */
const TAB_ROUTES: Record<string, string> = {
  home: "/(tabs)/home-feed-root",
  sell: "/(tabs)/sell-entry",
  search: "/(tabs)/search-home",
  messages: "/messages-inbox",
  profile: "/(tabs)/dashboard-home",
};

/** React Navigation screen names inside the tabs layout. */
const TAB_SCREEN_NAMES: Record<string, string> = {
  home: "home-feed-root",
  sell: "sell-entry",
  search: "search-home",
  profile: "dashboard-home",
};

type AnyNavigation = {
  getState?: () => { type?: string; routeNames?: string[] } | undefined;
  getParent?: () => AnyNavigation | undefined;
  navigate: (...args: unknown[]) => void;
};

function getTabSegment(route: string) {
  return route.split("/").filter(Boolean).pop() ?? route;
}

function isTabRouteActive(pathname: string, target: string) {
  const segment = getTabSegment(target);
  return (
    pathname === target ||
    pathname.endsWith(`/${segment}`) ||
    pathname.includes(`/(tabs)/${segment}`)
  );
}

function findTabNavigator(navigation: AnyNavigation) {
  let current: AnyNavigation | undefined = navigation;

  while (current) {
    const state = current.getState?.() as
      | { type?: string; routeNames?: string[] }
      | undefined;
    const routeNames = state?.routeNames ?? [];

    const isMainTabsNavigator =
      state?.type === "tab" &&
      routeNames.includes("home-feed-root") &&
      routeNames.includes("search-home") &&
      routeNames.includes("sell-entry") &&
      routeNames.includes("dashboard-home");

    if (isMainTabsNavigator) {
      return current;
    }
    current = current.getParent?.();
  }

  return null;
}

const AUTH_GATED_TABS: Partial<Record<string, AuthGateAction>> = {
  messages: "messages",
};

const AUTH_REQUIRED_TABS = new Set<string>();

export function useTabNavigation(onAuthRequired?: () => void) {
  const router = useRouter();
  const navigation = useNavigation();
  const pathname = usePathname();
  const dispatch = useAppDispatch();
  const { isAuthenticated } = useAppSelector((state) => state.auth);
  const lastNavigationRef = useRef<{ target: string; timestamp: number } | null>(null);

  const handleTabPress = useCallback(
    (tabId: string) => {
      const target = TAB_ROUTES[tabId];
      const screenName = TAB_SCREEN_NAMES[tabId];
      if (!target || !screenName) return;

      if (AUTH_REQUIRED_TABS.has(tabId) && !isAuthenticated) {
        onAuthRequired?.();
        return;
      }

      if (isTabRouteActive(pathname, target)) return;
      if (isNavigationLocked()) return;

      const now = Date.now();
      const lastNavigation = lastNavigationRef.current;
      if (
        lastNavigation &&
        lastNavigation.target === target &&
        now - lastNavigation.timestamp < 800
      ) {
        return;
      }

      const authGateAction = AUTH_GATED_TABS[tabId];
      if (authGateAction && !isAuthenticated) {
        dispatch(showAuthGate({ action: authGateAction, redirectTo: target }));
        return;
      }

      lastNavigationRef.current = { target, timestamp: now };
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }

      const tabNavigator = findTabNavigator(navigation as unknown as AnyNavigation);
      if (tabNavigator) {
        const release = acquireNavigationLock(350);
        if (!release) return;
        tabNavigator.navigate(screenName);
        setTimeout(release, 350);
        return;
      }

      // When outside the tab navigator stack, push a concrete tab href.
      router.push(target as never);
    },
    [dispatch, isAuthenticated, navigation, onAuthRequired, pathname, router],
  );

  return handleTabPress;
}

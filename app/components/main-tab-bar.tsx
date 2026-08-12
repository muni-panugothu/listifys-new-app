import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useRouter } from "@/lib/safe-router";
import * as Haptics from "expo-haptics";
import { useCallback } from "react";
import { Platform } from "react-native";

import { FloatingBottomNav } from "@/components/floating-bottom-nav";
import type { BottomNavTabId } from "@/constants/bottom-nav-tabs";
import { openMarketplaceHub } from "@/lib/marketplace-hub-bus";

const ROUTE_TO_TAB: Record<string, BottomNavTabId> = {
  "home-feed-root": "home",
  "search-home": "search",
  "sell-entry": "sell",
  "dashboard-home": "profile",
};

const TAB_TO_ROUTE: Partial<Record<BottomNavTabId, string>> = {
  home: "home-feed-root",
  search: "search-home",
  sell: "sell-entry",
  profile: "dashboard-home",
};

function getRouteSegment(routeName: string) {
  return routeName.split("/").filter(Boolean).pop() ?? routeName;
}

export function MainTabBar({ state, navigation }: BottomTabBarProps) {
  const router = useRouter();

  const activeRouteName = state.routes[state.index]?.name ?? "home-feed-root";
  const activeTabId = ROUTE_TO_TAB[getRouteSegment(activeRouteName)] ?? "home";

  const handleTabPress = useCallback(
    (tabId: string) => {
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }

      if (tabId === "hotlists") {
        router.push("/saved-items" as never);
        return;
      }

      if (tabId === "home") {
        openMarketplaceHub();
        return;
      }

      const routeName = TAB_TO_ROUTE[tabId as BottomNavTabId];
      if (!routeName) return;

      if (ROUTE_TO_TAB[getRouteSegment(activeRouteName)] === tabId) return;

      const route = state.routes.find((r) => getRouteSegment(r.name) === routeName);
      const resolvedRouteName = route?.name ?? routeName;
      const event = navigation.emit({
        type: "tabPress",
        target: route?.key,
        canPreventDefault: true,
      });

      if (!event.defaultPrevented) {
        navigation.navigate(resolvedRouteName);
      }
    },
    [activeRouteName, navigation, router, state.routes],
  );

  return <FloatingBottomNav activeTabId={activeTabId} onTabPress={handleTabPress} />;
}

import type { MarketplaceHubTab } from "@/features/home/data/home-hub-tabs";
import type { Href, Router } from "@/lib/safe-router";

type TabNavigator = (tabId: string) => void;

/**
 * Navigate from the marketplace hub bottom sheet (Home feed + Events).
 */
export function navigateFromHubTab(
  tab: MarketplaceHubTab,
  router: Router,
  handleTabPress: TabNavigator,
) {
  if (tab.id === "home") {
    handleTabPress("home");
    return;
  }

  if (tab.id === "sell") {
    handleTabPress("sell");
    return;
  }

  if (tab.href) {
    router.push(tab.href as Href);
  }
}

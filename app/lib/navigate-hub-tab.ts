import type { AppHubTab } from "@/features/home/data/app-hub-tabs";
import type { Href } from "@/lib/safe-router";

type HubRouter = {
  push: (href: Href) => void;
  replace?: (href: Href) => void;
  back?: () => void;
  canGoBack?: () => boolean;
};

export function navigateHubTab(router: HubRouter, tab: AppHubTab): void {
  if (tab.id === "events" && tab.href) {
    if (router.canGoBack?.()) {
      router.back?.();
      return;
    }
    router.replace?.(tab.href) ?? router.push(tab.href);
    return;
  }

  if (tab.href) {
    router.push(tab.href);
  }
}

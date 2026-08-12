import { useCallback } from "react";

import { openMarketplaceHub } from "@/lib/marketplace-hub-bus";
import { useTabNavigation } from "@/lib/use-tab-navigation";

/**
 * Bottom nav handler: Home opens the marketplace hub sheet from any screen.
 */
export function useFloatingNavPress(onAuthRequired?: () => void) {
  const handleTabPress = useTabNavigation(onAuthRequired);

  return useCallback(
    (tabId: string) => {
      if (tabId === "home") {
        openMarketplaceHub();
        return;
      }
      handleTabPress(tabId);
    },
    [handleTabPress],
  );
}

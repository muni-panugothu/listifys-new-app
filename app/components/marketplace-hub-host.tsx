import { useCallback, useEffect, useState } from "react";

import { EventsHubSwitcherModal } from "@/features/events/components/events-hub-switcher-modal";
import { navigateFromHubTab } from "@/lib/navigate-from-hub-tab";
import { openMarketplaceHub, subscribeMarketplaceHubOpen } from "@/lib/marketplace-hub-bus";
import { useRouter } from "@/lib/safe-router";
import { useTabNavigation } from "@/lib/use-tab-navigation";

export { openMarketplaceHub };

function MarketplaceHubHostImpl() {
  const router = useRouter();
  const handleTabNavigation = useTabNavigation();
  const [visible, setVisible] = useState(false);

  useEffect(() => subscribeMarketplaceHubOpen(() => setVisible(true)), []);

  const handleHubSelect = useCallback(
    (tab: Parameters<typeof navigateFromHubTab>[0]) => {
      setVisible(false);
      navigateFromHubTab(tab, router, handleTabNavigation);
    },
    [handleTabNavigation, router],
  );

  return (
    <EventsHubSwitcherModal
      visible={visible}
      activeTab="home"
      onClose={() => setVisible(false)}
      onSelect={handleHubSelect}
    />
  );
}

export const MarketplaceHubHost = MarketplaceHubHostImpl;

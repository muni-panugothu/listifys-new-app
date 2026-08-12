type HubListener = () => void;

const openListeners = new Set<HubListener>();

export function subscribeMarketplaceHubOpen(listener: HubListener) {
  openListeners.add(listener);
  return () => openListeners.delete(listener);
}

export function openMarketplaceHub() {
  openListeners.forEach((listener) => listener());
}

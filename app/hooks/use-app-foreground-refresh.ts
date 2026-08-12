import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";

export type AppForegroundRefreshOptions = {
  /** Called when app returns to foreground and stale threshold elapsed. */
  onRefresh: () => void;
  /** Minimum ms between refresh calls. Default 30_000. */
  staleMs?: number;
  enabled?: boolean;
};

/**
 * Centralized foreground refresh — collapses AppState "active" bursts into
 * at most one callback per stale window (production pattern for feed refresh).
 */
export function useAppForegroundRefresh({
  onRefresh,
  staleMs = 30_000,
  enabled = true,
}: AppForegroundRefreshOptions) {
  const lastRefreshAtRef = useRef(0);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    if (!enabled) return;

    const handleChange = (next: AppStateStatus) => {
      if (next !== "active") return;
      const now = Date.now();
      if (now - lastRefreshAtRef.current < staleMs) return;
      lastRefreshAtRef.current = now;
      onRefreshRef.current();
    };

    const sub = AppState.addEventListener("change", handleChange);
    return () => sub.remove();
  }, [enabled, staleMs]);

  return {
    markFresh: () => {
      lastRefreshAtRef.current = Date.now();
    },
  };
}

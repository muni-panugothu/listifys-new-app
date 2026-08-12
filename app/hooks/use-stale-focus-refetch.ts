import { useFocusEffect } from "@/lib/safe-router";
import { useCallback, useRef } from "react";

export type StaleFocusRefetchOptions = {
  /** Minimum ms between background refetches while screen stays focused. Default 30_000. */
  staleMs?: number;
  /** Skip refetch on the first focus (initial mount is handled by useEffect). Default true. */
  skipInitialFocus?: boolean;
  /** When false, refetch is skipped entirely. */
  enabled?: boolean;
};

/**
 * Production focus-refetch: show cached UI instantly, refresh in background only when stale.
 * Avoids full-screen loading spinners and duplicate requests on every tab switch.
 */
export function useStaleFocusRefetch(
  refetch: () => void | Promise<void>,
  opts: StaleFocusRefetchOptions = {},
) {
  const {
    staleMs = 30_000,
    skipInitialFocus = true,
    enabled = true,
  } = opts;

  const lastFetchedAtRef = useRef(0);
  const isFirstFocusRef = useRef(true);

  const runRefetch = useCallback(
    (force = false) => {
      if (!enabled) return;
      const now = Date.now();
      if (!force && now - lastFetchedAtRef.current < staleMs) return;
      lastFetchedAtRef.current = now;
      void refetch();
    },
    [enabled, refetch, staleMs],
  );

  useFocusEffect(
    useCallback(() => {
      if (!enabled) return;
      if (skipInitialFocus && isFirstFocusRef.current) {
        isFirstFocusRef.current = false;
        return;
      }
      runRefetch(false);
    }, [enabled, runRefetch, skipInitialFocus]),
  );

  return {
    /** Force refresh (pull-to-refresh) — bypasses stale window. */
    forceRefetch: () => runRefetch(true),
    markFresh: () => {
      lastFetchedAtRef.current = Date.now();
    },
  };
}

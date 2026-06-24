/**
 * Predictive prefetch hooks.
 *
 * These wrap `enqueuePrefetch` with React lifecycle so cards / lists can
 * trigger imminent / scroll / idle prefetches with one-liners.
 *
 * Hook overview:
 *   - useVisibilityPrefetch(items) — fire "visible" prefetch as cards
 *     enter the viewport (paired with FlatList onViewableItemsChanged).
 *   - useIntentPrefetch() — call from `onPressIn` / long-press to fire
 *     a high-priority detail prefetch the moment the finger touches.
 *   - useScrollPagePrefetch(loadNextPage) — fires "scroll" prefetch
 *     when the user is within `thresholdPct` of the bottom of a list.
 *   - useIdlePrefetch(prefetcher) — runs while the app is idle.
 */

import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";

import { enqueuePrefetch } from "@/lib/prefetch/prefetch-queue";

// ── Intent prefetch (called from onPressIn / long-press) ─────────────────────

export function useIntentPrefetch() {
  return useCallback(
    (key: string, run: () => Promise<unknown>) => {
      enqueuePrefetch({ key, priority: 1, run });
    },
    [],
  );
}

// ── Visibility prefetch (cards in viewport) ──────────────────────────────────

type VisibilityPrefetchSpec = {
  key: string;
  run: () => Promise<unknown>;
};

export function useVisibilityPrefetch() {
  return useCallback((items: VisibilityPrefetchSpec[]) => {
    for (const item of items) {
      enqueuePrefetch({ key: item.key, priority: 2, run: item.run });
    }
  }, []);
}

// ── Scroll-bottom pagination prefetch ────────────────────────────────────────

export function useScrollPagePrefetch(args: {
  key: string;
  loadNextPage: () => Promise<unknown>;
  /** 0.5 = trigger when user is halfway through. Default 0.7. */
  thresholdPct?: number;
}) {
  const { key, loadNextPage, thresholdPct = 0.7 } = args;
  const firedRef = useRef(false);

  return useCallback(
    (e: { nativeEvent: { contentOffset: { y: number }; contentSize: { height: number }; layoutMeasurement: { height: number } } }) => {
      const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
      const max = contentSize.height - layoutMeasurement.height;
      if (max <= 0) return;
      const pct = contentOffset.y / max;
      if (pct < thresholdPct) {
        firedRef.current = false;
        return;
      }
      if (firedRef.current) return;
      firedRef.current = true;
      enqueuePrefetch({ key, priority: 3, run: loadNextPage });
    },
    [key, loadNextPage, thresholdPct],
  );
}

// ── Idle prefetch ────────────────────────────────────────────────────────────

export function useIdlePrefetch(args: {
  key: string;
  run: () => Promise<unknown>;
  /** Run after `delayMs` of foreground time. Default 1500ms. */
  delayMs?: number;
}) {
  const { key, run, delayMs = 1500 } = args;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const arm = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        enqueuePrefetch({ key, priority: 4, run });
      }, delayMs);
    };

    arm();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") arm();
      else if (timer) clearTimeout(timer);
    });

    return () => {
      if (timer) clearTimeout(timer);
      sub.remove();
    };
  }, [delayMs, key, run]);
}

import { useCallback, useEffect, useRef } from "react";

import { cooldown as guardCooldown, isNavigationLocked } from "@/lib/navigation-guard";

// Tuned for OfferUp/Instagram feel: long enough to swallow accidental double-fires
// from a single physical tap, short enough that intentional rapid taps work.
const DEFAULT_COOLDOWN_MS = 180;

type SafePressOptions = {
  /** Time window after a fire during which subsequent taps are ignored. */
  cooldownMs?: number;
  /**
   * Optional namespacing key. When set, the cooldown is shared across all
   * components that use the same key (e.g. global "checkout" key).
   */
  sharedKey?: string;
  /**
   * If true, taps are ignored while a navigation is locked. Default FALSE.
   * Only enable for destructive / network-mutating actions. For pure navigation
   * we let safe-router's own lock decide — gating taps adds perceived latency
   * because the user's tap appears to do nothing during the transition window.
   */
  respectNavigationLock?: boolean;
};

/**
 * Wrap a press handler so that:
 *   - rapid double / triple taps fire it only once
 *   - taps fired during in-flight async work are ignored
 *   - taps during an active navigation transition are dropped
 *
 * Use this for any Pressable / Touchable that navigates or mutates state.
 */
export function useSafePress<Args extends unknown[]>(
  handler: ((...args: Args) => void | Promise<void>) | undefined,
  options: SafePressOptions = {},
): (...args: Args) => void {
  const {
    cooldownMs = DEFAULT_COOLDOWN_MS,
    sharedKey,
    respectNavigationLock = false,
  } = options;

  const inFlightRef = useRef(false);
  const lastFiredAtRef = useRef(0);
  const handlerRef = useRef(handler);
  const keyRef = useRef<string>(sharedKey ?? `local:${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    if (sharedKey) keyRef.current = sharedKey;
  }, [sharedKey]);

  return useCallback(
    (...args: Args) => {
      const current = handlerRef.current;
      if (!current) return;

      if (respectNavigationLock && isNavigationLocked()) return;
      if (inFlightRef.current) return;

      const now = Date.now();
      if (now - lastFiredAtRef.current < cooldownMs) return;

      // Shared cooldown across components (e.g. global "open-chat" key).
      if (sharedKey && !guardCooldown(keyRef.current, cooldownMs)) return;

      lastFiredAtRef.current = now;
      inFlightRef.current = true;

      let result: void | Promise<void>;
      try {
        result = current(...args);
      } catch (err) {
        inFlightRef.current = false;
        throw err;
      }

      if (result && typeof (result as Promise<void>).then === "function") {
        (result as Promise<void>).finally(() => {
          inFlightRef.current = false;
        });
      } else {
        // Sync handler: release on next frame so the cooldown alone gates
        // subsequent taps. Holding inFlight for the entire cooldown made
        // navigation buttons feel dead for 600ms after every tap.
        Promise.resolve().then(() => {
          inFlightRef.current = false;
        });
      }
    },
    [cooldownMs, respectNavigationLock, sharedKey],
  );
}

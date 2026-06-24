import { forwardRef } from "react";
import {
  Pressable,
  type PressableProps,
  type View as RNView,
} from "react-native";

import { useSafePress } from "@/lib/use-safe-press";

type SafePressableProps = PressableProps & {
  /** Cooldown window in ms (default 600). */
  cooldownMs?: number;
  /** Optional shared cooldown key, e.g. "open-chat:<id>". */
  sharedKey?: string;
  /** If false, taps are allowed even while navigation is locked. */
  respectNavigationLock?: boolean;
};

/**
 * Drop-in replacement for `Pressable` that blocks duplicate taps
 * (double / triple / spam taps), and ignores presses while a
 * navigation transition is in flight.
 *
 * Wraps `useSafePress`, so:
 *   - identical re-taps within `cooldownMs` are dropped
 *   - async `onPress` handlers re-enable only after they settle
 *   - taps during a navigation are dropped
 */
export const SafePressable = forwardRef<RNView, SafePressableProps>(
  function SafePressable(
    { onPress, cooldownMs, sharedKey, respectNavigationLock, ...rest },
    ref,
  ) {
    const safeOnPress = useSafePress(onPress ?? undefined, {
      cooldownMs,
      sharedKey,
      respectNavigationLock,
    });

    return <Pressable ref={ref} {...rest} onPress={safeOnPress} />;
  },
);

import { requireOptionalNativeModule } from "expo-modules-core";
import type { ComponentType } from "react";

let cachedAvailability: boolean | null = null;

/** True when the current dev/production build includes expo-video native code. */
export function isExpoVideoAvailable(): boolean {
  if (cachedAvailability != null) return cachedAvailability;
  cachedAvailability = Boolean(requireOptionalNativeModule("ExpoVideo"));
  return cachedAvailability;
}

type NativeListingVideoPlayerProps = {
  uri: string;
  poster?: string;
  autoPlay?: boolean;
  isActive?: boolean;
  muted?: boolean;
  loop?: boolean;
  paused?: boolean;
  showControls?: boolean;
  showPlayOverlay?: boolean;
  compact?: boolean;
  onEnded?: () => void;
  onProgress?: (progress: number, durationSec: number) => void;
};

type NativeVideoModule = {
  ListingVideoPlayerNative?: ComponentType<NativeListingVideoPlayerProps>;
};

let cachedNativePlayer: ComponentType<NativeListingVideoPlayerProps> | null | undefined;

function isRenderableComponent(
  value: unknown,
): value is ComponentType<NativeListingVideoPlayerProps> {
  return (
    typeof value === "function" ||
    (typeof value === "object" &&
      value !== null &&
      "$$typeof" in (value as object))
  );
}

export function getNativeListingVideoPlayer():
  | ComponentType<NativeListingVideoPlayerProps>
  | null {
  if (!isExpoVideoAvailable()) return null;
  if (cachedNativePlayer !== undefined) {
    return cachedNativePlayer;
  }
  try {
    const mod = require("../components/listing-video-player-native") as NativeVideoModule & {
      default?: ComponentType<NativeListingVideoPlayerProps>;
    };
    const component = mod?.ListingVideoPlayerNative ?? mod?.default;
    cachedNativePlayer = isRenderableComponent(component) ? component : null;
    return cachedNativePlayer;
  } catch {
    cachedNativePlayer = null;
    return null;
  }
}

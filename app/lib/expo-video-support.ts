import { requireOptionalNativeModule } from "expo-modules-core";

let cachedAvailability: boolean | null = null;

/** True when the current dev/production build includes expo-video native code. */
export function isExpoVideoAvailable(): boolean {
  if (cachedAvailability != null) return cachedAvailability;
  cachedAvailability = Boolean(requireOptionalNativeModule("ExpoVideo"));
  return cachedAvailability;
}

type NativeVideoModule = typeof import("@/components/listing-video-player-native");

let cachedNativeModule: NativeVideoModule | null | undefined;

export function getNativeListingVideoPlayer():
  | NativeVideoModule["ListingVideoPlayerNative"]
  | null {
  if (!isExpoVideoAvailable()) return null;
  if (cachedNativeModule !== undefined) {
    return cachedNativeModule?.ListingVideoPlayerNative ?? null;
  }
  try {
    cachedNativeModule = require("../components/listing-video-player-native") as NativeVideoModule;
    return cachedNativeModule.ListingVideoPlayerNative;
  } catch {
    cachedNativeModule = null;
    return null;
  }
}

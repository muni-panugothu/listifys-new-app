import type { ComponentType } from "react";
import { TurboModuleRegistry } from "react-native";

/** True when the dev/production binary includes react-native-webview. */
export function isWebViewNativeAvailable(): boolean {
  try {
    return TurboModuleRegistry.get("RNCWebViewModule") != null;
  } catch {
    return false;
  }
}

export type LazyWebViewModule = {
  WebView: ComponentType<Record<string, unknown>>;
};

let cached: LazyWebViewModule | null | undefined;

/** Loads WebView JS only when the native module exists (avoids startup crash). */
export function getLazyWebViewModule(): LazyWebViewModule | null {
  if (!isWebViewNativeAvailable()) return null;
  if (cached !== undefined) return cached;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require("react-native-webview") as LazyWebViewModule;
  } catch {
    cached = null;
  }
  return cached;
}

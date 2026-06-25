/**
 * Structured auth-flow tracing for Google Sign-In debugging.
 *
 * Logs are JSON-stringified (safe on Android) and tagged [AuthTrace].
 * Enabled in __DEV__ and when EXPO_PUBLIC_AUTH_TRACE=1 (preview APKs).
 */

import { devLog, devWarn } from "@/lib/dev-log";

const TRACE_ENABLED =
  (typeof __DEV__ !== "undefined" && __DEV__) ||
  process.env.EXPO_PUBLIC_AUTH_TRACE === "1";

export function authTrace(step: string, data?: Record<string, unknown>) {
  if (!TRACE_ENABLED) return;
  devLog(`[AuthTrace] ${step}`, data ?? {});
}

export function authTraceWarn(step: string, data?: Record<string, unknown>) {
  if (!TRACE_ENABLED) return;
  devWarn(`[AuthTrace] ${step}`, data ?? {});
}

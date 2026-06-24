/**
 * Release-safe notification diagnostics.
 * Logs to Metro (dev) and logcat (release) when enabled.
 *
 * Set EXPO_PUBLIC_NOTIFICATION_DEBUG=1 in eas.json env to trace production builds.
 */
const DEBUG =
  typeof __DEV__ !== "undefined" && __DEV__
    ? true
    : process.env.EXPO_PUBLIC_NOTIFICATION_DEBUG === "1";

type LogLevel = "info" | "warn" | "error";

function emit(level: LogLevel, tag: string, message: string, extra?: Record<string, unknown>) {
  if (!DEBUG && level === "info") return;

  const line = `[Notifications:${tag}] ${message}`;
  const payload = extra ? { ...extra } : undefined;

  if (level === "error") {
    console.error(line, payload ?? "");
    return;
  }
  if (level === "warn") {
    console.warn(line, payload ?? "");
    return;
  }
  console.info(line, payload ?? "");
}

export const notificationDebug = {
  enabled: DEBUG,

  info(tag: string, message: string, extra?: Record<string, unknown>) {
    emit("info", tag, message, extra);
  },

  warn(tag: string, message: string, extra?: Record<string, unknown>) {
    emit("warn", tag, message, extra);
  },

  error(tag: string, message: string, extra?: Record<string, unknown>) {
    emit("error", tag, message, extra);
  },

  /** Always logs critical failures — visible in release logcat via adb. */
  critical(tag: string, message: string, extra?: Record<string, unknown>) {
    console.error(`[Notifications:${tag}] ${message}`, extra ?? "");
  },
};

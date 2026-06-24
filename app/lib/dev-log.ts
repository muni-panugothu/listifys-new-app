/**
 * Safe dev logging for Android — avoids passing object arguments to
 * console.info/warn/error, which can trigger NativeJSLogger
 * InvocationTargetException on some Expo/RN builds.
 */
function formatExtra(extra: unknown): string {
  if (extra == null || extra === "") return "";
  if (typeof extra === "string") return extra;
  if (typeof extra === "number" || typeof extra === "boolean") return String(extra);
  try {
    return JSON.stringify(extra);
  } catch {
    return String(extra);
  }
}

export function devLog(message: string, extra?: unknown) {
  if (typeof __DEV__ === "undefined" || !__DEV__) return;
  const suffix = extra !== undefined && extra !== "" ? ` ${formatExtra(extra)}` : "";
  // eslint-disable-next-line no-console
  console.log(`${message}${suffix}`);
}

export function devWarn(message: string, extra?: unknown) {
  if (typeof __DEV__ === "undefined" || !__DEV__) return;
  const suffix = extra !== undefined && extra !== "" ? ` ${formatExtra(extra)}` : "";
  // eslint-disable-next-line no-console
  console.warn(`${message}${suffix}`);
}

export function devError(message: string, extra?: unknown) {
  const suffix = extra !== undefined && extra !== "" ? ` ${formatExtra(extra)}` : "";
  // eslint-disable-next-line no-console
  console.error(`${message}${suffix}`);
}

import Constants from "expo-constants";

/** Public HTTPS base for PayU browser launch (never LAN IP). */
export function getPayuLaunchBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_PAYU_LAUNCH_BASE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");

  const fromExtra = Constants.expoConfig?.extra?.payuLaunchBaseUrl as string | undefined;
  if (fromExtra?.trim()) return fromExtra.trim().replace(/\/$/, "");

  return "https://listifys-new-app.onrender.com";
}

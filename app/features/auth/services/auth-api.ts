import Constants from "expo-constants";
import * as Device from "expo-device";
import { devLog } from "@/lib/dev-log";
import {
  readStoredTokens,
  writeStoredTokens,
} from "@/lib/secure-auth-storage";
import { requireOptionalNativeModule } from "expo-modules-core";
import { NativeModules, Platform } from "react-native";

import type { ProfileCompletion } from "@/features/profile/types/profile-completion";

type ExpoDeviceModule = {
  brand?: string | null;
  modelName?: string | null;
  osName?: string | null;
  osVersion?: string | null;
};

const deviceModule = requireOptionalNativeModule<ExpoDeviceModule>("ExpoDevice");

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role?: string;
  provider?: string;
  hasPassword?: boolean;
  avatar?: string | null;
  profileImage?: string | null;
  googleProfileImage?: string | null;
  profileImageUrl?: string | null;
  profileImageKey?: string | null;
  isVerified?: boolean;
  phoneVerified?: boolean;
  followersCount?: number;
  followingCount?: number;
  listingsCount?: number;
  createdAt?: string;
  bio?: string | null;
  address?: string | null;
  dateOfBirth?: string | null;
  gender?: string | null;
};

export type AuthResponse = {
  success: boolean;
  message?: string;
  user?: AuthUser;
  accessToken?: string;
  refreshToken?: string;
};

export type GoogleClientIds = {
  web: string | null;
  ios: string | null;
  android: string | null;
};

export class AuthApiError extends Error {
  status?: number;
  details?: unknown;

  constructor(message: string, status?: number, details?: unknown) {
    super(message);
    this.name = "AuthApiError";
    this.status = status;
    this.details = details;
  }
}

const API_REQUEST_TIMEOUT_MS = 15_000;
/** Render free-tier cold starts can take 45–60s; auth must wait long enough. */
const AUTH_REQUEST_TIMEOUT_MS = 65_000;

const AUTH_REQUEST_PATH_PREFIXES = [
  "/api/auth/register",
  "/api/auth/forgot-password",
  "/api/auth/login",
  "/api/auth/google",
  "/api/auth/phone",
  "/api/auth/refresh",
];

/** Profile and account mutations can hit cold servers / slow mobile networks. */
const PROFILE_REQUEST_PATH_PREFIXES = [
  "/api/auth/profile",
  "/api/auth/update-profile",
  "/api/auth/profile/upload-image",
  "/api/auth/upload-profile-image",
  "/api/auth/change-password",
  "/api/auth/request-email-change",
  "/api/auth/verify-email-change",
];

function usesExtendedRequestTimeout(path: string) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return (
    AUTH_REQUEST_PATH_PREFIXES.some((prefix) => normalized.startsWith(prefix)) ||
    PROFILE_REQUEST_PATH_PREFIXES.some((prefix) => normalized.startsWith(prefix))
  );
}

function getRequestTimeoutMs(path: string) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (usesExtendedRequestTimeout(normalized)) {
    if (
      typeof __DEV__ !== "undefined" &&
      __DEV__ &&
      !isRemoteHostedApiBase(getAuthApiBaseUrl())
    ) {
      return API_REQUEST_TIMEOUT_MS;
    }
    return AUTH_REQUEST_TIMEOUT_MS;
  }
  return API_REQUEST_TIMEOUT_MS;
}

function isAndroidEmulator(): boolean {
  return Platform.OS === "android" && !Device.isDevice;
}

function getRawMetroHost(): string | undefined {
  try {
    const scriptURL = NativeModules.SourceCode?.scriptURL as string | undefined;
    if (!scriptURL) return undefined;
    return scriptURL.match(/^https?:\/\/([^/:]+)/i)?.[1];
  } catch {
    return undefined;
  }
}

/** True when Metro is reached through `adb reverse tcp:8081`, so port 5000 tunnels too. */
function isMetroOverLoopback(): boolean {
  const host = getRawMetroHost();
  return host === "127.0.0.1" || host === "localhost";
}

function getMetroPackagerHost(): string | undefined {
  const host = getRawMetroHost();
  if (host && host.includes(".") && host !== "127.0.0.1" && host !== "localhost") {
    return host;
  }
  return undefined;
}

function getDevLanHost(): string | undefined {
  return getMetroPackagerHost() ?? getExpoDevHost();
}

function isRemoteHostedApiBase(url: string) {
  return /onrender\.com|render\.com/i.test(url);
}

function isLocalDevApiBase(url: string): boolean {
  const host = getUrlHost(url)?.toLowerCase();
  if (!host) return true;
  if (host === "localhost" || host === "127.0.0.1" || host === "10.0.2.2") return true;
  return isPrivateLanHost(host);
}

/** Production fallback when EXPO_PUBLIC_API_BASE_URL was not baked into a release build. */
const PRODUCTION_API_FALLBACK = "https://listifys-new-app.onrender.com";

function getExpoDevHost() {
  // expo-dev-client / Expo Go sets hostUri at runtime so the LAN IP is always current.
  // Try all known manifest shapes from oldest (Expo SDK <46) to newest (SDK 46+).
  const hostUri =
    Constants.expoConfig?.hostUri ??
    (Constants as { manifest?: { debuggerHost?: string } }).manifest?.debuggerHost ??
    Constants.manifest2?.extra?.expoGo?.debuggerHost ??
    // SDK 46+ packager info
    (Constants.manifest2 as { launchAsset?: unknown; extra?: { expoGo?: { debuggerHost?: string } } } | null)
      ?.extra?.expoGo?.debuggerHost;

  // hostUri is "ip:port" — take only the IP portion before the colon.
  const host = typeof hostUri === "string" ? hostUri.split(":")[0] : undefined;

  // Sanity-check: must be a non-loopback IP (at least one dot, no colon leftovers).
  if (host && host !== "localhost" && host !== "127.0.0.1" && host.includes(".") && !host.includes(":")) {
    return host;
  }
  return undefined;
}

function trimUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function getConfiguredApiBaseUrl(): string | undefined {
  const fromEnv = trimUrl(process.env.EXPO_PUBLIC_API_BASE_URL);
  const fromExtra = trimUrl(
    (Constants.expoConfig?.extra as { apiBaseUrl?: unknown } | undefined)?.apiBaseUrl,
  );
  const value = fromEnv || fromExtra;
  return value ? value.replace(/\/$/, "") : undefined;
}

function getUrlHost(url: string): string | undefined {
  return url.match(/^https?:\/\/([^/:]+)/i)?.[1];
}

function isPrivateLanHost(host: string | undefined): boolean {
  if (!host) return false;
  return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
}

/**
 * A `.env` LAN IP goes stale every time the dev machine changes Wi-Fi network.
 * The Metro packager host is known-reachable (the bundle loaded from it), so it
 * wins over a configured private IP that no longer matches.
 */
function getDevSelfHealingBaseUrl(): string | undefined {
  if (typeof __DEV__ === "undefined" || !__DEV__) return undefined;

  const configured = getConfiguredApiBaseUrl();
  if (!configured || !isPrivateLanHost(getUrlHost(configured))) return undefined;

  // Bundle arrived over the USB tunnel, so the LAN IP is unusable but port 5000 is not.
  if (isMetroOverLoopback()) return "http://127.0.0.1:5000";

  const lanHost = getDevLanHost();
  if (!lanHost || lanHost === getUrlHost(configured)) return undefined;

  return `http://${lanHost}:5000`;
}

function resolveApiBaseUrl(): string {
  const explicitBaseUrl = getConfiguredApiBaseUrl();

  // User-configured URL always wins (physical device + local server), unless its
  // LAN IP is stale relative to the Metro host we are already talking to.
  if (explicitBaseUrl) {
    return getDevSelfHealingBaseUrl() ?? explicitBaseUrl;
  }

  if (typeof __DEV__ !== "undefined" && __DEV__) {
    const lanHost = getDevLanHost();
    if (lanHost) {
      return `http://${lanHost}:5000`;
    }
    if (isAndroidEmulator()) {
      return "http://10.0.2.2:5000";
    }
    return "http://localhost:5000";
  }

  if (Platform.OS === "android" && isAndroidEmulator()) {
    return "http://10.0.2.2:5000";
  }

  return PRODUCTION_API_FALLBACK;
}

/** Always resolves the current API base (Metro LAN IP on physical devices in dev). */
export function getAuthApiBaseUrl(): string {
  return resolveApiBaseUrl();
}

/** Initial snapshot at module load — prefer getAuthApiBaseUrl() in dev. */
export const AUTH_API_BASE_URL = getAuthApiBaseUrl();

if (typeof __DEV__ !== "undefined" && __DEV__) {
  devLog("[API] Using base URL:", {
    baseUrl: getAuthApiBaseUrl(),
    configured: getConfiguredApiBaseUrl(),
    env: process.env.EXPO_PUBLIC_API_BASE_URL ?? "(unset)",
    extra: (Constants.expoConfig?.extra as { apiBaseUrl?: string })?.apiBaseUrl ?? "(unset)",
  });
  setTimeout(() => {
    const resolved = getAuthApiBaseUrl();
    if (resolved !== AUTH_API_BASE_URL) {
      devLog("[API] Resolved base URL (runtime):", resolved);
    }
  }, 0);
}

function isAndroidPhysicalDevice(): boolean {
  return Platform.OS === "android" && Device.isDevice;
}

export function getCandidateApiBaseUrls() {
  const candidates: string[] = [];
  const add = (value?: string | null, { prepend = false } = {}) => {
    const normalized = trimUrl(value)?.replace(/\/$/, "");
    if (!normalized) return;
    if (candidates.includes(normalized)) return;
    if (prepend) {
      candidates.unshift(normalized);
    } else {
      candidates.push(normalized);
    }
  };

  const configured = getConfiguredApiBaseUrl();
  const selfHealing = getDevSelfHealingBaseUrl();

  // Hosted API (Render, etc.) — never probe unreachable LAN/localhost first.
  if (configured && !isLocalDevApiBase(configured)) {
    add(configured, { prepend: true });
    return candidates;
  }

  if (typeof __DEV__ !== "undefined" && __DEV__) {
    // Reachable hosts first so a stale configured LAN IP never costs a full timeout.
    add(selfHealing);
    if (isAndroidPhysicalDevice()) {
      // USB dev: adb reverse tcp:5000 tcp:5000 — works when Wi-Fi to the PC is blocked/isolated.
      add("http://127.0.0.1:5000");
    }
    if (isAndroidEmulator()) {
      add("http://10.0.2.2:5000");
    }
    const lanHost = getDevLanHost();
    if (lanHost) {
      add(`http://${lanHost}:5000`);
    }
  }

  // A stale LAN IP stays as a last resort rather than blocking every request.
  add(configured, { prepend: !selfHealing });
  add(getAuthApiBaseUrl());

  return candidates;
}

/** URLs used for backend health probes (connectivity banner). */
export function getBackendProbeBaseUrls(): string[] {
  const configured = getConfiguredApiBaseUrl();
  if (configured && !isLocalDevApiBase(configured)) {
    return [configured.replace(/\/$/, "")];
  }
  const candidates = getCandidateApiBaseUrls();
  return candidates.length ? candidates : [getAuthApiBaseUrl()];
}

export function getBackendProbeTimeoutMs(baseUrl: string): number {
  return isLocalDevApiBase(baseUrl) ? 5_000 : 25_000;
}

function isNetworkLikeError(error: unknown) {
  if (error instanceof AuthApiError) {
    return error.status === 0 || /network|timed out/i.test(error.message);
  }
  if (error instanceof TypeError) {
    return true;
  }
  if (error instanceof Error) {
    return /network|timed out|fetch/i.test(error.message);
  }
  return false;
}

async function fetchWithTimeout(
  url: string,
  init?: RequestInit,
  timeoutMs = API_REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new AuthApiError(
        "The request timed out. The server may be waking up — please try again.",
        0,
      );
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function toAbsoluteUrl(url?: string | null) {
  if (!url) return url;
  if (/^https?:\/\//i.test(url) || url.startsWith("data:") || url.startsWith("file:")) {
    return url;
  }
  if (url.startsWith("//")) {
    return `https:${url}`;
  }
  if (url.startsWith("/")) {
    return `${getAuthApiBaseUrl()}${url}`;
  }
  return `${getAuthApiBaseUrl()}/${url}`;
}

export function resolveAbsoluteMediaUrl(url?: string | null) {
  return toAbsoluteUrl(url);
}

function normalizeAuthUser<
  T extends {
    id?: string;
    _id?: string;
    avatar?: string | null;
    profileImage?: string | null;
    googleProfileImage?: string | null;
    profileImageUrl?: string | null;
  },
>(user: T): T & { id?: string } {
  const id = user.id ?? user._id;
  return {
    ...user,
    ...(id != null ? { id: String(id) } : {}),
    avatar: toAbsoluteUrl(user.avatar),
    profileImage: toAbsoluteUrl(user.profileImage),
    googleProfileImage: toAbsoluteUrl(user.googleProfileImage),
    profileImageUrl: toAbsoluteUrl(user.profileImageUrl),
  };
}

// ── Device User-Agent for backend device tracking ───────────────────────────────
// Format: "Listify/VERSION (Brand Model; OS Version)" — must match server Listify UA regex.
// Do NOT add extra words between VERSION and "(" — the server regex expects whitespace only.
function buildUserAgent(): string {
  const appVersion = Constants.expoConfig?.version ?? "1.0.0";
  const brand = deviceModule?.brand;
  const modelName = deviceModule?.modelName;
  const osName = deviceModule?.osName ?? Platform.OS;
  const osVersion = deviceModule?.osVersion ?? Platform.Version?.toString() ?? "";
  // Build device model string — avoid "Unknown Unknown" when device module unavailable
  const deviceModel =
    brand && modelName ? `${brand} ${modelName}` :
    brand ? brand :
    modelName ? modelName :
    "Mobile Device";
  return `Listify/${appVersion} (${deviceModel}; ${osName} ${osVersion})`;
}

const APP_USER_AGENT = buildUserAgent();
const IS_WEB_CLIENT = Platform.OS === "web";

/** Headers that identify Listify native clients to the API (CSRF/CORS bypass). */
export function getApiClientHeaders(extra?: Record<string, string>) {
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    "User-Agent": APP_USER_AGENT,
    ...(!IS_WEB_CLIENT ? { "X-Listify-Client": "mobile" } : {}),
    ...(extra ?? {}),
  };
}

function getRequestCredentials(): RequestCredentials {
  // Native apps use Bearer JWT in SecureStore — cookies cause stale-session bugs.
  return IS_WEB_CLIENT ? "include" : "omit";
}

// ── Token management (SecureStore + in-memory cache) ───────────────────────────
let _accessToken: string | null = null;
let _refreshToken: string | null = null;
let _refreshPromise: Promise<boolean> | null = null;

type SessionInvalidationListener = () => void;
const sessionInvalidationListeners = new Set<SessionInvalidationListener>();

/** Fired when refresh definitively fails and stored tokens are cleared. */
export function onSessionInvalidated(listener: SessionInvalidationListener) {
  sessionInvalidationListeners.add(listener);
  return () => {
    sessionInvalidationListeners.delete(listener);
  };
}

function notifySessionInvalidated() {
  sessionInvalidationListeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // ignore listener errors
    }
  });
}

export async function setTokens(access: string | null | undefined, refresh: string | null | undefined) {
  const nextAccess = access?.trim() ? access.trim() : null;
  const nextRefresh = refresh?.trim() ? refresh.trim() : null;

  if (!nextAccess && !nextRefresh) {
    return;
  }

  _accessToken = nextAccess;
  _refreshToken = nextRefresh;
  await writeStoredTokens({
    accessToken: _accessToken,
    refreshToken: _refreshToken,
  });
}

export async function restoreTokens() {
  const stored = await readStoredTokens();
  if (stored) {
    _accessToken = stored.accessToken ?? null;
    _refreshToken = stored.refreshToken ?? null;
  }
}

export async function clearTokens(options?: { notify?: boolean }) {
  _accessToken = null;
  _refreshToken = null;
  await writeStoredTokens(null);
  if (options?.notify) {
    notifySessionInvalidated();
  }
}

export function getAccessToken() {
  return _accessToken;
}

export function getRefreshToken() {
  return _refreshToken;
}

export function hasStoredSessionTokens() {
  return Boolean(_accessToken || _refreshToken);
}

async function ensureAccessTokenLoaded(): Promise<void> {
  if (!_accessToken && !_refreshToken) {
    await restoreTokens();
  }
  if (!_accessToken && _refreshToken) {
    await refreshAccessToken();
  }
}

export async function refreshAccessToken(): Promise<boolean> {
  // Try to restore from storage if in-memory token is missing
  if (!_refreshToken) {
    await restoreTokens();
  }
  if (!_refreshToken) return false;

  // Deduplicate concurrent refresh calls
  if (_refreshPromise) return _refreshPromise;

  _refreshPromise = (async () => {
    try {
      const res = await fetchWithTimeout(`${getAuthApiBaseUrl()}/api/auth/refresh`, {
        method: "POST",
        credentials: getRequestCredentials(),
        headers: getApiClientHeaders(),
        body: JSON.stringify({ refreshToken: _refreshToken }),
      });
      const data = await parseJsonSafe(res);
      if (res.ok && data && typeof data === "object") {
        const body = data as Record<string, unknown>;
        if (body.accessToken) {
          await setTokens(body.accessToken as string, (body.refreshToken as string) ?? _refreshToken);
          return true;
        }
      }
      // Only clear session when the server explicitly rejects the refresh token.
      if (res.status === 401 || res.status === 403) {
        await clearTokens({ notify: true });
      }
      return false;
    } catch {
      // Network / timeout — keep tokens so offline sessions can retry later.
      return false;
    } finally {
      _refreshPromise = null;
    }
  })();

  return _refreshPromise;
}

function extractErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return "Request failed. Please try again.";
  }

  const body = payload as Record<string, unknown>;

  const findFirstString = (value: unknown): string | null => {
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = findFirstString(item);
        if (found) return found;
      }
      return null;
    }
    if (value && typeof value === "object") {
      for (const item of Object.values(value as Record<string, unknown>)) {
        const found = findFirstString(item);
        if (found) return found;
      }
      return null;
    }
    return null;
  };

  // Prefer specific field errors over generic messages like "Validation failed"
  if (body.errors && typeof body.errors === "object") {
    const firstError = findFirstString(body.errors);
    if (firstError) {
      return firstError;
    }
  }

  if (typeof body.message === "string" && body.message.trim().length > 0) {
    return body.message;
  }

  return "Request failed. Please try again.";
}

async function parseJsonSafe(response: Response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

async function executeRequestJson<T>(
  path: string,
  init?: RequestInit,
  options?: { timeoutMs?: number },
): Promise<T> {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const baseUrls = getCandidateApiBaseUrls();
  const timeoutMs = options?.timeoutMs ?? getRequestTimeoutMs(normalizedPath);

  if (typeof __DEV__ !== "undefined" && __DEV__) {
    devLog("[API] Request", `${normalizedPath} → ${baseUrls.join(", ")}`);
  }

  await ensureAccessTokenLoaded();

  const buildHeaders = () => ({
    ...getApiClientHeaders(),
    ...(_accessToken ? { Authorization: `Bearer ${_accessToken}` } : {}),
    ...(init?.headers ?? {}),
  });

  let response: Response | null = null;
  let lastNetworkError: unknown = null;

  for (const baseUrl of baseUrls) {
    const url = `${baseUrl}${normalizedPath}`;
    try {
      response = await fetchWithTimeout(
        url,
        {
          ...init,
          credentials: getRequestCredentials(),
          headers: buildHeaders(),
        },
        timeoutMs,
      );

      // Auto-refresh on 401 and retry once
      if (response.status === 401) {
        const refreshed = await refreshAccessToken();
        if (refreshed) {
          response = await fetchWithTimeout(
            url,
            {
              ...init,
              credentials: getRequestCredentials(),
              headers: buildHeaders(),
            },
            timeoutMs,
          );
        }
      }

      break;
    } catch (error) {
      if (!isNetworkLikeError(error)) {
        throw error;
      }
      lastNetworkError = error;
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        // eslint-disable-next-line no-console
        console.warn("[API] Failed", url, error instanceof Error ? error.message : error);
      }
      continue;
    }
  }

  if (!response) {
    if (lastNetworkError instanceof AuthApiError) {
      throw lastNetworkError;
    }
    const timedOut =
      lastNetworkError instanceof Error &&
      /timed out|abort/i.test(lastNetworkError.message);
    throw new AuthApiError(
      timedOut
        ? "The request timed out. The server may be waking up — please try again."
        : "Unable to connect to the Listifys server. Please wait a moment and try again.",
      0,
      lastNetworkError,
    );
  }

  const data = await parseJsonSafe(response);

  if (!response.ok) {
    throw new AuthApiError(extractErrorMessage(data), response.status, data);
  }

  if (data && typeof data === "object" && "success" in (data as Record<string, unknown>)) {
    const typedData = data as { success?: boolean };
    if (typedData.success === false) {
      throw new AuthApiError(extractErrorMessage(data), response.status, data);
    }
  }

  return (data ?? {}) as T;
}

export async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const timeoutMs = getRequestTimeoutMs(path.startsWith("/") ? path : `/${path}`);
  const method = (init?.method ?? "GET").toUpperCase();
  const shouldRetryOnTimeout =
    timeoutMs > API_REQUEST_TIMEOUT_MS &&
    (method === "POST" || method === "PUT" || method === "PATCH");

  try {
    return await executeRequestJson<T>(path, init, { timeoutMs });
  } catch (error) {
    // One retry after cold-start timeout (e.g. Render waking up or slow mobile network).
    if (
      shouldRetryOnTimeout &&
      error instanceof AuthApiError &&
      error.status === 0 &&
      /timed out/i.test(error.message)
    ) {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      return executeRequestJson<T>(path, init, { timeoutMs });
    }
    throw error;
  }
}

export function getAuthErrorMessage(error: unknown) {
  if (error instanceof AuthApiError) {
    if (/timed out/i.test(error.message)) {
      return "The server is taking longer than usual to respond. Please wait a moment and try again.";
    }
    if (error.status === 0 || /unable to connect|can't reach|listifys server/i.test(error.message)) {
      return "Can't reach the Listifys server right now. Please wait a moment and try again.";
    }
    if (error.status === 502 || error.status === 503 || error.status === 504) {
      return "The server is temporarily unavailable. Please try again in a few seconds.";
    }
    if (error.status === 500) {
      if (/duplicate|already exists/i.test(error.message)) {
        return "An account with this phone already exists. Please sign in instead.";
      }
      return "Verification could not be completed right now. Please try again.";
    }
    if (error.status === 429) {
      return error.message || "Too many attempts. Please wait before trying again.";
    }
    if (
      error.status === 401 &&
      /not authorized to access this route|please login|session invalid|invalid token|token expired/i.test(
        error.message,
      )
    ) {
      return "Your session expired. Please sign in again.";
    }
    if (error.status === 409) {
      return error.message || "An account with this phone already exists. Please sign in instead.";
    }
    if (error.status === 403 && /origin not allowed/i.test(error.message)) {
      return "Request blocked by server security policy. Please update the app or try again.";
    }
    if (error.status === 400) {
      return error.message || "Invalid or expired OTP. Please check the code and try again.";
    }
    return error.message;
  }

  if (error instanceof TypeError) {
    return "Can't reach the Listifys server right now. Please wait a moment and try again.";
  }

  if (error instanceof Error && error.message) {
    if (/network|fetch failed|econnreset|timed out|abort/i.test(error.message)) {
      return "Can't reach the Listifys server right now. Please wait a moment and try again.";
    }
    return error.message;
  }

  return "Something went wrong. Please try again.";
}

export function loginWithPassword(identity: string, password: string) {
  return requestJson<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ identity, password }),
  }).then((response) => ({
    ...response,
    user: response.user ? normalizeAuthUser(response.user) : response.user,
  }));
}

export function initiateRegistration(name: string, email: string, password: string) {
  return requestJson<{ success: boolean; message?: string; email?: string }>(
    "/api/auth/register/initiate",
    {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    },
  );
}

export function verifyRegistrationOtp(email: string, otp: string) {
  return requestJson<AuthResponse>("/api/auth/register/verify", {
    method: "POST",
    body: JSON.stringify({ email, otp }),
  }).then((response) => ({
    ...response,
    user: response.user ? normalizeAuthUser(response.user) : response.user,
  }));
}

export function resendRegistrationOtp(email: string) {
  return requestJson<{ success: boolean; message?: string }>(
    "/api/auth/register/resend-otp",
    {
      method: "POST",
      body: JSON.stringify({ email }),
    },
  );
}

export function sendPhoneOtp(phone: string, channel: "sms" | "whatsapp" = "sms") {
  return requestJson<{ success: boolean; message?: string; phone?: string; channel?: string }>(
    "/api/auth/phone/send-otp",
    {
      method: "POST",
      body: JSON.stringify({ phone, channel }),
    },
  );
}

export function verifyPhoneOtp(phone: string, otp: string, name?: string) {
  return requestJson<AuthResponse & { isNew?: boolean }>("/api/auth/phone/verify-otp", {
    method: "POST",
    body: JSON.stringify({ phone, otp, name }),
  }).then((response) => ({
    ...response,
    user: response.user ? normalizeAuthUser(response.user) : response.user,
  }));
}

export function initiateForgotPassword(email: string) {
  return requestJson<{ success: boolean; message?: string; email?: string; devOtp?: string }>(
    "/api/auth/forgot-password/initiate",
    {
      method: "POST",
      body: JSON.stringify({ email }),
    },
  );
}

export function verifyForgotPasswordOtp(email: string, otp: string) {
  return requestJson<{ success: boolean; message?: string; resetToken?: string }>(
    "/api/auth/forgot-password/verify-otp",
    {
      method: "POST",
      body: JSON.stringify({ email, otp }),
    },
  );
}

export function resendForgotPasswordOtp(email: string) {
  return requestJson<{ success: boolean; message?: string; devOtp?: string }>(
    "/api/auth/forgot-password/resend-otp",
    {
      method: "POST",
      body: JSON.stringify({ email }),
    },
  );
}

export function resetPasswordWithToken(
  resetToken: string,
  password: string,
  email: string,
  confirmPassword?: string,
) {
  return requestJson<{ success: boolean; message?: string }>(
    `/api/auth/reset-password/${encodeURIComponent(resetToken)}`,
    {
      method: "PUT",
      body: JSON.stringify({
        email,
        password,
        confirmPassword: confirmPassword ?? password,
      }),
    },
  );
}

export async function getGoogleClientIds() {
  const response = await fetch(`${getAuthApiBaseUrl()}/api/auth/google/client-ids`, {
    method: "GET",
    headers: getApiClientHeaders(),
  });
  const data = (await parseJsonSafe(response)) as {
    success?: boolean;
    clientIds?: GoogleClientIds;
    message?: string;
  } | null;

  if (!response.ok || !data?.clientIds) {
    throw new AuthApiError(
      extractErrorMessage(data),
      response.status,
      data,
    );
  }

  return data.clientIds;
}

export function loginWithGoogleToken(idToken: string) {
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.info("[GoogleLogin] POST /api/auth/google/token →", getAuthApiBaseUrl());
  }
  return requestJson<AuthResponse>("/api/auth/google/token", {
    method: "POST",
    body: JSON.stringify({ idToken }),
  }).then((response) => ({
    ...response,
    user: response.user ? normalizeAuthUser(response.user) : response.user,
  }));
}

// ── Profile APIs ────────────────────────────────────────────────────────────────

export type ProfileResponse = {
  success: boolean;
  user: AuthUser & {
    bio?: string;
    location?: string;
    createdAt?: string;
    followersCount?: number;
    followingCount?: number;
    listingsCount?: number;
  };
  profileCompletion?: ProfileCompletion;
};

export function getProfile() {
  return requestJson<ProfileResponse>("/api/auth/profile", {
    method: "GET",
  }).then((response) => ({
    ...response,
    user: response.user ? normalizeAuthUser(response.user) : response.user,
  }));
}

export function updateProfile(data: {
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  bio?: string;
  dateOfBirth?: string;
  gender?: string;
}) {
  return requestJson<ProfileResponse>("/api/auth/update-profile", {
    method: "PUT",
    body: JSON.stringify(data),
  }).then((response) => ({
    ...response,
    user: response.user ? normalizeAuthUser(response.user) : response.user,
  }));
}

export function uploadProfileImage(formData: FormData) {
  const normalizedPath = "/api/auth/profile/upload-image";
  const uploadUrl = `${getAuthApiBaseUrl()}${normalizedPath}`;
  const uploadTimeoutMs = Math.max(getRequestTimeoutMs(normalizedPath), 60_000);

  const doUpload = () => {
    const token = getAccessToken();
    return fetchWithTimeout(
      uploadUrl,
      {
        method: "POST",
        credentials: getRequestCredentials(),
        headers: {
          Accept: "application/json",
          "User-Agent": APP_USER_AGENT,
          ...(!IS_WEB_CLIENT ? { "X-Listify-Client": "mobile" } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: formData,
      },
      uploadTimeoutMs,
    );
  };

  return doUpload()
    .then(async (res) => {
      if (res.status === 401) {
        const refreshed = await refreshAccessToken();
        if (refreshed) {
          return doUpload();
        }
      }
      return res;
    })
    .then(async (res) => {
      const data = await parseJsonSafe(res);
      const payload = (data ?? {}) as {
        success?: boolean;
        message?: string;
        profileImage?: string;
        profileImageUrl?: string;
        imageUrl?: string;
        user?: AuthUser & { _id?: string };
      };

      const imageUrl = toAbsoluteUrl(payload.imageUrl);
      const uploadSucceeded =
        res.ok && (payload.success !== false || Boolean(imageUrl));

      if (!uploadSucceeded) {
        throw new AuthApiError(extractErrorMessage(data), res.status, data);
      }

      const user = payload.user ? normalizeAuthUser(payload.user) : undefined;
      const resolvedImageUrl =
        imageUrl ??
        toAbsoluteUrl(user?.profileImageUrl ?? user?.profileImage ?? null);

      return {
        ...payload,
        success: true,
        profileImage: toAbsoluteUrl(payload.profileImage ?? user?.profileImage),
        profileImageUrl:
          toAbsoluteUrl(payload.profileImageUrl ?? user?.profileImageUrl) ??
          resolvedImageUrl,
        imageUrl: resolvedImageUrl,
        user,
      };
    });
}

// ── Devices / Sessions ──────────────────────────────────────────────────────────

export type DeviceSession = {
  deviceId: string;
  deviceName: string;
  deviceType?: string;
  browser?: string;
  os?: string;
  ipAddress?: string;
  location?: string;
  lastActive?: string;
  lastActiveText?: string;
  lastSeen?: string;
  current?: boolean;
  isCurrentDevice?: boolean;
};

export async function getDevices() {
  const res = await requestJson<{
    success: boolean;
    devices: DeviceSession[];
    currentDeviceId?: string;
  }>("/api/auth/devices", { method: "GET" });

  // Normalize the `current` flag from backend's `isCurrentDevice` + `currentDeviceId`
  const devices = (res.devices || []).map((d) => ({
    ...d,
    current: d.current ?? d.isCurrentDevice ?? d.deviceId === res.currentDeviceId,
    lastActive: d.lastActive ?? d.lastSeen,
  }));

  return { ...res, devices };
}

export function revokeDevice(deviceId: string) {
  return requestJson<{ success: boolean; message?: string }>(
    `/api/auth/devices/${encodeURIComponent(deviceId)}`,
    { method: "DELETE" },
  );
}

export function logoutAllDevices() {
  return requestJson<{ success: boolean; message?: string }>(
    "/api/auth/logout-all",
    { method: "POST" },
  );
}

export function sendRecoveryPhoneOTP(phone: string, channel: "sms" | "whatsapp" = "sms") {
  return requestJson<{ success: boolean; message?: string; phone?: string; expiresIn?: number }>(
    "/api/auth/phone/update-send-otp",
    { method: "POST", body: JSON.stringify({ phone, channel }) },
  );
}

export function verifyRecoveryPhoneOTP(phone: string, otp: string) {
  return requestJson<{ success: boolean; message?: string; phone?: string; phoneVerified?: boolean }>(
    "/api/auth/phone/update-verify-otp",
    { method: "POST", body: JSON.stringify({ phone, otp }) },
  );
}

// ── Primary email change (OTP-verified) ──────────────────────────────────────

export function requestEmailChange(email: string) {
  return requestJson<{
    success: boolean;
    message?: string;
    maskedEmail?: string;
    expiresIn?: number;
    devOtp?: string;
  }>(
    "/api/auth/email/change-request",
    { method: "POST", body: JSON.stringify({ email }) },
  );
}

export function verifyEmailChange(email: string, otp: string) {
  return requestJson<{ success: boolean; message?: string; email?: string; attemptsRemaining?: number }>(
    "/api/auth/email/change-verify",
    { method: "POST", body: JSON.stringify({ email, otp }) },
  );
}

// ── Primary phone change (OTP-verified via Twilio) ───────────────────────────

export function requestPhoneChange(phone: string, channel: "sms" | "whatsapp" = "sms") {
  return requestJson<{ success: boolean; message?: string; phone?: string; expiresIn?: number }>(
    "/api/auth/phone/change-request",
    { method: "POST", body: JSON.stringify({ phone, channel }) },
  );
}

export function verifyPhoneChange(phone: string, otp: string) {
  return requestJson<{ success: boolean; message?: string; phone?: string; phoneVerified?: boolean }>(
    "/api/auth/phone/change-verify",
    { method: "POST", body: JSON.stringify({ phone, otp }) },
  );
}

// ── Activity / Login History ────────────────────────────────────────────────────

export type ActivityLogEntry = {
  _id?: string;
  id?: string;
  action: string;
  title?: string;
  description?: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
  timestamp?: string;
  category?: string;
  type?: string;
  metadata?: Record<string, unknown>;
};

export async function getActivityLog() {
  const res = await requestJson<{
    success: boolean;
    activity?: ActivityLogEntry[];
    activities?: ActivityLogEntry[];
    summary?: { totalActions: number; successfulLogins: number; securityEvents: number };
  }>("/api/auth/activity-log", { method: "GET" });

  // Backend returns `activity`, normalize to `activities` with mapped field names.
  // Prefer `type` (e.g. "login", "password_changed") for `action` so that icon
  // selection and stat counters work correctly, while `title` is preserved for
  // human-readable display in the UI.
  const raw = res.activity ?? res.activities ?? [];
  const activities = raw.map((item) => ({
    ...item,
    _id: item._id ?? item.id,
    action: item.action ?? item.type ?? item.title ?? "Activity",
    createdAt: item.createdAt ?? item.timestamp ?? new Date().toISOString(),
  }));

  return { ...res, activities };
}

export type FollowListType = "followers" | "following";

export type FollowListUser = {
  id: string;
  name: string;
  profileImageUrl?: string | null;
  provider?: string;
  createdAt?: string;
};

export type FollowListResponse = {
  success: boolean;
  type: FollowListType;
  users: FollowListUser[];
  followersCount: number;
  followingCount: number;
};

export function getFollowList(type: FollowListType) {
  return requestJson<FollowListResponse>(`/api/auth/followers?type=${type}`, {
    method: "GET",
  }).then((response) => ({
    ...response,
    followersCount: response.followersCount ?? 0,
    followingCount: response.followingCount ?? 0,
    users: (response.users ?? []).map((user) => ({
      ...user,
      id: String(user.id),
      profileImageUrl: toAbsoluteUrl(user.profileImageUrl),
    })),
  }));
}

export function toggleFollowUser(userId: string) {
  return requestJson<{
    success: boolean;
    isFollowing: boolean;
    followersCount: number;
    followingCount?: number;
    myFollowersCount?: number;
  }>(`/api/auth/follow/${encodeURIComponent(userId)}`, { method: "POST" });
}

export type SellerReviewItem = {
  id: string;
  rating: number;
  comment: string;
  createdAt: string;
  reviewer: {
    id?: string;
    name: string;
    profileImageUrl: string | null;
  };
};

export type SellerReviewsResponse = {
  success: boolean;
  reviews: SellerReviewItem[];
  averageRating: number;
  reviewsCount: number;
};

export function fetchSellerReviews(sellerId: string) {
  return requestJson<SellerReviewsResponse>(
    `/api/auth/seller/${encodeURIComponent(sellerId)}/reviews`,
  ).then((response) => ({
    ...response,
    averageRating: response.averageRating ?? 0,
    reviewsCount: response.reviewsCount ?? 0,
    reviews: (response.reviews ?? []).map((review) => ({
      ...review,
      reviewer: {
        ...review.reviewer,
        profileImageUrl: toAbsoluteUrl(review.reviewer?.profileImageUrl),
      },
    })),
  }));
}

export function submitSellerReview(
  sellerId: string,
  data: { rating: number; comment: string },
) {
  return requestJson<{
    success: boolean;
    review: SellerReviewItem;
    averageRating: number;
    reviewsCount: number;
  }>(`/api/auth/seller/${encodeURIComponent(sellerId)}/reviews`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function submitServiceReview(data: {
  listingId: string;
  providerId: string;
  rating: number;
  comment: string;
  title?: string;
}) {
  return requestJson<{ success: boolean; data?: unknown }>("/api/services/reviews", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function deleteSellerReview(sellerId: string) {
  return requestJson<{
    success: boolean;
    averageRating: number;
    reviewsCount: number;
  }>(`/api/auth/seller/${encodeURIComponent(sellerId)}/reviews`, {
    method: "DELETE",
  });
}

export type SettingsPreferences = {
  emailNotifications: boolean;
  pushNotifications: boolean;
  marketingEmails: boolean;
  twoFactorAuth: boolean;
  theme: "light" | "dark" | "auto";
};

export function getSettingsPreferences() {
  return requestJson<{
    success: boolean;
    preferences: SettingsPreferences;
  }>("/api/settings/preferences", { method: "GET" });
}

export function updateSettingsPreferences(preferences: Partial<SettingsPreferences>) {
  return requestJson<{
    success: boolean;
    message?: string;
    preferences: SettingsPreferences;
  }>("/api/settings/preferences", {
    method: "PUT",
    body: JSON.stringify(preferences),
  });
}

export function deleteAccount(body: {
  confirmation: string;
  password?: string;
}) {
  return requestJson<{ success: boolean; message?: string }>(
    "/api/settings/delete-account",
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
}

export function getLoginHistory() {
  return requestJson<{ success: boolean; loginHistory: unknown[] }>(
    "/api/auth/login-history",
    { method: "GET" },
  );
}

// ── Password ────────────────────────────────────────────────────────────────────

export function changePassword(currentPassword: string, newPassword: string) {
  return requestJson<{ success: boolean; message?: string }>(
    "/api/auth/change-password",
    {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    },
  );
}

export function setupPassword(password: string) {
  return requestJson<{ success: boolean; message?: string }>(
    "/api/auth/setup-password",
    {
      method: "POST",
      body: JSON.stringify({ password }),
    },
  );
}

// ── Notifications ───────────────────────────────────────────────────────────────

export type NotificationSender = {
  id: string;
  name: string;
  profileImageUrl?: string | null;
  provider?: string;
};

export type NotificationItem = {
  _id: string;
  type: string;
  title?: string;
  message: string;
  read: boolean;
  createdAt: string;
  metadata?: Record<string, unknown>;
  data?: Record<string, unknown>;
  sender?: NotificationSender | null;
};

export function getNotifications(page = 1, limit = 30) {
  return requestJson<{ success: boolean; notifications: NotificationItem[]; total?: number }>(
    `/api/notifications?page=${page}&limit=${limit}`,
    { method: "GET" },
  );
}

export function getUnreadCount() {
  return requestJson<{ success: boolean; unreadCount: number }>(
    "/api/notifications/unread-count",
    { method: "GET" },
  );
}

export function markAllNotificationsRead() {
  return requestJson<{ success: boolean; message?: string }>(
    "/api/notifications/read-all",
    { method: "PUT" },
  );
}

export function markNotificationRead(notificationId: string) {
  return requestJson<{ success: boolean }>(
    `/api/notifications/${encodeURIComponent(notificationId)}/read`,
    { method: "PUT" },
  );
}

export function deleteNotification(notificationId: string) {
  return requestJson<{ success: boolean }>(
    `/api/notifications/${encodeURIComponent(notificationId)}`,
    { method: "DELETE" },
  );
}

export function deleteAllNotifications() {
  return requestJson<{ success: boolean; deletedCount?: number }>(
    "/api/notifications/all",
    { method: "DELETE" },
  );
}

// ── Logout (server-side) ────────────────────────────────────────────────────────

export async function logoutFromServer() {
  if (!_refreshToken) {
    await restoreTokens();
  }
  const refreshToken = getRefreshToken();
  return requestJson<{ success: boolean; message?: string }>(
    "/api/auth/logout",
    {
      method: "POST",
      ...(refreshToken ? { body: JSON.stringify({ refreshToken }) } : {}),
    },
  );
}

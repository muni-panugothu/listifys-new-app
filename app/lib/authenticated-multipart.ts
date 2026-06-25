import { Platform } from "react-native";

import {
  AuthApiError,
  getAccessToken,
  getApiClientHeaders,
  getRefreshToken,
  refreshAccessToken,
  restoreTokens,
} from "@/features/auth/services/auth-api";

function getJwtExpiryMs(token: string): number | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded)) as { exp?: number };
    return payload.exp ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

function isAccessTokenExpired(token: string | null, skewMs = 60_000): boolean {
  if (!token) return true;
  const exp = getJwtExpiryMs(token);
  if (!exp) return false;
  return Date.now() >= exp - skewMs;
}

async function ensureTokenFresh(): Promise<boolean> {
  if (!getAccessToken() && !getRefreshToken()) {
    await restoreTokens();
  }
  if (!getAccessToken() && getRefreshToken()) {
    return refreshAccessToken();
  }
  if (getAccessToken() && isAccessTokenExpired(getAccessToken())) {
    return refreshAccessToken();
  }
  return Boolean(getAccessToken());
}

/**
 * POST multipart/form-data with Bearer auth and automatic token refresh on 401.
 */
export async function authenticatedMultipartPost(
  url: string,
  buildFormData: () => FormData,
): Promise<Response> {
  const ready = await ensureTokenFresh();
  if (!ready) {
    throw new AuthApiError("Your session expired. Please sign in again.", 401);
  }

  const doPost = async () => {
    const token = getAccessToken();
    const headers = getApiClientHeaders(
      token ? { Authorization: `Bearer ${token}` } : {},
    );
    delete (headers as Record<string, string>)["Content-Type"];
    return fetch(url, {
      method: "POST",
      credentials: Platform.OS === "web" ? "include" : "omit",
      headers,
      body: buildFormData(),
    });
  };

  let response = await doPost();
  if (response.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      response = await doPost();
    }
  }

  return response;
}

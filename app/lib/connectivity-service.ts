/**
 * ConnectivityService
 *
 * Separates **general internet** from **app backend reachability**.
 * A device on Wi-Fi with working internet must NOT show "No Internet" just
 * because the dev-server LAN IP is wrong on one phone.
 *
 * General internet probes (any success = online):
 *   - Google captive-portal check (GET)
 *   - Cloudflare trace endpoint (GET)
 *
 * Backend probe (separate flag):
 *   - Tries candidate API base URLs (same list as auth-api)
 */

import {
  getBackendProbeBaseUrls,
  getBackendProbeTimeoutMs,
} from "@/features/auth/services/auth-api";

const PROBE_TIMEOUT_MS = 5_000;
const DEBOUNCE_MS = 800;
/** Avoid flip-flopping on a single failed probe during Wi-Fi handoff. */
const OFFLINE_CONFIRM_COUNT = 2;
const SERVER_DOWN_CONFIRM_COUNT = 2;

const GOOGLE_PROBE_URL = "https://connectivitycheck.gstatic.com/generate_204";
const CF_PROBE_URL = "https://1.1.1.1/cdn-cgi/trace";

export type ConnectivitySnapshot = {
  /** TCP/IP routing to the public internet works. */
  hasInternet: boolean;
  /** At least one API base URL responds to /health. */
  backendReachable: boolean;
};

async function probeGet(url: string, headers?: Record<string, string>): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
      headers,
    });
    return res.status > 0;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Validates general internet — independent of our backend. */
export async function checkGeneralInternet(): Promise<boolean> {
  const [googleOk, cfOk] = await Promise.all([
    probeGet(GOOGLE_PROBE_URL),
    probeGet(CF_PROBE_URL),
  ]);
  return googleOk || cfOk;
}

async function probeBackendBase(baseUrl: string): Promise<boolean> {
  const timeoutMs = getBackendProbeTimeoutMs(baseUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/health`, {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Validates app-server reachability using the same URL candidates as API calls. */
export async function checkBackendReachable(): Promise<boolean> {
  const unique = [...new Set(getBackendProbeBaseUrls())];

  for (const baseUrl of unique) {
    if (await probeBackendBase(baseUrl)) {
      return true;
    }
    // One retry — Render free tier can take 30–60s to wake from sleep.
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    if (await probeBackendBase(baseUrl)) {
      return true;
    }
  }

  return false;
}

export async function checkConnectivity(): Promise<ConnectivitySnapshot> {
  const [hasInternet, backendReachable] = await Promise.all([
    checkGeneralInternet(),
    checkBackendReachable(),
  ]);
  return { hasInternet, backendReachable };
}

/** @deprecated Use checkConnectivity — kept for callers that only need a boolean. */
export async function checkActualInternetAccess(): Promise<boolean> {
  const { hasInternet } = await checkConnectivity();
  return hasInternet;
}

type ConnectivityListener = (snapshot: ConnectivitySnapshot) => void;

class ConnectivityService {
  private _snapshot: ConnectivitySnapshot = {
    hasInternet: true,
    backendReachable: true,
  };
  private _listeners = new Set<ConnectivityListener>();
  private _debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private _checkInFlight = false;
  private _offlineStreak = 0;
  private _serverDownStreak = 0;

  subscribe(listener: ConnectivityListener): () => void {
    this._listeners.add(listener);
    listener(this._snapshot);
    return () => this._listeners.delete(listener);
  }

  get snapshot(): ConnectivitySnapshot {
    return this._snapshot;
  }

  get isOnline(): boolean {
    return this._snapshot.hasInternet;
  }

  get isBackendReachable(): boolean {
    return this._snapshot.backendReachable;
  }

  /** Force a fresh probe (e.g. when user taps retry or app returns to foreground). */
  recheck(): void {
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
    }
    void this._validateAndNotify(true);
  }

  handleNetInfoChange(netInfoIsConnected: boolean): void {
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
    }

    if (!netInfoIsConnected) {
      this._debounceTimer = setTimeout(() => {
        this._offlineStreak = OFFLINE_CONFIRM_COUNT;
        this._serverDownStreak = SERVER_DOWN_CONFIRM_COUNT;
        this._setSnapshot({ hasInternet: false, backendReachable: false });
      }, DEBOUNCE_MS);
      return;
    }

    this._debounceTimer = setTimeout(() => {
      void this._validateAndNotify(false);
    }, DEBOUNCE_MS);
  }

  private async _validateAndNotify(force: boolean): Promise<void> {
    if (this._checkInFlight) return;
    this._checkInFlight = true;
    try {
      let snapshot = await checkConnectivity();

      // One quick retry — probes can fail transiently during Wi-Fi association.
      if (!snapshot.hasInternet && !force) {
        await new Promise((r) => setTimeout(r, 1_500));
        snapshot = await checkConnectivity();
      }

      if (!snapshot.hasInternet) {
        this._offlineStreak += 1;
        if (this._offlineStreak < OFFLINE_CONFIRM_COUNT && !force) {
          return;
        }
        this._serverDownStreak = 0;
      } else {
        this._offlineStreak = 0;

        if (!snapshot.backendReachable) {
          this._serverDownStreak += 1;
          if (this._serverDownStreak < SERVER_DOWN_CONFIRM_COUNT && !force) {
            return;
          }
        } else {
          this._serverDownStreak = 0;
        }
      }

      this._setSnapshot(snapshot);
    } finally {
      this._checkInFlight = false;
    }
  }

  private _setSnapshot(next: ConnectivitySnapshot): void {
    const prev = this._snapshot;
    if (
      prev.hasInternet === next.hasInternet &&
      prev.backendReachable === next.backendReachable
    ) {
      return;
    }
    this._snapshot = next;
    for (const listener of this._listeners) {
      listener(next);
    }
  }

  destroy(): void {
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
    }
    this._listeners.clear();
  }
}

export const connectivityService = new ConnectivityService();

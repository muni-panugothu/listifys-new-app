/**
 * ConnectivityService
 *
 * Separates device internet from backend reachability.
 * Backend status is driven by **real API responses first**, with a lightweight
 * /health probe as a secondary signal — never the sole source of truth.
 */

import {
  getApiClientHeaders,
  getBackendProbeBaseUrls,
  getBackendProbeTimeoutMs,
} from "@/features/auth/services/auth-api";

const INTERNET_PROBE_TIMEOUT_MS = 5_000;
const DEBOUNCE_MS = 800;
const OFFLINE_CONFIRM_COUNT = 2;
const SERVER_DOWN_CONFIRM_COUNT = 3;
/** How long a successful API response keeps the backend marked reachable. */
const API_SUCCESS_TTL_MS = 120_000;
/** Minimum gap between background /health probes (avoid Render ping storms). */
const MIN_PROBE_INTERVAL_MS = 90_000;
/** Defer the first background probe so startup API calls can succeed first. */
const INITIAL_PROBE_DELAY_MS = 8_000;

const GOOGLE_PROBE_URL = "https://connectivitycheck.gstatic.com/generate_204";
const CF_PROBE_URL = "https://1.1.1.1/cdn-cgi/trace";

export type ConnectivitySnapshot = {
  hasInternet: boolean;
  backendReachable: boolean;
};

async function probeGet(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), INTERNET_PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
    });
    return res.status > 0;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function checkGeneralInternet(): Promise<boolean> {
  const [googleOk, cfOk] = await Promise.all([
    probeGet(GOOGLE_PROBE_URL),
    probeGet(CF_PROBE_URL),
  ]);
  return googleOk || cfOk;
}

async function probeBackendHealth(baseUrl: string): Promise<boolean> {
  const timeoutMs = getBackendProbeTimeoutMs(baseUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/health`, {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
      headers: getApiClientHeaders({ Accept: "application/json" }),
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function probeBackendReachable(): Promise<boolean> {
  const bases = [...new Set(getBackendProbeBaseUrls())];
  for (const baseUrl of bases) {
    if (await probeBackendHealth(baseUrl)) return true;
  }
  return false;
}

type ConnectivityListener = (snapshot: ConnectivitySnapshot) => void;

class ConnectivityService {
  private _snapshot: ConnectivitySnapshot = {
    hasInternet: true,
    backendReachable: true,
  };
  private _listeners = new Set<ConnectivityListener>();
  private _debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private _initialProbeTimer: ReturnType<typeof setTimeout> | null = null;
  private _checkInFlight = false;
  private _offlineStreak = 0;
  private _serverDownStreak = 0;
  private _lastApiSuccessAt = 0;
  private _lastProbeAt = 0;
  private _started = false;

  subscribe(listener: ConnectivityListener): () => void {
    this._listeners.add(listener);
    listener(this._snapshot);
    if (!this._started) {
      this._started = true;
      this._initialProbeTimer = setTimeout(() => {
        void this._runBackgroundProbe(false);
      }, INITIAL_PROBE_DELAY_MS);
    }
    return () => this._listeners.delete(listener);
  }

  get snapshot(): ConnectivitySnapshot {
    return this._snapshot;
  }

  get isOnline(): boolean {
    return this._snapshot.hasInternet;
  }

  get isBackendReachable(): boolean {
    return this._effectiveBackendReachable();
  }

  /** Call when any authenticated/public API request succeeds. */
  reportBackendSuccess(): void {
    this._lastApiSuccessAt = Date.now();
    this._serverDownStreak = 0;
    if (!this._snapshot.backendReachable) {
      this._setSnapshot({
        hasInternet: this._snapshot.hasInternet,
        backendReachable: true,
      });
    }
  }

  /** Call on network-level API failure (status 0 / timeout). */
  reportBackendFailure(): void {
    if (this._effectiveBackendReachable()) return;
    this._serverDownStreak += 1;
    if (
      this._serverDownStreak >= SERVER_DOWN_CONFIRM_COUNT &&
      this._snapshot.backendReachable
    ) {
      this._setSnapshot({
        hasInternet: this._snapshot.hasInternet,
        backendReachable: false,
      });
    }
  }

  recheck(): void {
    if (this._debounceTimer) clearTimeout(this._debounceTimer);
    void this._validateInternetAndMaybeProbe(true);
  }

  handleNetInfoChange(netInfoIsConnected: boolean): void {
    if (this._debounceTimer) clearTimeout(this._debounceTimer);

    if (!netInfoIsConnected) {
      this._debounceTimer = setTimeout(() => {
        this._offlineStreak = OFFLINE_CONFIRM_COUNT;
        this._serverDownStreak = SERVER_DOWN_CONFIRM_COUNT;
        this._setSnapshot({ hasInternet: false, backendReachable: false });
      }, DEBOUNCE_MS);
      return;
    }

    this._debounceTimer = setTimeout(() => {
      void this._validateInternetAndMaybeProbe(false);
    }, DEBOUNCE_MS);
  }

  private _effectiveBackendReachable(): boolean {
    if (Date.now() - this._lastApiSuccessAt < API_SUCCESS_TTL_MS) {
      return true;
    }
    return this._snapshot.backendReachable;
  }

  private async _validateInternetAndMaybeProbe(force: boolean): Promise<void> {
    if (this._checkInFlight) return;
    this._checkInFlight = true;
    try {
      let hasInternet = await checkGeneralInternet();
      if (!hasInternet && !force) {
        await new Promise((r) => setTimeout(r, 1_500));
        hasInternet = await checkGeneralInternet();
      }

      if (!hasInternet) {
        this._offlineStreak += 1;
        if (this._offlineStreak < OFFLINE_CONFIRM_COUNT && !force) {
          return;
        }
        this._serverDownStreak = 0;
        this._setSnapshot({ hasInternet: false, backendReachable: false });
        return;
      }

      this._offlineStreak = 0;

      const backendReachable = this._effectiveBackendReachable();
      this._setSnapshot({ hasInternet: true, backendReachable });

      await this._runBackgroundProbe(force);
    } finally {
      this._checkInFlight = false;
    }
  }

  private async _runBackgroundProbe(force: boolean): Promise<void> {
    if (this._effectiveBackendReachable() && !force) return;

    const now = Date.now();
    if (!force && now - this._lastProbeAt < MIN_PROBE_INTERVAL_MS) {
      return;
    }
    this._lastProbeAt = now;

    const probeOk = await probeBackendReachable();
    if (probeOk) {
      this._serverDownStreak = 0;
      this._setSnapshot({ hasInternet: true, backendReachable: true });
      return;
    }

    if (this._effectiveBackendReachable()) {
      return;
    }

    this._serverDownStreak += 1;
    if (this._serverDownStreak >= SERVER_DOWN_CONFIRM_COUNT || force) {
      this._setSnapshot({ hasInternet: true, backendReachable: false });
    }
  }

  private _setSnapshot(next: ConnectivitySnapshot): void {
    const effectiveNext: ConnectivitySnapshot = {
      hasInternet: next.hasInternet,
      backendReachable: next.hasInternet
        ? this._effectiveBackendReachable() || next.backendReachable
        : false,
    };

    const prev = this._snapshot;
    if (
      prev.hasInternet === effectiveNext.hasInternet &&
      prev.backendReachable === effectiveNext.backendReachable
    ) {
      return;
    }
    this._snapshot = effectiveNext;
    for (const listener of this._listeners) {
      listener(effectiveNext);
    }
  }

  destroy(): void {
    if (this._debounceTimer) clearTimeout(this._debounceTimer);
    if (this._initialProbeTimer) clearTimeout(this._initialProbeTimer);
    this._listeners.clear();
  }
}

export const connectivityService = new ConnectivityService();

/** @deprecated */
export async function checkConnectivity(): Promise<ConnectivitySnapshot> {
  const hasInternet = await checkGeneralInternet();
  const backendReachable =
    connectivityService.isBackendReachable ||
    (hasInternet ? await probeBackendReachable() : false);
  return { hasInternet, backendReachable };
}

/** @deprecated */
export async function checkActualInternetAccess(): Promise<boolean> {
  return checkGeneralInternet();
}

/** @deprecated */
export async function checkBackendReachable(): Promise<boolean> {
  return probeBackendReachable();
}

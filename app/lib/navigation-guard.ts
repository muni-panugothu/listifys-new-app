/**
 * Enterprise-grade tap / navigation protection.
 *
 * Three coordinated layers:
 *
 * 1. `navigationLock` — global mutex held during a navigation transition.
 *    While locked, ALL navigation attempts are dropped (matches Amazon /
 *    Instagram behavior where a route change cannot fire concurrently).
 *
 * 2. `runOnce` — per-key in-flight guard for async actions
 *    (form submits, network mutations, navigation thunks). Subsequent
 *    invocations with the same key are ignored until the in-flight promise
 *    resolves or rejects.
 *
 * 3. `cooldown` — per-key throttle window. Useful when you want to ignore
 *    rapid taps for N ms after a successful action (e.g. heart toggle).
 *
 * Time defaults are tuned to feel natural (≈ one animation frame burst)
 * but still block double / triple / 10-rapid taps. All helpers are SSR-safe
 * and survive Fast Refresh by storing state on module globals.
 */

type Unsubscribe = () => void;

// ── Global navigation lock ────────────────────────────────────────────────────

const NAV_LOCK_AUTO_RELEASE_MS = 1200; // failsafe in case release() is never called
let navLockedUntil = 0;
let navLockToken = 0;

/**
 * True when a navigation is currently in flight.
 * Use this to short-circuit downstream side effects.
 */
export function isNavigationLocked(): boolean {
  return Date.now() < navLockedUntil;
}

/**
 * Acquire the navigation lock. Returns `null` if another navigation is
 * already in flight; otherwise returns a release function. The lock is
 * auto-released after `NAV_LOCK_AUTO_RELEASE_MS` to avoid permanent
 * lockups on stalled transitions.
 */
export function acquireNavigationLock(holdMs = NAV_LOCK_AUTO_RELEASE_MS): (() => void) | null {
  if (isNavigationLocked()) return null;

  const token = ++navLockToken;
  navLockedUntil = Date.now() + holdMs;

  return () => {
    if (token === navLockToken) {
      navLockedUntil = 0;
    }
  };
}

/** Force-clear the navigation lock (used after auth when retries are exhausted). */
export function releaseNavigationLock(): void {
  navLockedUntil = 0;
  navLockToken++;
}

// ── Per-key in-flight dedupe ──────────────────────────────────────────────────

const inFlight = new Map<string, Promise<unknown>>();

/**
 * Run an async function at most once per key while in-flight.
 *
 * - First caller starts the work and gets the promise.
 * - Subsequent callers with the same key while the first is pending
 *   receive `undefined` (the no-op signal).
 * - Once the promise settles (resolve OR reject), the key is freed.
 *
 * Used for: login, send offer, create listing, message send,
 * follow / unfollow, save listing.
 */
export async function runOnce<T>(
  key: string,
  fn: () => Promise<T>,
): Promise<T | undefined> {
  if (inFlight.has(key)) return undefined;

  const promise = (async () => {
    try {
      return await fn();
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, promise);
  return (await promise) as T;
}

/** Synchronous variant: returns true if action ran, false if blocked. */
export function runOnceSync(key: string, fn: () => void): boolean {
  if (inFlight.has(key)) return false;

  // Mark in-flight for one frame so consecutive sync taps in the same
  // microtask are dropped, but the slot is freed quickly so the next
  // user-initiated tap works.
  const ticket = Promise.resolve();
  inFlight.set(key, ticket);
  ticket.finally(() => {
    if (inFlight.get(key) === ticket) inFlight.delete(key);
  });

  fn();
  return true;
}

// ── Per-key cooldown / throttle ───────────────────────────────────────────────

const cooldownAt = new Map<string, number>();

/**
 * Block a key for `ms` after the first call. Returns true if the call
 * should proceed, false if it's within the cooldown window.
 */
export function cooldown(key: string, ms: number): boolean {
  const now = Date.now();
  const blockedUntil = cooldownAt.get(key) ?? 0;
  if (now < blockedUntil) return false;

  cooldownAt.set(key, now + ms);
  return true;
}

/** Clears any cooldown for `key`. */
export function clearCooldown(key: string) {
  cooldownAt.delete(key);
}

// ── Debounce / Throttle factories ─────────────────────────────────────────────

/** Trailing-edge debounce. Returns the same instance across calls. */
export function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  ms: number,
): (...args: Args) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;

  return (...args: Args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, ms);
  };
}

/** Leading-edge throttle: fires immediately, then ignores for `ms`. */
export function throttle<Args extends unknown[]>(
  fn: (...args: Args) => void,
  ms: number,
): (...args: Args) => void {
  let nextAllowedAt = 0;

  return (...args: Args) => {
    const now = Date.now();
    if (now < nextAllowedAt) return;
    nextAllowedAt = now + ms;
    fn(...args);
  };
}

// ── Cleanup hook for tests / Fast Refresh ─────────────────────────────────────

export function __resetNavigationGuardForTests(): Unsubscribe {
  navLockedUntil = 0;
  navLockToken = 0;
  inFlight.clear();
  cooldownAt.clear();
  return () => undefined;
}

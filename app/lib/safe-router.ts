import { useCallback, useMemo } from "react";
import { type Href, usePathname, useRouter as useExpoRouter } from "expo-router";

import {
  acquireNavigationLock,
  isNavigationLocked,
} from "@/lib/navigation-guard";

export * from "expo-router";

/**
 * Hardened router that prevents:
 *   - Duplicate pushes of the same route within `SAME_ROUTE_GUARD_MS`
 *   - ANY navigation while another transition is in flight
 *   - Navigation to the route the user is already on
 *   - Invalid hrefs from dynamic builders (avoids Expo Router crashes)
 *
 * Lock is released after `NAV_LOCK_RELEASE_MS` so navigations cannot
 * permanently jam the app. Listeners can subscribe to transitions to
 * synchronize side effects.
 */

// Time after a same-route nav during which the identical route is blocked.
const SAME_ROUTE_GUARD_MS = 800;
// Time the global lock is held after a nav fires (matches transition duration).
const NAV_LOCK_RELEASE_MS = 350;

let lastNavigation = { key: "", at: 0 };

type RouteTransitionAction = "push" | "replace" | "back";
type RouteTransitionListener = (payload: {
  action: RouteTransitionAction;
  nextPath: string | null;
}) => void;

const routeTransitionListeners = new Set<RouteTransitionListener>();

function stableParamsString(params: Record<string, unknown>) {
  const keys = Object.keys(params).sort();
  return keys.map((k) => `${k}=${JSON.stringify(params[k])}`).join("&");
}

function hrefToKey(href: Href) {
  if (typeof href === "string") return href;

  const pathname = String((href as { pathname?: unknown }).pathname ?? "");
  const params = ((href as { params?: unknown }).params ?? {}) as Record<string, unknown>;
  const hasParams = params && Object.keys(params).length > 0;
  return hasParams ? `${pathname}?${stableParamsString(params)}` : pathname;
}

function hrefToPath(href: Href): string | null {
  if (typeof href === "string") {
    const path = href.split("?")[0]?.split("#")[0] ?? "";
    return path || null;
  }

  const pathname = (href as { pathname?: unknown }).pathname;
  return typeof pathname === "string" ? pathname : null;
}

function isValidHref(href: unknown): href is Href {
  if (typeof href === "string") {
    return href.trim().length > 0;
  }

  if (!href || typeof href !== "object") {
    return false;
  }

  const pathname = (href as { pathname?: unknown }).pathname;
  return typeof pathname === "string" && pathname.trim().length > 0;
}

function notifyRouteTransition(action: RouteTransitionAction, nextPath: string | null) {
  for (const listener of routeTransitionListeners) {
    listener({ action, nextPath });
  }
}

export function subscribeRouteTransitions(listener: RouteTransitionListener) {
  routeTransitionListeners.add(listener);
  return () => {
    routeTransitionListeners.delete(listener);
  };
}

/** True if identical key was navigated within the same-route guard window. */
function isDuplicateKey(nextKey: string) {
  const now = Date.now();
  if (nextKey && nextKey === lastNavigation.key && now - lastNavigation.at < SAME_ROUTE_GUARD_MS) {
    return true;
  }
  lastNavigation = { key: nextKey, at: now };
  return false;
}

/**
 * Drop-in replacement for expo-router useRouter with multi-layer guarding.
 * Use this everywhere instead of `useRouter` from expo-router directly.
 */
export function useRouter() {
  const router = useExpoRouter();
  const pathname = usePathname();

  const push = useCallback(
    (href: Href) => {
      if (!isValidHref(href)) {
        // eslint-disable-next-line no-console
        console.warn("[safe-router] Ignored invalid push href", href);
        return;
      }

      const key = `push:${hrefToKey(href)}`;
      const nextPath = hrefToPath(href);

      // Layer 1: drop if user is already on the destination.
      if (nextPath && nextPath === pathname) return;

      // Layer 2: drop same route within debounce window.
      if (isDuplicateKey(key)) return;

      // Layer 3: drop any nav while another is in flight.
      const release = acquireNavigationLock(NAV_LOCK_RELEASE_MS);
      if (!release) return;

      notifyRouteTransition("push", nextPath);
      router.push(href);

      // Release after a short window so the next user-initiated tap works.
      setTimeout(release, NAV_LOCK_RELEASE_MS);
    },
    [router, pathname],
  );

  const replace = useCallback(
    (href: Href) => {
      if (!isValidHref(href)) {
        // eslint-disable-next-line no-console
        console.warn("[safe-router] Ignored invalid replace href", href);
        return;
      }

      const key = `replace:${hrefToKey(href)}`;
      const nextPath = hrefToPath(href);

      if (nextPath && nextPath === pathname) return;
      if (isDuplicateKey(key)) return;

      const release = acquireNavigationLock(NAV_LOCK_RELEASE_MS);
      if (!release) return;

      notifyRouteTransition("replace", nextPath);
      router.replace(href);

      setTimeout(release, NAV_LOCK_RELEASE_MS);
    },
    [router, pathname],
  );

  const back = useCallback(() => {
    const key = `back:${pathname}`;
    if (isDuplicateKey(key)) return;

    const release = acquireNavigationLock(NAV_LOCK_RELEASE_MS);
    if (!release) return;

    notifyRouteTransition("back", null);
    router.back();

    setTimeout(release, NAV_LOCK_RELEASE_MS);
  }, [router, pathname]);

  return useMemo(
    () => ({
      ...router,
      push,
      replace,
      back,
    }),
    [router, push, replace, back],
  );
}

/** Re-export for screens that need to query the lock outside React. */
export { isNavigationLocked };

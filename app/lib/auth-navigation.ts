/**
 * Reliable post-authentication navigation.
 *
 * Google Sign-In on Android dismisses a native Activity before control
 * returns to React Native. On slower OEM devices this overlaps with:
 *   - navigation-guard locks from safe-router
 *   - InteractionManager backlog
 *   - Redux commit timing
 *
 * Password login navigates imperatively after unwrap(); Google login
 * previously relied only on useEffect — which never retries if replace()
 * was silently dropped. This module is the single post-auth navigation path.
 */

import { type Href } from "expo-router";
import { InteractionManager, Platform } from "react-native";

import { authTrace, authTraceWarn } from "@/lib/auth-trace";
import {
  isNavigationLocked,
  releaseNavigationLock,
} from "@/lib/navigation-guard";

export const AUTH_HOME_ROUTE = "/(tabs)/home-feed-root" as Href;

export type PostAuthRouter = {
  replace: (href: Href) => void;
  /** Bypasses duplicate-route guards — provided by safe-router useRouter(). */
  replaceAfterAuth?: (href: Href) => void;
};

function resolveAuthTarget(redirectTo?: string | null): Href {
  if (redirectTo && redirectTo.startsWith("/")) {
    return redirectTo as Href;
  }
  return AUTH_HOME_ROUTE;
}

async function waitForUiSettled(source: string): Promise<void> {
  await new Promise<void>((resolve) => {
    InteractionManager.runAfterInteractions(() => {
      requestAnimationFrame(() => resolve());
    });
  });

  // Extra buffer after Google account picker Activity tears down (Android).
  if (Platform.OS === "android") {
    await new Promise((r) => setTimeout(r, 100));
  }

  authTrace("nav.ui_settled", { source });
}

/**
 * Navigate to home (or redirectTo) after a successful login.
 * Retries when the global navigation lock is held; uses replaceAfterAuth
 * when available so duplicate-route guards cannot block auth transitions.
 */
export async function navigateAfterAuthentication(
  router: PostAuthRouter,
  options?: { redirectTo?: string | null; source?: string },
): Promise<void> {
  const source = options?.source ?? "unknown";
  const target = resolveAuthTarget(options?.redirectTo);

  authTrace("nav.start", { source, target: String(target) });

  await waitForUiSettled(source);

  const dispatch = () => {
    if (typeof router.replaceAfterAuth === "function") {
      router.replaceAfterAuth(target);
    } else {
      router.replace(target);
    }
  };

  const MAX_ATTEMPTS = 10;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (!isNavigationLocked()) {
      dispatch();
      authTrace("nav.dispatched", { source, attempt, target: String(target) });
      return;
    }

    authTraceWarn("nav.wait_lock", { source, attempt });
    await new Promise((r) => setTimeout(r, 80 * (attempt + 1)));
  }

  // Last resort — clear stale lock and force navigation.
  releaseNavigationLock();
  dispatch();
  authTraceWarn("nav.forced", { source, target: String(target) });
}

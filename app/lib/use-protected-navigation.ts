import { type Href, useRouter } from "@/lib/safe-router";
import { useCallback } from "react";

import { isNavigationLocked } from "@/lib/navigation-guard";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { showAuthGate, type AuthGateAction } from "@/store/slices/auth-gate-slice";

function hrefToRedirectString(href: Href): string {
  if (typeof href === "string") {
    return href;
  }

  const pathname = href.pathname ?? "/";
  const params = href.params as Record<string, string | string[] | undefined> | undefined;
  if (!params) {
    return pathname;
  }

  const query = Object.entries(params)
    .filter(([, value]) => value != null && value !== "")
    .map(([key, value]) => {
      const normalized = Array.isArray(value) ? value[0] : value;
      return `${encodeURIComponent(key)}=${encodeURIComponent(String(normalized))}`;
    })
    .join("&");

  return query ? `${pathname}?${query}` : pathname;
}

export function useProtectedNavigation() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const isAuthenticated = useAppSelector((s) => s.auth.isAuthenticated);

  const navigateProtected = useCallback(
    (href: Href, action: AuthGateAction = "profile") => {
      if (isNavigationLocked()) return;
      if (isAuthenticated) {
        router.push(href);
        return;
      }

      dispatch(
        showAuthGate({
          action,
          redirectTo: hrefToRedirectString(href),
        }),
      );
    },
    [dispatch, isAuthenticated, router],
  );

  const requireAuth = useCallback(
    (action: AuthGateAction = "general", redirectTo?: string) => {
      if (isAuthenticated) {
        return true;
      }

      dispatch(showAuthGate({ action, redirectTo: redirectTo ?? null }));
      return false;
    },
    [dispatch, isAuthenticated],
  );

  return { navigateProtected, requireAuth, isAuthenticated };
}

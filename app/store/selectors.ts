import { createSelector } from "@reduxjs/toolkit";

import type { RootState } from "@/store";

/** Narrow auth subscriptions — avoids re-rendering on unrelated auth slice changes. */
export const selectAuthUser = (s: RootState) => s.auth.user;
export const selectIsAuthenticated = (s: RootState) => s.auth.isAuthenticated;
export const selectAuthUserId = (s: RootState) => s.auth.user?.id ?? null;

export const selectNetworkConnected = (s: RootState) => s.network.isConnected;

export const selectIsAppOffline = createSelector(
  [(s: RootState) => s.network.isConnected, (s: RootState) => s.network.actualInternetReachable, (s: RootState) => s.network.backendReachable],
  (isConnected, actualInternetReachable, backendReachable) =>
    !isConnected ||
    (actualInternetReachable === false && backendReachable === false),
);

export const selectNetworkSlow = createSelector(
  [(s: RootState) => s.network.isSlowConnection, (s: RootState) => s.network.transportIsSlow],
  (isSlowConnection, transportIsSlow) => isSlowConnection || transportIsSlow,
);

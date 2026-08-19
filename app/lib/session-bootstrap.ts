import type { AppDispatch } from "@/store";
import { store } from "@/store";
import { restoreSession } from "@/store/slices/auth-slice";

let restoreInFlight: ReturnType<AppDispatch> | null = null;

/**
 * Restore JWT session from SecureStore exactly once per app launch.
 * Safe to call from splash, root layout, or any screen — concurrent calls dedupe.
 */
export function ensureSessionRestored(dispatch: AppDispatch = store.dispatch) {
  if (store.getState().auth.sessionHydrated) {
    return Promise.resolve(store.getState().auth);
  }

  if (!restoreInFlight) {
    restoreInFlight = dispatch(restoreSession()).finally(() => {
      restoreInFlight = null;
    });
  }

  return restoreInFlight;
}

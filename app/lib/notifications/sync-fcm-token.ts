import { getFCMToken } from "@/lib/notifications/token-manager";
import { getCachedPushEnabled } from "@/lib/notifications/push-preference";
import { registerFCMTokenWithServer } from "@/lib/notifications/register-fcm-server";
import { notificationDebug } from "@/lib/notifications/notification-debug";

let syncInFlight: Promise<boolean> | null = null;
let lastSyncedToken: string | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleFcmRetry(delayMs = 15_000) {
  if (retryTimer) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    notificationDebug.info("Sync", "retrying FCM token sync after transient failure");
    void syncFcmTokenWithServer({ force: true });
  }, delayMs);
}

/**
 * Fetch the device FCM token and persist it on the server.
 * Safe to call repeatedly — dedupes concurrent calls and identical tokens.
 */
export async function syncFcmTokenWithServer(options?: {
  force?: boolean;
  /** Set true only when user explicitly opts in (Home feed prompt, Settings toggle). */
  promptPermission?: boolean;
}): Promise<boolean> {
  if (syncInFlight && !options?.force) {
    return syncInFlight;
  }

  const run = async (): Promise<boolean> => {
    const pushOn = await getCachedPushEnabled();
    if (!pushOn) {
      notificationDebug.info("Sync", "push disabled in preferences — skipping");
      return false;
    }

    const token = await getFCMToken({
      promptPermission: options?.promptPermission === true,
    });
    if (!token) {
      notificationDebug.warn(
        "Sync",
        "no FCM token yet — will retry on next foreground (often Play Services / network)",
      );
      scheduleFcmRetry();
      return false;
    }

    if (!options?.force && token === lastSyncedToken) {
      notificationDebug.info("Sync", "token unchanged — skip server register");
      return true;
    }

    const saved = await registerFCMTokenWithServer(token);
    if (saved) {
      lastSyncedToken = token;
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      notificationDebug.info("Sync", "token registered on server", {
        prefix: token.slice(0, 24),
      });
    } else {
      notificationDebug.warn("Sync", "server rejected FCM token registration — will retry");
      scheduleFcmRetry(30_000);
    }
    return saved;
  };

  syncInFlight = run().finally(() => {
    syncInFlight = null;
  });

  return syncInFlight;
}

/** Call after logout so the next login always re-syncs. */
export function resetFcmSyncState(): void {
  lastSyncedToken = null;
  syncInFlight = null;
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}

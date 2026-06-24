import { getFCMToken } from "@/lib/notifications/token-manager";
import { getCachedPushEnabled } from "@/lib/notifications/push-preference";
import { registerFCMTokenWithServer } from "@/lib/notifications/register-fcm-server";
import { notificationDebug } from "@/lib/notifications/notification-debug";

let syncInFlight: Promise<boolean> | null = null;
let lastSyncedToken: string | null = null;

/**
 * Fetch the device FCM token and persist it on the server.
 * Safe to call repeatedly — dedupes concurrent calls and identical tokens.
 */
export async function syncFcmTokenWithServer(options?: {
  force?: boolean;
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

    const token = await getFCMToken();
    if (!token) {
      notificationDebug.critical(
        "Sync",
        "no FCM token — check notification permission and Firebase SHA-1 in google-services.json",
      );
      return false;
    }

    if (!options?.force && token === lastSyncedToken) {
      notificationDebug.info("Sync", "token unchanged — skip server register");
      return true;
    }

    const saved = await registerFCMTokenWithServer(token);
    if (saved) {
      lastSyncedToken = token;
      notificationDebug.info("Sync", "token registered on server", {
        prefix: token.slice(0, 24),
      });
    } else {
      notificationDebug.critical("Sync", "server rejected FCM token registration");
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
}

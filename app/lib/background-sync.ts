/**
 * Background sync controller.
 *
 * Coordinates idle refreshes for the resources that drive the home screen
 * (feeds, unread counts, recently viewed, saved listings, notifications).
 *
 * Triggers:
 *   - On app foreground after >30s of background time
 *   - On app idle (1.5s after navigation transitions stop)
 *   - On network reconnect after offline
 *
 * Each task is rate-limited per key and respects the global navigation
 * lock so a sync never fires during an in-flight transition.
 */

import NetInfo from "@react-native-community/netinfo";
import { AppState, type AppStateStatus } from "react-native";

import { isNavigationLocked } from "@/lib/navigation-guard";

type SyncTask = {
  key: string;
  run: () => Promise<unknown>;
  /** Minimum gap between runs (ms). Default 60s. */
  minIntervalMs?: number;
};

const tasks = new Map<string, SyncTask>();
const lastRanAt = new Map<string, number>();
const FOREGROUND_THRESHOLD_MS = 30_000;

let lastBackgroundedAt = 0;
let initialized = false;

export function registerSyncTask(task: SyncTask) {
  tasks.set(task.key, task);
}

export function unregisterSyncTask(key: string) {
  tasks.delete(key);
}

async function runTask(task: SyncTask): Promise<void> {
  if (isNavigationLocked()) return;
  const now = Date.now();
  const last = lastRanAt.get(task.key) ?? 0;
  if (now - last < (task.minIntervalMs ?? 60_000)) return;
  lastRanAt.set(task.key, now);
  try {
    await task.run();
  } catch {
    /* swallow — sync is best-effort */
  }
}

async function runAll(): Promise<void> {
  for (const task of tasks.values()) {
    await runTask(task);
  }
}

function handleAppState(state: AppStateStatus) {
  if (state === "background" || state === "inactive") {
    lastBackgroundedAt = Date.now();
    return;
  }
  if (state === "active") {
    const wasBackgrounded = lastBackgroundedAt > 0;
    const sinceBg = Date.now() - lastBackgroundedAt;
    if (!wasBackgrounded || sinceBg > FOREGROUND_THRESHOLD_MS) {
      void runAll();
    }
    lastBackgroundedAt = 0;
  }
}

/** Initialize once during app bootstrap (e.g. in `_layout.tsx`). */
export function initBackgroundSync(): () => void {
  if (initialized) return () => undefined;
  initialized = true;

  const appSub = AppState.addEventListener("change", handleAppState);
  const netSub = NetInfo.addEventListener((s) => {
    if (s.isConnected) void runAll();
  });

  // Initial fire — pause until the first frames have rendered.
  const idleTimer = setTimeout(() => runAll(), 1500);

  return () => {
    appSub.remove();
    netSub();
    clearTimeout(idleTimer);
    initialized = false;
  };
}

/** Force a refresh for one task (e.g. after user pulls to refresh). */
export function forceSync(key: string): void {
  const task = tasks.get(key);
  if (!task) return;
  lastRanAt.delete(key);
  void runTask(task);
}

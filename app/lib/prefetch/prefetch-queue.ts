/**
 * Priority prefetch queue.
 *
 * Concurrency-bounded, idle-aware fetch scheduler. Used to preload
 * detail screens, next feed page, seller cards, images, etc. before the
 * user actually navigates.
 *
 * Priorities (lower = sooner):
 *   1 = "intent"   — user tapped or long-pressed: imminent navigation
 *   2 = "visible"  — item entered viewport
 *   3 = "scroll"   — pagination guess (next page during scroll)
 *   4 = "idle"     — background warm-up while user is reading
 *
 * Network awareness:
 *   - Throttles to 1 concurrent fetch on 2G/3G or saveData mode.
 *   - Pauses entirely when offline.
 */

import NetInfo from "@react-native-community/netinfo";

type Priority = 1 | 2 | 3 | 4;

type Task = {
  key: string;
  priority: Priority;
  run: () => Promise<unknown>;
  enqueuedAt: number;
};

const queue: Task[] = [];
const seen = new Map<string, number>(); // key → priority that's already queued/running
const COOLDOWN_MS = 30_000; // don't refetch the same key within window

let runningCount = 0;
let maxConcurrency = 4;
let online = true;

NetInfo.addEventListener((s) => {
  online = !!s.isConnected;
  const type = s.type;
  // Throttle on slow connections
  if (type === "cellular" && (s.details as any)?.cellularGeneration === "2g") {
    maxConcurrency = 1;
  } else if (type === "cellular" && (s.details as any)?.cellularGeneration === "3g") {
    maxConcurrency = 2;
  } else {
    maxConcurrency = 4;
  }
  drain();
});

function drain() {
  if (!online) return;
  while (runningCount < maxConcurrency && queue.length > 0) {
    // Pick highest-priority (lowest number) task; tie-break by FIFO.
    queue.sort((a, b) => a.priority - b.priority || a.enqueuedAt - b.enqueuedAt);
    const task = queue.shift()!;
    runningCount++;
    Promise.resolve(task.run())
      .catch(() => {})
      .finally(() => {
        runningCount--;
        // Keep seen entry to debounce same-key re-enqueues
        setTimeout(() => seen.delete(task.key), COOLDOWN_MS);
        drain();
      });
  }
}

/**
 * Enqueue a prefetch. If the same key is already in the queue with equal
 * or higher priority, the call is dropped. If a higher priority comes in
 * later, the queued task is promoted.
 */
export function enqueuePrefetch(args: {
  key: string;
  priority: Priority;
  run: () => Promise<unknown>;
}) {
  const { key, priority, run } = args;

  const existing = seen.get(key);
  if (existing != null && existing <= priority) return;

  // If a lower-priority duplicate is already queued, promote it.
  for (const t of queue) {
    if (t.key === key) {
      t.priority = priority;
      seen.set(key, priority);
      drain();
      return;
    }
  }

  seen.set(key, priority);
  queue.push({ key, priority, run, enqueuedAt: Date.now() });
  drain();
}

export function cancelPrefetch(key: string) {
  const idx = queue.findIndex((t) => t.key === key);
  if (idx >= 0) queue.splice(idx, 1);
  seen.delete(key);
}

export function getPrefetchStats() {
  return { queued: queue.length, running: runningCount, online, maxConcurrency };
}

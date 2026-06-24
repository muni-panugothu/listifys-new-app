/**
 * In-flight request deduplication.
 *
 * Concurrent callers with the same key share the same promise instead of
 * firing duplicate network requests. Once the promise settles (success or
 * failure) the key is freed so future calls can run fresh requests.
 *
 * Use for:
 *   - Login / register (block double-submit while the request is pending)
 *   - Send offer / create listing / submit review
 *   - Save / follow / unfollow toggles
 *   - GET endpoints called from multiple components on the same render
 */

const pending = new Map<string, Promise<unknown>>();

export function dedupeRequest<T>(key: string, factory: () => Promise<T>): Promise<T> {
  const existing = pending.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const promise = (async () => {
    try {
      return await factory();
    } finally {
      pending.delete(key);
    }
  })();

  pending.set(key, promise);
  return promise;
}

export function isRequestPending(key: string): boolean {
  return pending.has(key);
}

export function cancelAllRequestDedup() {
  pending.clear();
}

/**
 * React hook on top of the tiered cache.
 *
 * Renders cached data INSTANTLY (L1 or L2) and triggers a background
 * revalidate. Components consume `{ data, source, isFetching }` and never
 * see a blank state if anything was cached.
 *
 * Usage:
 *   const { data, isFetching } = useSwrQuery({
 *     key: CacheKeys.homeFeed(1, "US"),
 *     fetcher: () => fetchHomeFeed({ limit: 12, page: 1 }),
 *     ttlMs: 30_000,
 *   });
 */

import { useEffect, useRef, useState } from "react";

import {
  subscribeCache,
  swrGet,
  type SwrOptions,
} from "@/lib/cache/tiered-cache";

type UseSwrQueryArgs<T> = SwrOptions<T> & {
  key: string;
  fetcher: () => Promise<T>;
  /** Don't fire the fetcher when false. Useful for gated screens. */
  enabled?: boolean;
};

type UseSwrQueryState<T> = {
  data: T | undefined;
  source: "memory-fresh" | "memory-stale" | "disk-fresh" | "disk-stale" | "network" | null;
  isFetching: boolean;
  error: Error | null;
  refetch: () => void;
};

export function useSwrQuery<T>(args: UseSwrQueryArgs<T>): UseSwrQueryState<T> {
  const { key, fetcher, enabled = true, ...options } = args;

  const [state, setState] = useState<{
    data: T | undefined;
    source: UseSwrQueryState<T>["source"];
    isFetching: boolean;
    error: Error | null;
  }>({
    data: undefined,
    source: null,
    isFetching: enabled,
    error: null,
  });

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const refetch = () => {
    if (!enabledRef.current) return;
    setState((s) => ({ ...s, isFetching: true }));
    void run();
  };

  const run = async () => {
    if (!enabledRef.current) return;
    try {
      const res = await swrGet(key, () => fetcherRef.current(), optionsRef.current);
      setState({ data: res.data, source: res.source, isFetching: false, error: null });
    } catch (err) {
      setState((s) => ({
        ...s,
        isFetching: false,
        error: err instanceof Error ? err : new Error("Unknown error"),
      }));
    }
  };

  useEffect(() => {
    if (!enabled) return;
    void run();
    const unsub = subscribeCache((event) => {
      if (event.type === "set" && event.key === key) {
        void run();
      }
      if (event.type === "invalidate" && (event.key === key || key.startsWith(event.key))) {
        void run();
      }
    });
    return () => {
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);

  return { ...state, refetch };
}

/**
 * useSwrListing — screen-first / cache-first listing detail hook.
 *
 * Returns immediately with whatever is in cache (seed from feed, or a previous
 * fetch). If the cached value is stale, a background fetch refreshes it and
 * subscribers re-render. Use this in detail screens so they NEVER block on a
 * full-screen spinner.
 *
 * Usage:
 *
 *   const { listing, isLoading, error, refresh } = useSwrListing(category, id);
 *
 *   // Render the shell unconditionally:
 *   return <DetailShell listing={listing} loading={isLoading} />;
 */
import { useCallback, useEffect, useRef, useState } from "react";

import {
  cacheKeys,
  getCachedStale,
  subscribeCache,
  swrFetch,
} from "@/lib/cache";
import { fetchListingById, type ListingItem } from "@/features/listing/services/listing-api";
import type { CategorySlug } from "@/constants/categories";

type State = {
  listing: ListingItem | undefined;
  isLoading: boolean;
  isStale: boolean;
  error: Error | null;
};

function snapshot(
  categorySlug: CategorySlug,
  id: string | null | undefined,
): { listing: ListingItem | undefined; isStale: boolean } {
  if (!id) return { listing: undefined, isStale: false };
  const cached = getCachedStale<{ listing?: ListingItem }>(
    cacheKeys.listingDetail(categorySlug, id),
  );
  if (!cached) return { listing: undefined, isStale: false };
  return { listing: cached.data.listing, isStale: cached.isStale };
}

export function useSwrListing(
  categorySlug: CategorySlug,
  id: string | null | undefined,
  opts: { ttlMs?: number; enabled?: boolean } = {},
) {
  const { ttlMs = 120_000, enabled = true } = opts;

  const initial = snapshot(categorySlug, id);

  const [state, setState] = useState<State>({
    listing: initial.listing,
    isLoading: !initial.listing && Boolean(id) && enabled,
    isStale: initial.isStale,
    error: null,
  });

  // Track latest values so subscribers see fresh closures.
  const lastIdRef = useRef(id ?? null);
  lastIdRef.current = id ?? null;

  const fetcher = useCallback(async () => {
    if (!id) throw new Error("missing-id");
    // Stale-while-revalidate: show feed-seeded cache instantly, refresh in background.
    return fetchListingById(categorySlug, id, { fresh: false });
  }, [categorySlug, id]);

  const refresh = useCallback(async () => {
    if (!id) return;
    try {
      await swrFetch(
        cacheKeys.listingDetail(categorySlug, id),
        fetcher,
        ttlMs,
      ).refresh();
    } catch (err) {
      setState((s) => ({ ...s, error: err as Error, isLoading: false }));
    }
  }, [categorySlug, id, ttlMs, fetcher]);

  useEffect(() => {
    if (!id || !enabled) return;

    const key = cacheKeys.listingDetail(categorySlug, id);

    // Kick off SWR — renders return cached data; we refresh in background.
    const result = swrFetch<{ listing?: ListingItem }>(key, fetcher, ttlMs);

    setState({
      listing: result.data?.listing,
      isLoading: !result.data,
      isStale: result.isStale,
      error: null,
    });

    // Subscribe to cache updates so we re-render when the network resolves.
    const unsub = subscribeCache(key, () => {
      if (lastIdRef.current !== id) return;
      const next = getCachedStale<{ listing?: ListingItem }>(key);
      if (!next) {
        setState({ listing: undefined, isLoading: false, isStale: false, error: null });
        return;
      }
      setState({
        listing: next.data.listing,
        isLoading: false,
        isStale: next.isStale,
        error: null,
      });
    });

    // swrFetch already kicks off refresh when cache is missing or stale.
    // Only attach error handler — avoid duplicate network requests on mount.
    if (result.isStale || !result.data) {
      result.refresh().catch((err) => {
        if (lastIdRef.current === id) {
          setState((s) => ({ ...s, error: err as Error, isLoading: false }));
        }
      });
    }

    return unsub;
  }, [categorySlug, id, enabled, fetcher, ttlMs]);

  return {
    listing: state.listing,
    isLoading: state.isLoading,
    isStale: state.isStale,
    error: state.error,
    refresh,
  };
}

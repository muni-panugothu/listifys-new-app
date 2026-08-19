import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { resolveWeekStoryConfig } from "@/features/events/data/events-week-story";
import type { EventsWeekCategory } from "@/features/events/data/events-discovery";
import { fetchUpcomingEventsReliable } from "@/features/events/services/events-api";
import type { ListingItem } from "@/features/listing/services/listing-api";
import {
  buildLocationQueryParams,
  type LocationQueryState,
} from "@/lib/location-query-params";

const STORY_LIMIT = 20;

function filterForWeekCategory(
  listings: ListingItem[],
  weekCategory: EventsWeekCategory,
): ListingItem[] {
  const id = weekCategory.id;
  if (id === "nightlife") {
    return listings.filter((item) => {
      const hay = `${item.title} ${item.description ?? ""} ${(item.features as string[] | undefined)?.join(" ") ?? ""}`.toLowerCase();
      return /club|dj|night|party|bar|after.?dark|karaoke/.test(hay);
    });
  }
  if (id === "social") {
    return listings.filter((item) => {
      const hay = `${item.title} ${item.description ?? ""}`.toLowerCase();
      return /social|mixer|network|meetup|community/.test(hay);
    });
  }
  if (id === "family") {
    return listings.filter((item) => {
      const hay = `${item.title} ${item.description ?? ""} ${(item.features as string[] | undefined)?.join(" ") ?? ""}`.toLowerCase();
      return /family|kids|child|children/.test(hay);
    });
  }
  return listings;
}

export type UseCategoryStoryEventsOptions = {
  weekCategory: EventsWeekCategory;
  locationState: LocationQueryState;
};

export function useCategoryStoryEvents(opts: UseCategoryStoryEventsOptions) {
  const { weekCategory, locationState } = opts;
  const config = useMemo(
    () => resolveWeekStoryConfig(weekCategory),
    [weekCategory],
  );

  const [events, setEvents] = useState<ListingItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const seqRef = useRef(0);

  const load = useCallback(async () => {
    const seq = ++seqRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const apiSubcategory =
        weekCategory.subcategory ?? config.apiSubcategory;
      const geo = buildLocationQueryParams(locationState, { radius: 100 });
      const hasGeo = geo.lat != null && geo.lng != null;
      const params: Parameters<typeof fetchUpcomingEventsReliable>[0] = {
        subcategory: apiSubcategory,
        limit: STORY_LIMIT,
        sort: hasGeo ? "nearest" : "newest",
        ...geo,
      };

      const res = await fetchUpcomingEventsReliable(params, { force: true });
      if (seq !== seqRef.current) return;

      let listings = res.listings ?? [];
      listings = filterForWeekCategory(listings, weekCategory);
      setEvents(listings);
    } catch (err) {
      if (seq !== seqRef.current) return;
      setError(err as Error);
      setEvents([]);
    } finally {
      if (seq === seqRef.current) setIsLoading(false);
    }
  }, [config.apiSubcategory, locationState, weekCategory]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    events,
    config,
    isLoading,
    error,
    refresh: load,
  };
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { resolveWeekStoryConfig } from "@/features/events/data/events-week-story";
import type { EventsWeekCategory } from "@/features/events/data/events-discovery";
import { fetchUpcomingEventsReliable } from "@/features/events/services/events-api";
import type { ListingItem } from "@/features/listing/services/listing-api";

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
  lat?: number;
  lng?: number;
  countryCode?: string | null;
  locationLabel?: string | null;
};

export function useCategoryStoryEvents(opts: UseCategoryStoryEventsOptions) {
  const { weekCategory, lat, lng, countryCode, locationLabel } = opts;
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
      const params: Parameters<typeof fetchUpcomingEvents>[0] = {
        subcategory: apiSubcategory,
        limit: STORY_LIMIT,
        sort: lat != null && lng != null ? "nearest" : "newest",
      };
      if (lat != null && lng != null) {
        params.lat = lat;
        params.lng = lng;
        params.radius = 50;
        if (countryCode) params.countryCode = countryCode;
      }

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
  }, [config.apiSubcategory, countryCode, lat, lng, weekCategory]);

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

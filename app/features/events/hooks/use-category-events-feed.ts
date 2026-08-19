import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  CategoryDateFilterId,
  CategorySortId,
  CategorySubTab,
} from "@/features/events/data/events-category-config";
import {
  fetchUpcomingEventsReliable,
  type EventsQueryParams,
} from "@/features/events/services/events-api";
import type { ListingItem } from "@/features/listing/services/listing-api";
import {
  buildLocationQueryParams,
  type LocationQueryState,
} from "@/lib/location-query-params";
import {
  dateKey,
  eventOccursOnDate,
} from "@/lib/event-dates";

const PAGE_SIZE = 20;

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function isWeekendDay(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function filterByTabKeyword(
  listings: ListingItem[],
  tab: CategorySubTab,
): ListingItem[] {
  const keyword = tab.keyword?.trim().toLowerCase();
  if (!keyword || tab.id === "all") return listings;
  return listings.filter((item) => {
    const title = item.title?.toLowerCase() ?? "";
    const desc = item.description?.toLowerCase() ?? "";
    const features = ((item.features as string[] | undefined) ?? []).join(" ").toLowerCase();
    return (
      title.includes(keyword) ||
      desc.includes(keyword) ||
      features.includes(keyword)
    );
  });
}

function filterByDatePreset(
  listings: ListingItem[],
  preset: CategoryDateFilterId,
): ListingItem[] {
  if (preset === "all") return listings;

  const today = new Date();
  if (preset === "today") {
    return listings.filter((item) =>
      eventOccursOnDate(
        {
          eventDate: item.eventDate as string | undefined,
          eventTime: item.eventTime as string | undefined,
          startDate: item.startDate as string | undefined,
          endDate: item.endDate as string | undefined,
        },
        today,
      ),
    );
  }

  if (preset === "tomorrow") {
    const tomorrow = addDays(today, 1);
    return listings.filter((item) =>
      eventOccursOnDate(
        {
          eventDate: item.eventDate as string | undefined,
          eventTime: item.eventTime as string | undefined,
          startDate: item.startDate as string | undefined,
          endDate: item.endDate as string | undefined,
        },
        tomorrow,
      ),
    );
  }

  if (preset === "weekend") {
    const today = new Date();
    const daysUntilSaturday = (6 - today.getDay() + 7) % 7;
    const saturday = addDays(today, daysUntilSaturday === 0 ? 7 : daysUntilSaturday);
    const sunday = addDays(saturday, 1);
    return listings.filter((item) => {
      const fields = {
        eventDate: item.eventDate as string | undefined,
        eventTime: item.eventTime as string | undefined,
        startDate: item.startDate as string | undefined,
        endDate: item.endDate as string | undefined,
      };
      return (
        eventOccursOnDate(fields, saturday) || eventOccursOnDate(fields, sunday)
      );
    });
  }

  return listings;
}

type FeedState = {
  listings: ListingItem[];
  featured: ListingItem[];
  hasMore: boolean;
  page: number;
  isLoading: boolean;
  isLoadingMore: boolean;
  isRefreshing: boolean;
  error: Error | null;
};

export type UseCategoryEventsFeedOptions = {
  apiSubcategory: string;
  activeTab: CategorySubTab;
  dateFilter: CategoryDateFilterId;
  sort: CategorySortId;
  under10km?: boolean;
  locationState?: LocationQueryState;
  lat?: number;
  lng?: number;
  countryCode?: string | null;
  locationLabel?: string | null;
  enabled?: boolean;
};

export function useCategoryEventsFeed(opts: UseCategoryEventsFeedOptions) {
  const {
    apiSubcategory,
    activeTab,
    dateFilter,
    sort,
    under10km = false,
    locationState,
    lat,
    lng,
    countryCode,
    locationLabel,
    enabled = true,
  } = opts;

  const [feed, setFeed] = useState<FeedState>({
    listings: [],
    featured: [],
    hasMore: false,
    page: 1,
    isLoading: true,
    isLoadingMore: false,
    isRefreshing: false,
    error: null,
  });

  const loadSeqRef = useRef(0);
  const lastQueryRef = useRef<string>("");

  const queryParams = useMemo((): EventsQueryParams => {
    const radius = under10km ? 10 : 100;
    const geo = locationState
      ? buildLocationQueryParams(locationState, { radius })
      : lat != null && lng != null
        ? {
            lat,
            lng,
            radius,
            countryCode: countryCode ?? undefined,
          }
        : {};

    const hasGeo = geo.lat != null && geo.lng != null;
    const useNearest =
      under10km || (sort === "nearby" && hasGeo);

    const params: EventsQueryParams = {
      subcategory: apiSubcategory,
      limit: PAGE_SIZE,
      sort: useNearest ? "nearest" : sort === "date" ? "date" : "newest",
      ...geo,
    };

    if (dateFilter === "today") {
      params.date = dateKey(new Date());
    } else if (dateFilter === "tomorrow") {
      params.date = dateKey(addDays(new Date(), 1));
    }

    return params;
  }, [
    apiSubcategory,
    countryCode,
    dateFilter,
    lat,
    lng,
    locationLabel,
    locationState,
    sort,
    under10km,
  ]);

  const querySignature = useMemo(
    () =>
      JSON.stringify({
        ...queryParams,
        tabId: activeTab.id,
        dateFilter,
        sort,
        under10km,
      }),
    [activeTab.id, dateFilter, queryParams, sort, under10km],
  );

  const processListings = useCallback(
    (raw: ListingItem[]) => {
      let listings = filterByTabKeyword(raw, activeTab);
      if (dateFilter === "weekend") {
        listings = filterByDatePreset(listings, "weekend");
      }
      return listings;
    },
    [activeTab, dateFilter],
  );

  const loadPage = useCallback(
    async (page: number, mode: "replace" | "append" | "refresh") => {
      if (!enabled) return;

      const seq = ++loadSeqRef.current;
      setFeed((s) => ({
        ...s,
        isLoading: mode === "replace",
        isLoadingMore: mode === "append",
        isRefreshing: mode === "refresh",
        error: null,
      }));

      try {
        const result = await fetchUpcomingEventsReliable(
          { ...queryParams, page },
          { force: mode === "refresh" },
        );

        if (seq !== loadSeqRef.current) return;

        const processed = processListings(result.listings ?? []);
        const featured = [...processed]
          .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))
          .slice(0, 8);

        setFeed((s) => ({
          listings:
            mode === "append" ? [...s.listings, ...processed] : processed,
          featured: mode === "append" ? s.featured : featured,
          hasMore: result.pagination?.hasMore ?? false,
          page,
          isLoading: false,
          isLoadingMore: false,
          isRefreshing: false,
          error: null,
        }));
      } catch (err) {
        if (seq !== loadSeqRef.current) return;
        setFeed((s) => ({
          ...s,
          isLoading: false,
          isLoadingMore: false,
          isRefreshing: false,
          error: err as Error,
        }));
      }
    },
    [enabled, processListings, queryParams],
  );

  useEffect(() => {
    if (!enabled) return;
    lastQueryRef.current = querySignature;
    setFeed((s) => ({ ...s, listings: [], featured: [], page: 1, isLoading: true }));
    void loadPage(1, "replace");
  }, [enabled, loadPage, querySignature]);

  const loadMore = useCallback(() => {
    if (feed.isLoadingMore || !feed.hasMore || feed.isLoading) return;
    void loadPage(feed.page + 1, "append");
  }, [feed.hasMore, feed.isLoading, feed.isLoadingMore, feed.page, loadPage]);

  const refresh = useCallback(async () => {
    lastQueryRef.current = "";
    await loadPage(1, "refresh");
  }, [loadPage]);

  return {
    ...feed,
    loadMore,
    refresh,
  };
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  fetchEventCalendarSummary,
  fetchUpcomingEvents,
  prefetchUpcomingEvents,
  type EventsQueryParams,
  type EventCalendarSummary,
  type UpcomingEventsResponse,
} from "@/features/events/services/events-api";
import type { ListingItem } from "@/features/listing/services/listing-api";
import {
  buildDateStripItems,
  dateKey,
  eventOccursOnDate,
  parseDateKey,
  type DateStripItem,
} from "@/lib/event-dates";
import { cacheKeys, getCachedStale, subscribeCache, swrFetch } from "@/lib/cache";

type FeedState = {
  listings: ListingItem[];
  hasMore: boolean;
  page: number;
  isLoading: boolean;
  isLoadingMore: boolean;
  isRefreshing: boolean;
  error: Error | null;
};

type CalendarState = {
  counts: Record<string, number>;
  stripItems: DateStripItem[];
  isLoading: boolean;
  error: Error | null;
};

function calendarCacheKey(params: EventsQueryParams): string {
  const { date: _d, page: _p, limit: _l, ...rest } = params;
  return cacheKeys.eventsCalendar(
    JSON.stringify({ ...rest, days: rest.days ?? 60 }),
  );
}

function upcomingCacheKey(params: EventsQueryParams, page: number): string {
  return cacheKeys.eventsUpcoming(
    JSON.stringify({ ...params, page }),
  );
}

export function useEventsFeed(baseParams: EventsQueryParams) {
  const [selectedDateKey, setSelectedDateKey] = useState(() => dateKey(new Date()));
  const [feed, setFeed] = useState<FeedState>({
    listings: [],
    hasMore: false,
    page: 1,
    isLoading: true,
    isLoadingMore: false,
    isRefreshing: false,
    error: null,
  });

  const calendarParams = useMemo(
    () => ({
      subcategory: baseParams.subcategory,
      lat: baseParams.lat,
      lng: baseParams.lng,
      radius: baseParams.radius,
      countryCode: baseParams.countryCode,
      days: baseParams.days ?? 60,
    }),
    [
      baseParams.subcategory,
      baseParams.lat,
      baseParams.lng,
      baseParams.radius,
      baseParams.countryCode,
      baseParams.days,
    ],
  );

  const eventParams = useMemo(
    (): EventsQueryParams => ({
      ...baseParams,
      date: selectedDateKey,
      page: 1,
      limit: baseParams.limit ?? 30,
    }),
    [baseParams, selectedDateKey],
  );

  const calKey = calendarCacheKey(calendarParams);
  const initialCal = getCachedStale<EventCalendarSummary>(calKey);

  const [calendar, setCalendar] = useState<CalendarState>(() => ({
    counts: initialCal?.data.counts ?? {},
    stripItems: buildDateStripItems(initialCal?.data.counts ?? {}),
    isLoading: !initialCal,
    error: null,
  }));

  const lastParamsRef = useRef(eventParams);
  lastParamsRef.current = eventParams;
  const loadSeqRef = useRef(0);

  // Clear list immediately when selected date changes so stale cards don't linger.
  useEffect(() => {
    setFeed((s) => ({
      ...s,
      listings: [],
      isLoading: true,
      hasMore: false,
      page: 1,
    }));
  }, [selectedDateKey]);

  // ── Calendar summary (SWR) ──────────────────────────────────────────────────
  useEffect(() => {
    const fetcher = () => fetchEventCalendarSummary(calendarParams);
    const result = swrFetch<EventCalendarSummary>(calKey, fetcher, 30_000);

    if (result.data) {
      setCalendar({
        counts: result.data.counts,
        stripItems: buildDateStripItems(result.data.counts),
        isLoading: false,
        error: null,
      });
    } else {
      setCalendar((s) => ({ ...s, isLoading: true }));
    }

    const unsub = subscribeCache(calKey, () => {
      const next = getCachedStale<EventCalendarSummary>(calKey);
      if (!next) return;
      setCalendar({
        counts: next.data.counts,
        stripItems: buildDateStripItems(next.data.counts),
        isLoading: false,
        error: null,
      });
    });

    result.refresh().catch((err) => {
      setCalendar((s) => ({ ...s, isLoading: false, error: err as Error }));
    });

    return unsub;
  }, [calKey, calendarParams]);

  // ── Events list for selected date ─────────────────────────────────────────
  const loadPage = useCallback(
    async (page: number, mode: "replace" | "append" | "refresh") => {
      const params = { ...lastParamsRef.current, page };
      const key = upcomingCacheKey(params, page);
      const seq = ++loadSeqRef.current;

      setFeed((s) => ({
        ...s,
        isLoading: mode === "replace",
        isLoadingMore: mode === "append",
        isRefreshing: mode === "refresh",
        error: null,
      }));

      try {
        const fetcher = () => fetchUpcomingEvents(params, { force: mode === "replace" });
        let result: UpcomingEventsResponse;
        if (mode === "refresh") {
          result = await swrFetch<UpcomingEventsResponse>(key, fetcher, 30_000).refresh();
        } else {
          result = await fetchUpcomingEvents(params, { force: mode === "replace" });
        }

        if (seq !== loadSeqRef.current) return;

        const day = params.date ? parseDateKey(params.date) : null;
        let listings = result.listings ?? [];
        if (day) {
          listings = listings.filter((item) =>
            eventOccursOnDate(
              {
                eventDate: item.eventDate as string | undefined,
                eventTime: item.eventTime as string | undefined,
                startDate: item.startDate as string | undefined,
                endDate: item.endDate as string | undefined,
              },
              day,
            ),
          );
        }

        setFeed((s) => ({
          listings:
            mode === "append"
              ? [...s.listings, ...listings]
              : listings,
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
    [],
  );

  useEffect(() => {
    void loadPage(1, "replace");
  }, [eventParams, loadPage]);

  // Prefetch adjacent dates
  useEffect(() => {
    const idx = calendar.stripItems.findIndex((d) => d.key === selectedDateKey);
    if (idx < 0) return;
    const neighbors = [calendar.stripItems[idx - 1], calendar.stripItems[idx + 1]].filter(Boolean);
    for (const n of neighbors) {
      prefetchUpcomingEvents({ ...baseParams, date: n.key, page: 1, limit: baseParams.limit ?? 30 });
    }
  }, [selectedDateKey, calendar.stripItems, baseParams]);

  const selectDate = useCallback((key: string) => {
    setSelectedDateKey(key);
  }, []);

  const loadMore = useCallback(() => {
    if (feed.isLoadingMore || !feed.hasMore) return;
    void loadPage(feed.page + 1, "append");
  }, [feed.hasMore, feed.isLoadingMore, feed.page, loadPage]);

  const refresh = useCallback(async () => {
    await Promise.all([
      swrFetch(calKey, () => fetchEventCalendarSummary(calendarParams), 30_000).refresh(),
      loadPage(1, "refresh"),
    ]);
  }, [calKey, calendarParams, loadPage]);

  const selectedDate =
    calendar.stripItems.find((d) => d.key === selectedDateKey)?.date ??
    new Date();

  const selectedCount = calendar.counts[selectedDateKey] ?? feed.listings.length;

  return {
    selectedDateKey,
    selectedDate,
    selectedCount,
    selectDate,
    calendar,
    feed,
    loadMore,
    refresh,
  };
}

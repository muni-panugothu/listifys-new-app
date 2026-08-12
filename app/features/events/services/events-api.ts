import { requestJson } from "@/features/auth/services/auth-api";
import type { ListingItem } from "@/features/listing/services/listing-api";
import { normalizeListingItem } from "@/features/listing/services/listing-api";
import { cacheKeys, invalidateCache, seedListingsBatch, withCache } from "@/lib/cache";

export type EventCalendarSummary = {
  success: boolean;
  counts: Record<string, number>;
  dates: Array<{ date: string; count: number }>;
  totalDays: number;
};

export type UpcomingEventsResponse = {
  success: boolean;
  listings: ListingItem[];
  pagination?: {
    page: number;
    limit: number;
    hasMore: boolean;
  };
};

export type EventsQueryParams = {
  date?: string;
  search?: string;
  subcategory?: string;
  sort?: string;
  location?: string;
  lat?: number;
  lng?: number;
  radius?: number;
  countryCode?: string | null;
  page?: number;
  limit?: number;
  days?: number;
  /** Upcoming Saturday–Sunday */
  weekend?: boolean;
};

function buildQuery(params: EventsQueryParams): string {
  const query = new URLSearchParams();
  if (params.date) query.set("date", params.date);
  if (params.search) query.set("search", params.search);
  if (params.subcategory && params.subcategory !== "All") {
    query.set("subcategory", params.subcategory);
  }
  if (params.sort) query.set("sort", params.sort);
  if (params.location) query.set("location", params.location);
  if (params.lat != null) query.set("lat", String(params.lat));
  if (params.lng != null) query.set("lng", String(params.lng));
  if (params.radius != null) query.set("radius", String(params.radius));
  if (params.countryCode) query.set("countryCode", params.countryCode);
  if (params.page) query.set("page", String(params.page));
  if (params.limit) query.set("limit", String(params.limit));
  if (params.days) query.set("days", String(params.days));
  if (params.weekend) query.set("weekend", "1");
  return query.toString();
}

export async function fetchEventCalendarSummary(
  params: EventsQueryParams = {},
): Promise<EventCalendarSummary> {
  const qs = buildQuery(params);
  const key = cacheKeys.eventsCalendar(qs);

  return withCache(
    key,
    () =>
      requestJson<EventCalendarSummary>(
        `/api/events/calendar/summary${qs ? `?${qs}` : ""}`,
      ),
    30_000,
  );
}

export async function fetchUpcomingEvents(
  params: EventsQueryParams = {},
  opts: { force?: boolean } = {},
): Promise<UpcomingEventsResponse> {
  const qs = buildQuery(params);
  const key = cacheKeys.eventsUpcoming(qs);

  if (opts.force) {
    invalidateCache(key);
  }

  return withCache(
    key,
    async () => {
      const response = await requestJson<UpcomingEventsResponse>(
        `/api/events/upcoming${qs ? `?${qs}` : ""}`,
      );
      const listings = (response.listings ?? []).map((item) =>
        normalizeListingItem(item as ListingItem),
      );
      seedListingsBatch(
        listings.map((listing) => ({ category: "events", listing })),
        120_000,
      );
      return {
        ...response,
        listings,
      };
    },
    30_000,
  );
}

/** Prefetch adjacent dates for snappy date-strip navigation. */
export function prefetchUpcomingEvents(params: EventsQueryParams): void {
  void fetchUpcomingEvents(params).catch(() => {});
}

export function invalidateEventsCaches(): void {
  invalidateCache("events:");
}

export type SimilarEventsResponse = {
  success: boolean;
  listings: ListingItem[];
};

export async function fetchSimilarEvents(
  eventId: string,
  params: Pick<EventsQueryParams, "lat" | "lng" | "radius" | "countryCode"> & {
    limit?: number;
  } = {},
): Promise<SimilarEventsResponse> {
  const query = new URLSearchParams();
  if (params.lat != null) query.set("lat", String(params.lat));
  if (params.lng != null) query.set("lng", String(params.lng));
  if (params.radius != null) query.set("radius", String(params.radius));
  if (params.countryCode) query.set("countryCode", params.countryCode);
  if (params.limit) query.set("limit", String(params.limit));
  const qs = query.toString();
  const key = cacheKeys.eventsSimilar(eventId, qs);

  return withCache(
    key,
    async () => {
      const response = await requestJson<SimilarEventsResponse>(
        `/api/events/${eventId}/similar${qs ? `?${qs}` : ""}`,
      );
      return {
        ...response,
        listings: (response.listings ?? []).map((item) =>
          normalizeListingItem(item as ListingItem),
        ),
      };
    },
    60_000,
  );
}

export function prefetchSimilarEvents(
  eventId: string,
  params: Pick<EventsQueryParams, "lat" | "lng" | "radius" | "countryCode"> = {},
): void {
  void fetchSimilarEvents(eventId, params).catch(() => {});
}

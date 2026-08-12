import type { EventsAllFilterId } from "@/features/events/data/events-all-filters";
import type { EventsQueryParams } from "@/features/events/services/events-api";
import { dateKey } from "@/lib/event-dates";

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

/** Maps sticky All Events chip → API query (server-side where possible). */
export function buildEventsFilterQuery(
  filterId: EventsAllFilterId,
  opts: {
    lat?: number | null;
    lng?: number | null;
    countryCode?: string | null;
    locationLabel?: string | null;
  } = {},
): EventsQueryParams {
  const hasCoords = opts.lat != null && opts.lng != null;
  const params: EventsQueryParams = {
    limit: 50,
    sort: "newest",
    countryCode: opts.countryCode,
  };

  if (hasCoords && filterId === "under_10km") {
    params.lat = opts.lat ?? undefined;
    params.lng = opts.lng ?? undefined;
    params.radius = 10;
    params.sort = "nearest";
  }

  if (
    opts.locationLabel &&
    opts.locationLabel !== "Set location" &&
    !opts.locationLabel.startsWith("Detecting")
  ) {
    params.location = opts.locationLabel.split(",")[0]?.trim();
  }

  switch (filterId) {
    case "all":
      break;
    case "tomorrow":
      params.date = dateKey(addDays(new Date(), 1));
      break;
    case "weekend":
      params.weekend = true;
      break;
    case "under_10km":
      break;
    case "music":
    case "nightlife":
      params.subcategory = "Music";
      break;
    case "comedy":
      params.subcategory = "Comedy";
      break;
    case "food":
      params.subcategory = "Food & Drink";
      break;
    case "social":
    case "festivals":
      params.subcategory = "Community";
      break;
    case "workshops":
      params.subcategory = "Education";
      break;
    case "sports":
      params.subcategory = "Sports";
      break;
    case "family":
      params.subcategory = "Community";
      break;
    default:
      break;
  }

  return params;
}

/** Keyword / distance refinements applied after the API response. */
export function needsClientSideFilter(filterId: EventsAllFilterId): boolean {
  return (
    filterId === "nightlife" ||
    filterId === "social" ||
    filterId === "festivals" ||
    filterId === "family" ||
    filterId === "workshops" ||
    filterId === "under_10km"
  );
}

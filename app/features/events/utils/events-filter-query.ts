import type { EventsAllFilterId } from "@/features/events/data/events-all-filters";
import type { EventsQueryParams } from "@/features/events/services/events-api";
import {
  buildLocationQueryParams,
  type LocationQueryState,
} from "@/lib/location-query-params";
import { dateKey } from "@/lib/event-dates";

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

/** Maps sticky All Events chip → API query (server-side where possible). */
export function buildEventsFilterQuery(
  filterId: EventsAllFilterId,
  locationState: LocationQueryState,
): EventsQueryParams {
  const radius = filterId === "under_10km" ? 10 : 100;
  const geo = buildLocationQueryParams(locationState, { radius });
  const hasGeo = geo.lat != null && geo.lng != null;

  const params: EventsQueryParams = {
    limit: 50,
    sort: hasGeo ? "nearest" : "newest",
    ...geo,
  };

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

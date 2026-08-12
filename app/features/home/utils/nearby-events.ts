import type { ExploreNearYouItem } from "@/features/home/data/featured-mock-data";
import type { ListingItem } from "@/features/listing/services/listing-api";
import { formatEventDisplayLabel } from "@/lib/event-dates";
import { getListingCoverMediaUrl } from "@/lib/listing-media";

/** Location line for home explore cards — e.g. "Shilparamam | Hyderabad". */
export function formatExploreEventLocation(listing: ListingItem): string {
  const venue = ((listing as { venue?: string }).venue as string | undefined)?.trim();
  const location = listing.location?.trim() ?? "";

  if (!venue && !location) return "Location TBD";

  if (venue && location) {
    const parts = location.split(",").map((p) => p.trim()).filter(Boolean);
    const tail =
      parts.find((p) => p.toLowerCase() !== venue.toLowerCase()) ?? parts[0];
    return tail ? `${venue} | ${tail}` : venue;
  }

  return venue || location;
}

export function listingToExploreNearYouItem(listing: ListingItem): ExploreNearYouItem {
  const dateTime =
    formatEventDisplayLabel({
      eventDate: listing.eventDate as string | undefined,
      eventTime: listing.eventTime as string | undefined,
      startDate: listing.startDate as string | undefined,
      endDate: listing.endDate as string | undefined,
    }) || "Date TBD";

  return {
    id: listing._id,
    image:
      getListingCoverMediaUrl(listing) ||
      listing.images?.[0] ||
      "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=800&q=80",
    location: formatExploreEventLocation(listing),
    title: listing.title,
    dateTime,
  };
}

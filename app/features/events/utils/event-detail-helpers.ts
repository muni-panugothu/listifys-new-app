import type { FeaturedEventDummy } from "@/features/events/data/events-discovery";
import { FEATURED_EVENTS_DUMMY } from "@/features/events/data/events-discovery";
import type { ListingItem } from "@/features/listing/services/listing-api";
import { formatEventDisplayLabel } from "@/lib/event-dates";
import { formatPrice } from "@/lib/currency";
import { getListingDistanceLabel } from "@/lib/listing-distance";

export type EventOrganizerStats = {
  hostedEvents?: number;
  hostingDuration?: string | null;
  likedPercent?: number | null;
  ratingsCount?: number;
};

export type EventThingToKnow = {
  id: string;
  icon: "language" | "badge" | "confirmation-number" | "child-care" | "checkroom" | "info" | "local-activity";
  text: string;
};

export type EventDetailTheme = {
  sheetBg: string;
  sheetBorder: string;
  heroScrim: string;
  chipBorder: string;
  chipText: string;
  titleText: string;
  dateAccent: string;
  rowBg: string;
  rowIconBg: string;
  secondaryText: string;
  divider: string;
  bottomBarBg: string;
  ctaBg: string;
  ctaText: string;
  handleBar: string;
};

import type { ThemeColors } from "@/theme/theme-tokens";
import { buildEventsTheme } from "@/features/events/theme/events-theme";

export function buildEventDetailTheme(
  isDark: boolean,
  colors: ThemeColors,
): EventDetailTheme {
  const base = buildEventsTheme(colors, isDark);
  return {
    sheetBg: colors.surface,
    sheetBorder: base.divider,
    heroScrim: base.detailScrim,
    chipBorder: isDark ? "rgba(255,255,255,0.22)" : colors.border,
    chipText: colors.textPrimary,
    titleText: colors.textPrimary,
    dateAccent: isDark ? "#D4A853" : "#B8860B",
    rowBg: isDark ? colors.surfaceElevated : colors.background,
    rowIconBg: isDark ? "rgba(255,255,255,0.08)" : colors.primarySoft,
    secondaryText: colors.textSecondary,
    divider: base.divider,
    bottomBarBg: colors.surfaceElevated,
    ctaBg: isDark ? "#FFFFFF" : colors.textPrimary,
    ctaText: isDark ? "#111111" : colors.background,
    handleBar: isDark ? "rgba(255,255,255,0.28)" : colors.border,
  };
}

export function isLikelyVideoUrl(url: string): boolean {
  return /\.(mp4|mov|webm|m3u8)(\?|$)/i.test(url);
}

export function findDummyFeaturedEvent(id: string): FeaturedEventDummy | null {
  return FEATURED_EVENTS_DUMMY.find((e) => e.id === id) ?? null;
}

export function dummyToListingItem(item: FeaturedEventDummy): ListingItem {
  return {
    _id: item.id,
    title: item.title,
    images: item.image ? [item.image] : [],
    videos: item.videos,
    location: item.venue,
    venue: item.venue,
    price: item.price,
    currency: "₹",
    category: "Events",
    subcategory: item.category,
    eventDate: item.eventDate,
    eventTime: item.eventTime,
    description:
      "Join us for an unforgettable experience. Book your tickets early to secure your spot.",
    features: ["Ticket needed for entry", "Arrive 15 minutes early"],
    ageRestriction: "18+ only",
    ticketsAvailable: 100,
    organizer: "Event Host",
    sellerName: "Event Host",
  } as ListingItem;
}

export function buildEventTags(listing: ListingItem): string[] {
  const tags: string[] = [];
  const sub = listing.subcategory?.trim();
  if (sub) tags.push(sub);

  const features = (listing.features as string[] | undefined) ?? [];
  for (const f of features) {
    const trimmed = f.trim();
    if (trimmed && !tags.includes(trimmed) && tags.length < 4) {
      tags.push(trimmed);
    }
  }

  return tags.slice(0, 4);
}

export function buildEventScheduleLabel(listing: ListingItem): string {
  const eventTime = (listing.eventTime as string | undefined)?.trim();
  if (eventTime) {
    const start = eventTime.split(/[–\-•|]/)[0]?.trim();
    if (start) return `Starts at ${start}`;
  }
  return "View full schedule & timeline";
}

export function buildEventDateAccent(listing: ListingItem): string {
  return formatEventDisplayLabel({
    eventDate: listing.eventDate as string | undefined,
    eventTime: listing.eventTime as string | undefined,
    startDate: listing.startDate as string | undefined,
    endDate: listing.endDate as string | undefined,
  });
}

export function buildEventPriceLabel(
  listing: ListingItem,
  isoCountryCode?: string | null,
): string {
  if (listing.price == null || listing.price === 0) return "Free";
  return `${formatPrice(listing.price, listing.currency, listing.countryCode ?? isoCountryCode)} onwards`;
}

export function buildEventDistanceLabel(
  listing: ListingItem,
  userLatLng: { lat: number | null; lng: number | null } | null,
  isoCountryCode?: string | null,
): string | null {
  if (!userLatLng || userLatLng.lat == null || userLatLng.lng == null) return null;
  return (
    getListingDistanceLabel(
      listing,
      { lat: userLatLng.lat, lng: userLatLng.lng },
      isoCountryCode,
    ) ?? null
  );
}

export function buildThingsToKnow(listing: ListingItem): EventThingToKnow[] {
  const items: EventThingToKnow[] = [];
  const features = (listing.features as string[] | undefined) ?? [];
  const age = (listing.ageRestriction as string | undefined)?.trim();
  const dress = (listing.dressCode as string | undefined)?.trim();
  const tickets = Number((listing.ticketsAvailable as number | undefined) ?? 0);

  for (const feature of features) {
    const text = feature.trim();
    if (!text) continue;
    const lower = text.toLowerCase();
    let icon: EventThingToKnow["icon"] = "info";
    if (lower.includes("language") || lower.includes("telugu") || lower.includes("hindi")) {
      icon = "language";
    } else if (lower.includes("kid") || lower.includes("child")) {
      icon = "child-care";
    } else if (lower.includes("ticket")) {
      icon = "confirmation-number";
    } else if (lower.includes("entry") || lower.includes("age")) {
      icon = "badge";
    } else if (lower.includes("dress")) {
      icon = "checkroom";
    }
    items.push({ id: `feature-${items.length}`, icon, text });
  }

  if (age) {
    items.push({
      id: "age-restriction",
      icon: "badge",
      text: `Entry allowed for ${age}`,
    });
    if (!items.some((i) => i.text.toLowerCase().includes("ticket"))) {
      items.push({
        id: "ticket-age",
        icon: "confirmation-number",
        text: `Ticket needed for ${age}`,
      });
    }
  }

  if (dress) {
    items.push({ id: "dress-code", icon: "checkroom", text: dress });
  }

  if (tickets === 0) {
    items.push({
      id: "sold-out",
      icon: "local-activity",
      text: "Tickets currently unavailable",
    });
  }

  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.text.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildOrganizerName(listing: ListingItem): string {
  return (
    (listing.organizer as string | undefined)?.trim() ||
    listing.seller?.name?.trim() ||
    listing.sellerName?.trim() ||
    "Organizer"
  );
}

export function parseEventIdsParam(raw?: string | string[]): string[] {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value?.trim()) return [];
  return value.split(",").map((id) => id.trim()).filter(Boolean);
}

export function buildEventDetailParams(
  eventId: string,
  allIds: string[],
  index: number,
): Record<string, string> {
  return {
    id: eventId,
    eventIds: allIds.join(","),
    index: String(index),
    category: "events",
  };
}

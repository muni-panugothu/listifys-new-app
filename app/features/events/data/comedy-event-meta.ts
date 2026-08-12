/** Comedy show formats shown when posting and on discovery cards. */
export const COMEDY_FORMAT_OPTIONS = [
  "Stand-up",
  "Improv",
  "Open Mic",
  "Sketch",
  "Roast",
  "Other",
] as const;

export type ComedyFormat = (typeof COMEDY_FORMAT_OPTIONS)[number];

export const DEFAULT_COMEDY_FORMAT: ComedyFormat = "Stand-up";

export function formatComedyCategoryLabel(format?: string | null): string {
  const trimmed = format?.trim();
  if (trimmed) return `Comedy / ${trimmed}`;
  return "Comedy / Stand-up";
}

export function isComedyListing(listing: { subcategory?: string | null }): boolean {
  return listing.subcategory?.trim().toLowerCase() === "comedy";
}

export function getComedyCategoryLabel(listing: {
  subcategory?: string | null;
  eventFormat?: string | null;
}): string | null {
  if (!isComedyListing(listing)) return null;
  return formatComedyCategoryLabel(listing.eventFormat);
}

export function getEventDurationLabel(listing: {
  eventDuration?: string | null;
}): string | null {
  const duration = listing.eventDuration?.trim();
  return duration || null;
}

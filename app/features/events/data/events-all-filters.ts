export type EventsAllFilterId =
  | "all"
  | "tomorrow"
  | "weekend"
  | "under_10km"
  | "music"
  | "social"
  | "comedy"
  | "nightlife"
  | "food"
  | "workshops"
  | "festivals"
  | "family"
  | "sports";

export type EventsAllFilterChip = {
  id: EventsAllFilterId;
  label: string;
  /** Material icon for leading chips (Filters-style). */
  icon?: "tune" | "calendar-today" | "place";
  /** Show dropdown chevron like Filters / Date. */
  chevron?: boolean;
};

/** Sticky All Events filter chips (UI). */
export const EVENTS_ALL_FILTER_CHIPS: EventsAllFilterChip[] = [
  { id: "all", label: "All Events" },
  { id: "tomorrow", label: "Tomorrow" },
  { id: "weekend", label: "This Weekend" },
  { id: "under_10km", label: "Under 10km", icon: "place" },
  { id: "music", label: "Music" },
  { id: "social", label: "Social Mixers" },
  { id: "comedy", label: "Comedy" },
  { id: "nightlife", label: "Nightlife" },
  { id: "food", label: "Food & Drinks" },
  { id: "workshops", label: "Workshops" },
  { id: "festivals", label: "Festivals" },
  { id: "family", label: "Family" },
  { id: "sports", label: "Sports" },
];

/** Hints shown when posting an event — maps to Events hub week/explore categories. */
export const EVENT_SUBCATEGORY_HINTS: Record<string, string> = {
  Music: "Concerts, DJ nights, live bands — appears in Music & Nightlife",
  "Food & Drink": "Food festivals, tastings, pop-ups",
  Comedy: "Stand-up, improv, open mics",
  Sports: "Matches, tournaments, fitness events",
  Theater: "Plays, dance, drama performances",
  Education: "Workshops, seminars, training",
  Community: "Social mixers, festivals, family events",
  "Health & Wellness": "Yoga retreats, wellness camps",
  Business: "Summits, networking, conferences",
  Film: "Screenings, film festivals",
  Art: "Exhibitions, gallery openings",
  Other: "General events and meetups",
};

/** Preferred display order on the post/sell subcategory step. */
export const EVENT_SUBCATEGORY_ORDER = [
  "Music",
  "Food & Drink",
  "Comedy",
  "Sports",
  "Theater",
  "Education",
  "Community",
  "Business",
  "Health & Wellness",
  "Film",
  "Art",
  "Other",
] as const;

export function sortEventSubcategories(subcategories: string[]): string[] {
  const order = new Map(
    EVENT_SUBCATEGORY_ORDER.map((name, index) => [name, index]),
  );
  return [...subcategories].sort((a, b) => {
    const ai = order.get(a) ?? 999;
    const bi = order.get(b) ?? 999;
    if (ai !== bi) return ai - bi;
    return a.localeCompare(b);
  });
}

/**
 * Event category hierarchy + dynamic form fields (frontend mirror of eventsCategorySchema.js).
 */

export type EventFieldType = "text" | "textarea" | "number" | "boolean" | "select";

export type EventFormField = {
  key: string;
  label: string;
  type: EventFieldType;
  placeholder?: string;
  required?: boolean;
  options?: string[];
  multiline?: boolean;
  hint?: string;
};

export type EventSubcategoryDef = {
  label: string;
  apiSubcategory: string;
};

export type EventMainCategoryDef = {
  label: string;
  apiSubcategory: string;
  subcategories: Record<string, EventSubcategoryDef>;
};

export const EVENT_MAIN_CATEGORIES: Record<string, EventMainCategoryDef> = {
  music_nightlife: {
    label: "Music & Nightlife",
    apiSubcategory: "Music",
    subcategories: {
      concerts: { label: "Concerts", apiSubcategory: "Music" },
      dj_nights: { label: "DJ Nights", apiSubcategory: "Music" },
      live_bands: { label: "Live Bands", apiSubcategory: "Music" },
      music_festivals: { label: "Music Festivals", apiSubcategory: "Music" },
      open_mic: { label: "Open Mic", apiSubcategory: "Music" },
      classical_music: { label: "Classical Music", apiSubcategory: "Music" },
      acoustic: { label: "Acoustic / Unplugged", apiSubcategory: "Music" },
      club_nights: { label: "Club Nights", apiSubcategory: "Music" },
      other_music: { label: "Other Music Events", apiSubcategory: "Music" },
    },
  },
  food_drinks: {
    label: "Food & Drinks",
    apiSubcategory: "Food & Drink",
    subcategories: {
      food_festivals: { label: "Food Festivals", apiSubcategory: "Food & Drink" },
      food_tastings: { label: "Food Tastings", apiSubcategory: "Food & Drink" },
      restaurant_popups: { label: "Restaurant Pop-ups", apiSubcategory: "Food & Drink" },
      cooking_events: { label: "Cooking Events", apiSubcategory: "Food & Drink" },
      beverage_tastings: { label: "Wine / Beverage Tastings", apiSubcategory: "Food & Drink" },
      street_food: { label: "Street Food Events", apiSubcategory: "Food & Drink" },
      food_markets: { label: "Food Markets", apiSubcategory: "Food & Drink" },
      supper_clubs: { label: "Supper Clubs", apiSubcategory: "Food & Drink" },
      other_food: { label: "Other Food Events", apiSubcategory: "Food & Drink" },
    },
  },
  sports: {
    label: "Sports",
    apiSubcategory: "Sports",
    subcategories: {
      matches: { label: "Matches", apiSubcategory: "Sports" },
      tournaments: { label: "Tournaments", apiSubcategory: "Sports" },
      fitness_events: { label: "Fitness Events", apiSubcategory: "Sports" },
      marathons: { label: "Marathons", apiSubcategory: "Sports" },
      running: { label: "Running Events", apiSubcategory: "Sports" },
      cycling: { label: "Cycling Events", apiSubcategory: "Sports" },
      football: { label: "Football", apiSubcategory: "Sports" },
      cricket: { label: "Cricket", apiSubcategory: "Sports" },
      basketball: { label: "Basketball", apiSubcategory: "Sports" },
      badminton: { label: "Badminton", apiSubcategory: "Sports" },
      tennis: { label: "Tennis", apiSubcategory: "Sports" },
      esports: { label: "Esports", apiSubcategory: "Sports" },
      other_sports: { label: "Other Sports Events", apiSubcategory: "Sports" },
    },
  },
  theatre: {
    label: "Theatre & Performances",
    apiSubcategory: "Theater",
    subcategories: {
      plays: { label: "Plays", apiSubcategory: "Theater" },
      dance: { label: "Dance Performances", apiSubcategory: "Theater" },
      drama: { label: "Drama", apiSubcategory: "Theater" },
      musical_theatre: { label: "Musical Theatre", apiSubcategory: "Theater" },
      standup_performance: { label: "Stand-up Performance", apiSubcategory: "Comedy" },
      cultural: { label: "Cultural Performances", apiSubcategory: "Theater" },
      live_performance: { label: "Live Performances", apiSubcategory: "Theater" },
      improvisation: { label: "Improvisation", apiSubcategory: "Theater" },
      other_performance: { label: "Other Performances", apiSubcategory: "Theater" },
    },
  },
  education: {
    label: "Education",
    apiSubcategory: "Education",
    subcategories: {
      workshops: { label: "Workshops", apiSubcategory: "Education" },
      seminars: { label: "Seminars", apiSubcategory: "Education" },
      training: { label: "Training", apiSubcategory: "Education" },
      masterclasses: { label: "Masterclasses", apiSubcategory: "Education" },
      bootcamps: { label: "Bootcamps", apiSubcategory: "Education" },
      webinars: { label: "Webinars", apiSubcategory: "Education" },
      lectures: { label: "Lectures", apiSubcategory: "Education" },
      certification: { label: "Certification Programs", apiSubcategory: "Education" },
      skill_development: { label: "Skill Development", apiSubcategory: "Education" },
      other_education: { label: "Other Educational Events", apiSubcategory: "Education" },
    },
  },
  business: {
    label: "Business",
    apiSubcategory: "Business",
    subcategories: {
      summits: { label: "Summits", apiSubcategory: "Business" },
      networking: { label: "Networking", apiSubcategory: "Business" },
      conferences: { label: "Conferences", apiSubcategory: "Business" },
      business_seminars: { label: "Seminars", apiSubcategory: "Business" },
      meetups: { label: "Business Meetups", apiSubcategory: "Business" },
      startup: { label: "Startup Events", apiSubcategory: "Business" },
      trade_shows: { label: "Trade Shows", apiSubcategory: "Business" },
      investor: { label: "Investor Events", apiSubcategory: "Business" },
      product_launches: { label: "Product Launches", apiSubcategory: "Business" },
      corporate: { label: "Corporate Events", apiSubcategory: "Business" },
      career_fairs: { label: "Career Fairs", apiSubcategory: "Business" },
      other_business: { label: "Other Business Events", apiSubcategory: "Business" },
    },
  },
  film: {
    label: "Film & Cinema",
    apiSubcategory: "Film",
    subcategories: {
      film_screenings: { label: "Film Screenings", apiSubcategory: "Film" },
      film_festivals: { label: "Film Festivals", apiSubcategory: "Film" },
      premieres: { label: "Movie Premieres", apiSubcategory: "Film" },
      short_films: { label: "Short Film Screenings", apiSubcategory: "Film" },
      documentary: { label: "Documentary Screenings", apiSubcategory: "Film" },
      independent: { label: "Independent Film", apiSubcategory: "Film" },
      classic_cinema: { label: "Classic Film Screenings", apiSubcategory: "Film" },
      outdoor_cinema: { label: "Outdoor Cinema", apiSubcategory: "Film" },
      film_discussions: { label: "Film Discussions", apiSubcategory: "Film" },
      filmmaker_qa: { label: "Filmmaker Q&A", apiSubcategory: "Film" },
    },
  },
  art_culture: {
    label: "Art & Culture",
    apiSubcategory: "Art",
    subcategories: {
      art_exhibitions: { label: "Art Exhibitions", apiSubcategory: "Art" },
      gallery_openings: { label: "Gallery Openings", apiSubcategory: "Art" },
      photography: { label: "Photography Exhibitions", apiSubcategory: "Art" },
      art_fairs: { label: "Art Fairs", apiSubcategory: "Art" },
      sculpture: { label: "Sculpture Exhibitions", apiSubcategory: "Art" },
      digital_art: { label: "Digital Art", apiSubcategory: "Art" },
      cultural_exhibitions: { label: "Cultural Exhibitions", apiSubcategory: "Art" },
      art_workshops: { label: "Art Workshops", apiSubcategory: "Art" },
      museum: { label: "Museum Events", apiSubcategory: "Art" },
      artist_talks: { label: "Artist Talks", apiSubcategory: "Art" },
    },
  },
  other: {
    label: "Other",
    apiSubcategory: "Other",
    subcategories: {
      general: { label: "General Events", apiSubcategory: "Other" },
      community_meetups: { label: "Community Meetups", apiSubcategory: "Community" },
      social: { label: "Social Gatherings", apiSubcategory: "Community" },
      club_meetups: { label: "Club Meetups", apiSubcategory: "Community" },
      cultural: { label: "Cultural Events", apiSubcategory: "Community" },
      charity: { label: "Charity Events", apiSubcategory: "Community" },
      networking_meetups: { label: "Networking Meetups", apiSubcategory: "Community" },
      local: { label: "Local Events", apiSubcategory: "Community" },
      other_events: { label: "Other", apiSubcategory: "Other" },
    },
  },
};

const COMMON_FIELDS: EventFormField[] = [];

const CATEGORY_FIELD_GROUPS: Record<string, EventFormField[]> = {
  music_nightlife: [
    { key: "artist", label: "Artist / Headliner", type: "text", required: true },
    { key: "lineup", label: "Lineup", type: "textarea", multiline: true },
    { key: "musicGenre", label: "Music Genre", type: "text" },
    { key: "performanceSchedule", label: "Performance Schedule", type: "textarea", multiline: true },
  ],
  food_drinks: [
    { key: "cuisineType", label: "Cuisine Type", type: "text" },
    { key: "foodTheme", label: "Food Theme", type: "text" },
    { key: "vegetarianOptions", label: "Vegetarian Options", type: "boolean" },
    { key: "veganOptions", label: "Vegan Options", type: "boolean" },
    { key: "allergiesInfo", label: "Allergies Information", type: "textarea", multiline: true },
    { key: "foodIncludedInTicket", label: "Food Included in Ticket", type: "boolean" },
    { key: "beverageIncluded", label: "Beverage Included", type: "boolean" },
    { key: "reservationRequired", label: "Reservation Required", type: "boolean" },
    { key: "vendorCount", label: "Number of Vendors", type: "number" },
  ],
  sports: [
    { key: "sportType", label: "Sport Type", type: "text", required: true },
    { key: "competitionType", label: "Competition Type", type: "text" },
    {
      key: "format",
      label: "Individual / Team",
      type: "select",
      options: ["Individual", "Team", "Both"],
    },
    { key: "teamCount", label: "Number of Teams", type: "number" },
    { key: "participantCount", label: "Number of Participants", type: "number" },
    { key: "registrationRequired", label: "Registration Required", type: "boolean" },
    { key: "registrationFee", label: "Registration Fee", type: "number" },
    { key: "skillLevel", label: "Skill Level", type: "select", options: ["Beginner", "Intermediate", "Advanced", "All Levels"] },
    { key: "rules", label: "Rules", type: "textarea", multiline: true },
    { key: "equipmentRequired", label: "Equipment Required", type: "textarea", multiline: true },
    { key: "equipmentProvided", label: "Equipment Provided", type: "boolean" },
    { key: "prizePool", label: "Prize Pool", type: "text" },
  ],
  theatre: [
    { key: "showTitle", label: "Show Title", type: "text" },
    { key: "director", label: "Director", type: "text" },
    { key: "performers", label: "Performers", type: "textarea", multiline: true },
    { key: "cast", label: "Cast", type: "textarea", multiline: true },
    { key: "language", label: "Language", type: "text" },
    { key: "subtitles", label: "Subtitles", type: "text" },
    { key: "ageRating", label: "Age Rating", type: "text" },
    { key: "numberOfActs", label: "Number of Acts", type: "number" },
    { key: "intermission", label: "Intermission", type: "boolean" },
    { key: "seatingType", label: "Seating Type", type: "select", options: ["General Admission", "Reserved Seating", "Standing", "Mixed"] },
    { key: "accessibility", label: "Accessibility", type: "textarea", multiline: true },
  ],
  education: [
    { key: "topic", label: "Topic", type: "text", required: true },
    { key: "learningObjectives", label: "Learning Objectives", type: "textarea", multiline: true },
    { key: "instructor", label: "Instructor / Speaker", type: "text", required: true },
    { key: "instructorBio", label: "Instructor Bio", type: "textarea", multiline: true },
    { key: "skillLevel", label: "Skill Level", type: "select", options: ["Beginner", "Intermediate", "Advanced", "All Levels"] },
    { key: "prerequisites", label: "Prerequisites", type: "textarea", multiline: true },
    { key: "courseMaterials", label: "Course Materials", type: "textarea", multiline: true },
    { key: "certificateProvided", label: "Certificate Provided", type: "boolean" },
    { key: "deliveryMode", label: "Online / Offline / Hybrid", type: "select", options: ["Online", "Offline", "Hybrid"] },
    { key: "meetingLink", label: "Meeting Link (if online)", type: "text" },
    { key: "recordingAvailable", label: "Recording Available", type: "boolean" },
    { key: "qaSession", label: "Q&A Session", type: "boolean" },
  ],
  business: [
    { key: "industry", label: "Industry", type: "text" },
    { key: "businessTopic", label: "Business Topic", type: "text" },
    { key: "targetAudience", label: "Target Audience", type: "text" },
    { key: "speakers", label: "Speakers", type: "textarea", multiline: true },
    { key: "keynoteSpeaker", label: "Keynote Speaker", type: "text" },
    { key: "agenda", label: "Agenda", type: "textarea", multiline: true },
    { key: "networkingAvailable", label: "Networking Available", type: "boolean" },
    { key: "deliveryMode", label: "Online / Offline / Hybrid", type: "select", options: ["Online", "Offline", "Hybrid"] },
    { key: "meetingLink", label: "Meeting Link", type: "text" },
  ],
  film: [
    { key: "filmTitle", label: "Film Title", type: "text" },
    { key: "director", label: "Director", type: "text" },
    { key: "genre", label: "Genre", type: "text" },
    { key: "runtime", label: "Runtime (minutes)", type: "number" },
    { key: "releaseYear", label: "Release Year", type: "number" },
    { key: "language", label: "Language", type: "text" },
    { key: "subtitles", label: "Subtitles", type: "text" },
    { key: "ageRating", label: "Age Rating", type: "text" },
    { key: "filmmakerQa", label: "Filmmaker Q&A", type: "boolean" },
    { key: "festivalName", label: "Festival Name", type: "text" },
    { key: "festivalTheme", label: "Festival Theme", type: "text" },
    { key: "filmCount", label: "Number of Films", type: "number" },
  ],
  art_culture: [
    { key: "exhibitionName", label: "Exhibition Name", type: "text" },
    { key: "artist", label: "Artist", type: "text" },
    { key: "artistsList", label: "Artists List", type: "textarea", multiline: true },
    { key: "artType", label: "Art Type", type: "text" },
    { key: "theme", label: "Theme", type: "text" },
    { key: "curator", label: "Curator", type: "text" },
    { key: "gallery", label: "Gallery", type: "text" },
    { key: "guidedTour", label: "Guided Tour", type: "boolean" },
    { key: "photographyAllowed", label: "Photography Allowed", type: "boolean" },
    { key: "artworkCount", label: "Artwork Count", type: "number" },
  ],
  other: [
    { key: "eventTypeLabel", label: "Event Type", type: "text" },
    { key: "contactInfo", label: "Contact", type: "text" },
  ],
};

/** Extra fields for specific event types within a main category. */
const EVENT_TYPE_OVERRIDES: Record<string, Record<string, EventFormField[]>> = {
  film: {
    film_screenings: [
      { key: "filmTitle", label: "Film Title", type: "text", required: true },
      { key: "director", label: "Director", type: "text" },
      { key: "runtime", label: "Runtime (minutes)", type: "number" },
      { key: "screenAuditorium", label: "Screen / Auditorium", type: "text" },
    ],
    film_festivals: [
      { key: "festivalName", label: "Festival Name", type: "text", required: true },
      { key: "festivalTheme", label: "Festival Theme", type: "text" },
      { key: "filmCount", label: "Number of Films", type: "number" },
      { key: "openingFilm", label: "Opening Film", type: "text" },
      { key: "closingFilm", label: "Closing Film", type: "text" },
    ],
  },
  sports: {
    tournaments: [
      { key: "matchSchedule", label: "Match Schedule", type: "textarea", multiline: true, required: true },
      { key: "rounds", label: "Tournament Rounds", type: "textarea", multiline: true },
    ],
  },
  theatre: {
    standup_performance: [
      { key: "comedian", label: "Comedian", type: "text", required: true },
      {
        key: "comedyFormat",
        label: "Comedy Format",
        type: "select",
        options: ["Stand-up", "Improv", "Open Mic", "Sketch", "Roast", "Other"],
      },
    ],
  },
};

export function resolveEventCategoryLabel(eventCategory?: string | null): string | null {
  if (!eventCategory) return null;
  return EVENT_MAIN_CATEGORIES[eventCategory]?.label ?? null;
}

export function resolveEventTypeLabel(
  eventCategory?: string | null,
  eventType?: string | null,
): string | null {
  if (!eventCategory || !eventType) return null;
  return EVENT_MAIN_CATEGORIES[eventCategory]?.subcategories[eventType]?.label ?? null;
}

export function resolveApiSubcategory(
  eventCategory?: string | null,
  eventType?: string | null,
  legacySubcategory?: string | null,
): string | null {
  if (eventCategory && eventType) {
    return EVENT_MAIN_CATEGORIES[eventCategory]?.subcategories[eventType]?.apiSubcategory ?? null;
  }
  return legacySubcategory?.trim() || null;
}

export function getDynamicFieldsForEvent(
  eventCategory?: string | null,
  eventType?: string | null,
): EventFormField[] {
  if (!eventCategory) return COMMON_FIELDS;

  const base = CATEGORY_FIELD_GROUPS[eventCategory] ?? [];
  const overrides = eventType ? EVENT_TYPE_OVERRIDES[eventCategory]?.[eventType] : undefined;

  if (overrides?.length) {
    const overrideKeys = new Set(overrides.map((f) => f.key));
    return [...base.filter((f) => !overrideKeys.has(f.key)), ...overrides];
  }

  if (eventType === "tournaments" && eventCategory === "sports") {
    return base;
  }

  // Hide film festival-only fields on screenings and vice versa
  if (eventCategory === "film") {
    if (eventType === "film_screenings") {
      return base.filter((f) => !["festivalName", "festivalTheme", "filmCount"].includes(f.key));
    }
    if (eventType === "film_festivals") {
      return base.filter((f) => !["filmTitle"].includes(f.key));
    }
  }

  return base;
}

export function buildEventTypeDisplay(
  listing: {
    eventCategory?: string | null;
    eventType?: string | null;
    subcategory?: string | null;
    eventFormat?: string | null;
  },
): string {
  const main = resolveEventCategoryLabel(listing.eventCategory);
  const type = resolveEventTypeLabel(listing.eventCategory, listing.eventType);
  if (main && type) return `${main} · ${type}`;
  if (listing.subcategory === "Comedy" && listing.eventFormat) {
    return `Comedy / ${listing.eventFormat}`;
  }
  return listing.subcategory || "Event";
}

export const EVENT_MAIN_CATEGORY_LIST = Object.entries(EVENT_MAIN_CATEGORIES).map(
  ([slug, def]) => ({ slug, label: def.label }),
);

export function getSubcategoriesForMain(mainSlug: string) {
  const main = EVENT_MAIN_CATEGORIES[mainSlug];
  if (!main) return [];
  return Object.entries(main.subcategories).map(([slug, def]) => ({
    slug,
    label: def.label,
    apiSubcategory: def.apiSubcategory,
  }));
}

/**
 * Event category hierarchy + validation (server source of truth).
 * Frontend mirrors in app/features/events/data/events-form-schema.ts
 */

const EVENT_MAIN_CATEGORIES = {
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
      other_sports: { label: "Other Sports", apiSubcategory: "Sports" },
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

/** Legacy flat subcategories still accepted when eventCategory/eventType omitted. */
const LEGACY_EVENT_SUBCATEGORIES = [
  "Music",
  "Food & Drink",
  "Business",
  "Health & Wellness",
  "Film",
  "Comedy",
  "Art",
  "Sports",
  "Theater",
  "Education",
  "Community",
  "Other",
];

const PUBLISHED_STATUSES = new Set(["active", "published"]);
const DRAFT_STATUSES = new Set(["draft"]);
const SYSTEM_STATUSES = new Set(["sold", "expired", "removed", "sold_out", "cancelled", "postponed", "completed", "archived", "pending_review"]);

function resolveEventType(mainCategory, eventType) {
  if (!mainCategory || !eventType) return null;
  const main = EVENT_MAIN_CATEGORIES[mainCategory];
  if (!main) return null;
  return main.subcategories[eventType] ?? null;
}

function resolveCategoryPair({ eventCategory, eventType, subcategory }) {
  const resolved = resolveEventType(eventCategory, eventType);
  if (resolved) {
    return {
      eventCategory,
      eventType,
      subcategory: resolved.apiSubcategory,
      eventTypeLabel: resolved.label,
    };
  }
  if (subcategory && LEGACY_EVENT_SUBCATEGORIES.includes(subcategory)) {
    return { eventCategory: eventCategory || null, eventType: eventType || null, subcategory };
  }
  return null;
}

function validateCategoryData(categoryData) {
  if (categoryData == null) return { ok: true, value: {} };
  if (typeof categoryData !== "object" || Array.isArray(categoryData)) {
    return { ok: false, message: "categoryData must be a plain object" };
  }
  const keys = Object.keys(categoryData);
  if (keys.length > 80) {
    return { ok: false, message: "categoryData has too many fields" };
  }
  const sanitized = {};
  for (const [key, val] of Object.entries(categoryData)) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(key)) {
      return { ok: false, message: `Invalid categoryData field key: ${key}` };
    }
    if (val == null) continue;
    if (typeof val === "string" && val.length > 5000) {
      return { ok: false, message: `Field ${key} exceeds maximum length` };
    }
    if (typeof val === "number" && !Number.isFinite(val)) continue;
    if (typeof val === "boolean" || typeof val === "number" || typeof val === "string") {
      sanitized[key] = val;
    } else if (Array.isArray(val)) {
      sanitized[key] = val
        .slice(0, 50)
        .map((item) => (typeof item === "string" ? item.slice(0, 500) : null))
        .filter(Boolean);
    } else if (typeof val === "object") {
      sanitized[key] = val;
    }
  }
  return { ok: true, value: sanitized };
}

function isPublishedStatus(status) {
  return PUBLISHED_STATUSES.has(String(status || "").toLowerCase());
}

function isDraftStatus(status) {
  return DRAFT_STATUSES.has(String(status || "").toLowerCase());
}

module.exports = {
  EVENT_MAIN_CATEGORIES,
  LEGACY_EVENT_SUBCATEGORIES,
  PUBLISHED_STATUSES,
  DRAFT_STATUSES,
  resolveEventType,
  resolveCategoryPair,
  validateCategoryData,
  isPublishedStatus,
  isDraftStatus,
};

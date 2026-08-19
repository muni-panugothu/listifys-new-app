/**
 * Location-aware Similar Events query (reuses geoQuery + event status helpers).
 */
const Event = require("../models/event.model");
const {
  buildLocationRegex,
  applyStrictCountryFilter,
  applyStrictGeoFilter,
} = require("./geoQuery");
const { publishedStatusFilter } = require("./eventStatus");
const {
  buildUpcomingFilter,
  isEventExpired,
} = require("./eventDates");

const LIST_PROJECTION = {
  currency: 1,
  slug: 1,
  title: 1,
  description: 1,
  price: 1,
  location: 1,
  condition: 1,
  category: 1,
  subcategory: 1,
  eventCategory: 1,
  eventType: 1,
  images: 1,
  videos: 1,
  sellerName: 1,
  seller: 1,
  views: 1,
  features: 1,
  status: 1,
  createdAt: 1,
  eventDate: 1,
  eventTime: 1,
  startDate: 1,
  endDate: 1,
  startTime: 1,
  endTime: 1,
  organizer: 1,
  venue: 1,
  ticketsAvailable: 1,
  coordinates: 1,
  countryCode: 1,
  featured: 1,
};

/** Radii (km) aligned with app location defaults — tiered expansion. */
const RADIUS_NEAR_KM = 25;
const RADIUS_REGION_KM = 50;
const RADIUS_COUNTRY_KM = 100;

function extractCityToken(locationStr) {
  const parts = String(locationStr || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  if (parts.length >= 3) return parts[1];
  return parts[0];
}

function resolveEventAnchor(current, query = {}) {
  const coords = current?.coordinates?.coordinates;
  const eventLng = Array.isArray(coords) ? coords[0] : null;
  const eventLat = Array.isArray(coords) ? coords[1] : null;

  const lat = eventLat ?? (query.lat != null ? Number(query.lat) : null);
  const lng = eventLng ?? (query.lng != null ? Number(query.lng) : null);
  const countryCode =
    (current?.countryCode && String(current.countryCode).trim().toUpperCase()) ||
    (query.countryCode && String(query.countryCode).trim().toUpperCase()) ||
    null;
  const cityToken = extractCityToken(current?.location);
  const locationQuery = query.location || current?.location || null;

  return { lat, lng, countryCode, cityToken, locationQuery };
}

function applyCityLocationFilter(filter, cityToken) {
  if (!cityToken) return;
  const regex = buildLocationRegex(cityToken);
  if (regex) filter.location = regex;
}

function buildBaseFilter(current, excludeIds = []) {
  return {
    status: publishedStatusFilter(),
    _id: { $ne: current._id, $nin: excludeIds },
    ...buildUpcomingFilter(),
  };
}

function haversineKm(lat1, lng1, lat2, lng2) {
  if ([lat1, lng1, lat2, lng2].some((v) => v == null || Number.isNaN(Number(v)))) {
    return null;
  }
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function scoreCandidate(candidate, anchor, current) {
  let score = 0;

  const cCoords = candidate.coordinates?.coordinates;
  const cLat = Array.isArray(cCoords) ? cCoords[1] : null;
  const cLng = Array.isArray(cCoords) ? cCoords[0] : null;

  if (anchor.lat != null && anchor.lng != null && cLat != null && cLng != null) {
    const km = haversineKm(anchor.lat, anchor.lng, cLat, cLng);
    if (km != null) {
      if (km <= RADIUS_NEAR_KM) score += 120;
      else if (km <= RADIUS_REGION_KM) score += 90;
      else if (km <= RADIUS_COUNTRY_KM) score += 60;
      else score += Math.max(0, 40 - Math.min(km, 500) / 10);
    }
  }

  if (anchor.cityToken && candidate.location) {
    const city = anchor.cityToken.toLowerCase();
    if (String(candidate.location).toLowerCase().includes(city)) {
      score += 80;
    }
  }

  if (anchor.countryCode && candidate.countryCode) {
    if (String(candidate.countryCode).toUpperCase() === anchor.countryCode) {
      score += 50;
    } else {
      score -= 40;
    }
  }

  if (current.eventType && candidate.eventType === current.eventType) score += 45;
  if (current.subcategory && candidate.subcategory === current.subcategory) score += 40;
  if (current.eventCategory && candidate.eventCategory === current.eventCategory) score += 25;

  if (candidate.featured) score += 8;
  if (candidate.views) score += Math.min(Number(candidate.views) || 0, 20);

  const now = Date.now();
  const start = candidate.startDate ? new Date(candidate.startDate).getTime() : null;
  if (start && start >= now) {
    const days = (start - now) / (86400000);
    score += Math.max(0, 20 - days);
  }

  return score;
}

async function runTierQuery({ filter, limit, populate = true }) {
  let q = Event.find(filter, LIST_PROJECTION)
    .sort({ featured: -1, startDate: 1, createdAt: -1 })
    .limit(limit);
  if (populate) q = q.populate("seller", "name profileImage");
  return q.lean();
}

/**
 * Tiered similar-events fetch. Never falls back to unfiltered global results.
 */
async function findSimilarEvents(current, options = {}) {
  const limit = Math.min(Math.max(Number(options.limit) || 10, 1), 20);
  const anchor = resolveEventAnchor(current, options);
  const collected = new Map();

  const addResults = (docs, tierBoost = 0) => {
    for (const doc of docs) {
      if (isEventExpired(doc)) continue;
      const id = String(doc._id);
      if (collected.has(id)) continue;
      collected.set(id, { doc, tierBoost });
      if (collected.size >= limit * 3) break;
    }
  };

  const excludeIds = () => [...collected.keys()];

  const typeFilter = {};
  if (current.eventType) {
    typeFilter.eventType = current.eventType;
  } else if (current.subcategory) {
    typeFilter.subcategory = current.subcategory;
  }

  // Tier 1 — nearby + same type (25 km)
  if (anchor.lat != null && anchor.lng != null) {
    const f1 = { ...buildBaseFilter(current, excludeIds()), ...typeFilter };
    applyStrictCountryFilter(f1, anchor.countryCode);
    applyStrictGeoFilter(f1, anchor.lat, anchor.lng, RADIUS_NEAR_KM);
    addResults(await runTierQuery({ filter: f1, limit: limit * 2 }), 100);
  }

  // Tier 2 — same city + same type
  if (collected.size < limit && anchor.cityToken) {
    const f2 = { ...buildBaseFilter(current, excludeIds()), ...typeFilter };
    applyStrictCountryFilter(f2, anchor.countryCode);
    applyCityLocationFilter(f2, anchor.cityToken);
    addResults(await runTierQuery({ filter: f2, limit: limit * 2 }), 80);
  }

  // Tier 3 — regional radius + same type (50 km)
  if (collected.size < limit && anchor.lat != null && anchor.lng != null) {
    const f3 = { ...buildBaseFilter(current, excludeIds()), ...typeFilter };
    applyStrictCountryFilter(f3, anchor.countryCode);
    applyStrictGeoFilter(f3, anchor.lat, anchor.lng, RADIUS_REGION_KM);
    addResults(await runTierQuery({ filter: f3, limit: limit * 2 }), 60);
  }

  // Tier 4 — same country + same type
  if (collected.size < limit && anchor.countryCode) {
    const f4 = { ...buildBaseFilter(current, excludeIds()), ...typeFilter };
    applyStrictCountryFilter(f4, anchor.countryCode);
    addResults(await runTierQuery({ filter: f4, limit: limit * 2 }), 40);
  }

  // Tier 5 — same country + same main category
  if (collected.size < limit && anchor.countryCode && current.eventCategory) {
    const f5 = {
      ...buildBaseFilter(current, excludeIds()),
      eventCategory: current.eventCategory,
    };
    applyStrictCountryFilter(f5, anchor.countryCode);
    addResults(await runTierQuery({ filter: f5, limit: limit * 2 }), 25);
  }

  // Tier 6 — same country, broader (still country-scoped)
  if (collected.size < limit && anchor.countryCode) {
    const f6 = buildBaseFilter(current, excludeIds());
    applyStrictCountryFilter(f6, anchor.countryCode);
    if (anchor.lat != null && anchor.lng != null) {
      applyStrictGeoFilter(f6, anchor.lat, anchor.lng, RADIUS_COUNTRY_KM);
    }
    addResults(await runTierQuery({ filter: f6, limit: limit * 2 }), 10);
  }

  // Tier 7 — international same type (only when local pool insufficient)
  if (collected.size < limit && Object.keys(typeFilter).length > 0) {
    const f7 = { ...buildBaseFilter(current, excludeIds()), ...typeFilter };
    if (anchor.countryCode) {
      f7.countryCode = { $ne: anchor.countryCode };
    }
    addResults(await runTierQuery({ filter: f7, limit: limit }), 0);
  }

  const ranked = [...collected.values()]
    .map(({ doc, tierBoost }) => ({
      doc,
      score: tierBoost + scoreCandidate(doc, anchor, current),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.doc);

  return ranked;
}

module.exports = {
  findSimilarEvents,
  resolveEventAnchor,
  extractCityToken,
  RADIUS_NEAR_KM,
  RADIUS_REGION_KM,
  RADIUS_COUNTRY_KM,
};

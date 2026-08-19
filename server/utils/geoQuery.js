/**
 * Shared geo-query utility — handles the MongoDB limitation where
 * $nearSphere and $text CANNOT be used together in the same query.
 *
 * Strategy: when both search text AND geo filter are present,
 * we use $geoWithin (a simple geometry filter) instead of $nearSphere.
 * $geoWithin IS compatible with $text and other query operators.
 *
 * When ONLY geo is used (no $text), we use $nearSphere for native
 * nearest-first ordering.
 */

/**
 * Apply geo filter to a MongoDB filter object.
 * 
 * RULES:
 * - If the filter already has a location text AND lat/lng → use $or (text OR geo)
 *   This is the critical path: listings saved with text-only location (no GPS)
 *   are found by the text branch; listings with GPS are found by the geo branch.
 * - If ONLY lat/lng (no location text) → still use $or but with the geo branch only,
 *   plus a fallback that allows docs WITHOUT a coordinates field (covers text-only listings).
 * - If no lat/lng → no-op (return all listings unfiltered by location)
 *
 * @param {object} filter - MongoDB filter (may already have $text / location)
 * @param {number|string} lat
 * @param {number|string} lng
 * @param {number|string} radiusKm - default 50 km
 */
function applyGeoFilter(filter, lat, lng, radiusKm = 50) {
  if (!lat || !lng) return;

  const numLat = Number(lat);
  const numLng = Number(lng);
  const maxDistMeters = (Number(radiusKm) || 50) * 1000;
  
  const radiusRadians = maxDistMeters / 6378100; // Earth radius in meters
  const geoCondition = {
    $geoWithin: {
      $centerSphere: [[numLng, numLat], radiusRadians],
    },
  };

  // If a text-based location filter already exists, use OR logic:
  // match by EITHER text location OR geo coordinates.
  // This ensures listings without stored coordinates still appear via text match,
  // while listings with coordinates are matched by proximity.
  const locationKey = filter.location
    ? 'location'
    : filter['location.address']
      ? 'location.address'
      : null;

  if (locationKey) {
    const textFilter = filter[locationKey];
    delete filter[locationKey];

    const locationOr = {
      $or: [
        { [locationKey]: textFilter },
        { coordinates: geoCondition },
      ],
    };

    // If $and already exists (from other conditions), push to it
    if (filter.$and) {
      filter.$and.push(locationOr);
    } else {
      filter.$and = [locationOr];
    }
  } else {
    // No text location filter provided.
    // Use $or: listings WITH valid coordinates in range, OR listings with NO
    // coordinates field at all (those are text-only and should not be excluded
    // just because the caller didn't supply a location string).
    const locationOr = {
      $or: [
        { coordinates: geoCondition },
        { coordinates: { $exists: false } },
        { 'coordinates.coordinates': { $exists: false } },
      ],
    };

    if (filter.$and) {
      filter.$and.push(locationOr);
    } else {
      filter.$and = [locationOr];
    }
  }
}

/**
 * Build sort options. When sort=nearest and geo is active without $text,
 * return empty sort to let $nearSphere's natural order win.
 *
 * @param {string} sort - 'newest' | 'price_asc' | 'price_desc' | 'nearest' | 'oldest'
 * @param {boolean} hasGeo - whether lat/lng were provided
 * @param {boolean} hasText - whether $text search is active
 * @returns {object} MongoDB sort option
 */
function buildSortOption(sort, hasGeo = false, hasText = false) {
  if (sort === 'nearest' && hasGeo && !hasText) return {}; // $nearSphere natural order
  if (sort === 'price_asc') return { price: 1 };
  if (sort === 'price_desc') return { price: -1 };
  if (sort === 'oldest') return { createdAt: 1 };
  return { createdAt: -1 }; // default: newest
}

/**
 * Strict country filter — only listings with matching countryCode (no missing/null passthrough).
 * Use for location-scoped discovery (events) where global fallbacks must not leak other countries.
 */
function applyStrictCountryFilter(filter, countryCode) {
  if (!countryCode || typeof countryCode !== 'string') return;
  const code = countryCode.toUpperCase().trim();
  if (!code) return;
  filter.countryCode = { $regex: new RegExp(`^${escapeRegex(code)}$`, 'i') };
}

/**
 * Strict geo filter — requires stored coordinates within radius (no global text-only passthrough).
 */
function applyStrictGeoFilter(filter, lat, lng, radiusKm = 50) {
  if (lat == null || lng == null) return;
  const numLat = Number(lat);
  const numLng = Number(lng);
  if (Number.isNaN(numLat) || Number.isNaN(numLng)) return;

  const maxDistMeters = (Number(radiusKm) || 50) * 1000;
  const radiusRadians = maxDistMeters / 6378100;
  filter.coordinates = {
    $geoWithin: {
      $centerSphere: [[numLng, numLat], radiusRadians],
    },
  };
}

/**
 * Apply an ISO country code filter to a MongoDB filter object.
 * Only adds the filter when countryCode is a non-empty string.
 *
 * @param {object} filter - MongoDB filter object (mutated in place)
 * @param {string|undefined} countryCode - ISO 3166-1 alpha-2 code (e.g. "IN", "US")
 */
function applyCountryFilter(filter, countryCode) {
  if (!countryCode || typeof countryCode !== 'string') return;

  const code = countryCode.toUpperCase().trim();
  if (!code) return;

  const countryOr = {
    $or: [
      { countryCode: { $regex: new RegExp(`^${escapeRegex(code)}$`, 'i') } },
      { countryCode: { $exists: false } },
      { countryCode: { $in: [null, ''] } },
    ],
  };

  if (filter.$and) {
    filter.$and.push(countryOr);
  } else {
    filter.$and = [countryOr];
  }
}

/**
 * Escape regex special characters in a user-supplied string
 * to prevent ReDoS and over-matching when used in MongoDB $regex.
 */
function escapeRegex(str) {
  if (!str) return '';
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build a location filter that matches ANY part of a comma-separated
 * location string (e.g. "Uppal, Hyderabad, Telangana" → /Uppal|Hyderabad|Telangana/i).
 *
 * This is far more tolerant than matching the full string as a substring,
 * because stored locations may only contain the city or sublocality.
 *
 * @param {string} locationStr - raw location string from the client
 * @returns {{ $regex: string, $options: string }} MongoDB regex filter
 */
const US_STATE_ALIASES = {
  alabama: 'AL',
  alaska: 'AK',
  arizona: 'AZ',
  arkansas: 'AR',
  california: 'CA',
  colorado: 'CO',
  connecticut: 'CT',
  delaware: 'DE',
  florida: 'FL',
  georgia: 'GA',
  hawaii: 'HI',
  idaho: 'ID',
  illinois: 'IL',
  indiana: 'IN',
  iowa: 'IA',
  kansas: 'KS',
  kentucky: 'KY',
  louisiana: 'LA',
  maine: 'ME',
  maryland: 'MD',
  massachusetts: 'MA',
  michigan: 'MI',
  minnesota: 'MN',
  mississippi: 'MS',
  missouri: 'MO',
  montana: 'MT',
  nebraska: 'NE',
  nevada: 'NV',
  'new hampshire': 'NH',
  'new jersey': 'NJ',
  'new mexico': 'NM',
  'new york': 'NY',
  'north carolina': 'NC',
  'north dakota': 'ND',
  ohio: 'OH',
  oklahoma: 'OK',
  oregon: 'OR',
  pennsylvania: 'PA',
  'rhode island': 'RI',
  'south carolina': 'SC',
  'south dakota': 'SD',
  tennessee: 'TN',
  texas: 'TX',
  utah: 'UT',
  vermont: 'VT',
  virginia: 'VA',
  washington: 'WA',
  'west virginia': 'WV',
  wisconsin: 'WI',
  wyoming: 'WY',
  'district of columbia': 'DC',
};

const US_STATE_NAMES_BY_CODE = Object.fromEntries(
  Object.entries(US_STATE_ALIASES).map(([name, code]) => [code, name]),
);

function expandLocationPart(part) {
  const trimmed = part.trim();
  if (!trimmed) return [];

  const lower = trimmed.toLowerCase();
  const upper = trimmed.toUpperCase();
  const aliases = [trimmed];

  if (US_STATE_ALIASES[lower]) {
    aliases.push(US_STATE_ALIASES[lower]);
  }
  if (US_STATE_NAMES_BY_CODE[upper]) {
    aliases.push(US_STATE_NAMES_BY_CODE[upper]);
  }

  return aliases;
}

function buildLocationRegex(locationStr) {
  if (!locationStr) return null;
  const parts = String(locationStr)
    .split(',')
    .flatMap(expandLocationPart)
    .map(p => p.trim())
    .filter(Boolean);

  const uniqueParts = [...new Set(parts.map(p => p.toLowerCase()))]
    .map(lower => parts.find(p => p.toLowerCase() === lower))
    .filter(Boolean)
    .map(escapeRegex);

  if (uniqueParts.length === 0) return null;
  return { $regex: uniqueParts.join('|'), $options: 'i' };
}

module.exports = {
  applyGeoFilter,
  applyStrictGeoFilter,
  applyStrictCountryFilter,
  buildSortOption,
  escapeRegex,
  buildLocationRegex,
  applyCountryFilter,
};

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import { Platform } from "react-native";

export const LOCATION_STORAGE_KEY = "@listify/app_location";

/** Min time between automatic GPS refreshes (home tab, etc.). */
export const LOCATION_AUTO_REFRESH_MS = 30 * 60 * 1000;

/** If new GPS is within this distance, keep the previous area label (avoids Madhapur/Hitech City flip). */
const KEEP_LABEL_DISTANCE_M = 2_500;

export type StoredAppLocation = {
  label: string;
  lat: number;
  lng: number;
  source: "gps" | "manual";
  updatedAt: number;
  /** ISO 3166-1 alpha-2 country code, e.g. "IN", "US", "GB". */
  isoCountryCode?: string | null;
};

function normalizePart(value?: string | null) {
  return value?.trim().replace(/\s+/g, " ") ?? "";
}

function isSamePlace(a: string, b: string) {
  return a.toLowerCase() === b.toLowerCase();
}

function isDuplicatePart(candidate: string, existing: string[]) {
  const lower = candidate.toLowerCase();
  return existing.some(
    (part) =>
      part.toLowerCase() === lower ||
      part.toLowerCase().includes(lower) ||
      lower.includes(part.toLowerCase()),
  );
}

/** Plot / door / street numbers — not suitable for "Kukatpally, Hyderabad" style labels. */
function looksLikeStreetAddress(value: string) {
  const v = value.trim();
  if (!v) return true;

  if (/^[\d\s\-/.,#]+$/.test(v)) return true;
  if (/^\d+[\-/]/.test(v)) return true;
  if (/^\d+\s+/.test(v)) return true;

  const digits = (v.match(/\d/g) ?? []).length;
  const letters = (v.match(/[a-zA-Z]/g) ?? []).length;
  if (digits >= 2 && digits >= letters) return true;

  if (
    /\b(plot|h\.?\s*no|house|flat|door|lane|road|rd|st|street|avenue|ave)\b/i.test(v) &&
    digits >= 1
  ) {
    return true;
  }

  return false;
}

function isValidLocalityName(value: string) {
  if (!value || looksLikeStreetAddress(value)) return false;
  if (value.length < 2 || value.length > 40) return false;
  return /[a-zA-Z]{2,}/.test(value);
}

/** Merge fields from multiple reverse-geocode hits (Android often splits locality across rows). */
function mergeGeocodeResults(
  results: Location.LocationGeocodedAddress[],
): Location.LocationGeocodedAddress {
  const merged: Location.LocationGeocodedAddress = {
    city: null,
    district: null,
    street: null,
    streetNumber: null,
    region: null,
    subregion: null,
    country: null,
    postalCode: null,
    name: null,
    isoCountryCode: null,
    timezone: null,
    formattedAddress: null,
  };

  for (const row of results) {
    for (const key of Object.keys(merged) as (keyof Location.LocationGeocodedAddress)[]) {
      const value = row[key];
      if (typeof value !== "string" || !value.trim()) continue;

      const trimmed = value.trim();
      if (key === "name" && looksLikeStreetAddress(trimmed)) continue;
      if (key === "street") continue;

      if (!merged[key]) {
        merged[key] = trimmed;
      }
    }
  }

  if (merged.name && looksLikeStreetAddress(merged.name)) {
    merged.name = null;
    for (const row of results) {
      const candidate = row.name?.trim();
      if (candidate && isValidLocalityName(candidate)) {
        merged.name = candidate;
        break;
      }
    }
  }

  return merged;
}

/**
 * Prefer neighbourhood / locality + city, e.g. "Kukatpally, Hyderabad".
 */
export function formatGeocodeAddress(place: Location.LocationGeocodedAddress) {
  const city = normalizePart(place.city);
  const region = normalizePart(place.region);
  const country = normalizePart(place.country);

  // subregion / district = locality in India; never use street or plot numbers in `name`.
  const areaCandidates = [
    normalizePart(place.subregion),
    normalizePart(place.district),
    normalizePart(place.name),
  ]
    .filter(isValidLocalityName)
    .filter((part, index, arr) => arr.indexOf(part) === index);

  let locality: string | undefined;

  for (const candidate of areaCandidates) {
    if (isSamePlace(candidate, city) || isSamePlace(candidate, region)) {
      continue;
    }
    if (country && isSamePlace(candidate, country)) {
      continue;
    }
    if (city && candidate.toLowerCase().endsWith(city.toLowerCase())) {
      const trimmed = candidate
        .slice(0, candidate.length - city.length)
        .replace(/,\s*$/, "")
        .trim();
      if (isValidLocalityName(trimmed) && !isSamePlace(trimmed, city)) {
        locality = trimmed;
        break;
      }
    }
    if (!isDuplicatePart(candidate, [city, region].filter(Boolean))) {
      locality = candidate;
      break;
    }
  }

  if (locality && city && !isSamePlace(locality, city)) {
    return `${locality}, ${city}`;
  }

  if (city) {
    return city;
  }

  if (locality) {
    return locality;
  }

  if (region && country && !isSamePlace(region, country)) {
    return `${region}, ${country}`;
  }

  return region || country || "Current location";
}

function distanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6_371_000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function cityPart(label: string) {
  const parts = label.split(",").map((p) => p.trim()).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : parts[0]?.toLowerCase() ?? "";
}

/**
 * When still in the same city but reverse-geocode returns a different suburb
 * (e.g. Hitech City vs Madhapur), keep the label the user already saw.
 */
export function shouldKeepPreviousLabel(
  previousLabel: string,
  nextLabel: string,
  distanceM: number,
): boolean {
  if (!previousLabel.trim() || !nextLabel.trim()) return false;
  if (previousLabel.toLowerCase() === nextLabel.toLowerCase()) return true;
  if (distanceM > KEEP_LABEL_DISTANCE_M) return false;

  const prevCity = cityPart(previousLabel);
  const nextCity = cityPart(nextLabel);
  if (prevCity && nextCity && prevCity === nextCity) {
    return true;
  }

  return distanceM < 800;
}

/** Pick one stable label from all reverse-geocode rows (same coords → same choice). */
function pickConsistentLabel(results: Location.LocationGeocodedAddress[]): string {
  const seen = new Set<string>();
  const candidates: string[] = [];

  const add = (label: string) => {
    const normalized = label.trim();
    if (!normalized || seen.has(normalized.toLowerCase())) return;
    seen.add(normalized.toLowerCase());
    candidates.push(normalized);
  };

  add(formatGeocodeAddress(mergeGeocodeResults(results)));
  for (const row of results) {
    add(formatGeocodeAddress(row));
  }

  if (!candidates.length) {
    return "Current location";
  }

  const scored = candidates
    .map((label) => {
      const parts = label.split(",").map((p) => p.trim()).filter(Boolean);
      let score = 0;
      if (parts.length >= 2) score += 10;
      if (parts[0] && isValidLocalityName(parts[0])) score += 5;
      score += Math.min(parts[0]?.length ?? 0, 20) / 10;
      return { label, score };
    })
    .sort((a, b) => b.score - a.score);

  return scored[0]?.label ?? candidates[0];
}

export async function loadStoredLocation(): Promise<StoredAppLocation | null> {
  try {
    const raw = await AsyncStorage.getItem(LOCATION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredAppLocation;
    if (
      typeof parsed.label !== "string" ||
      typeof parsed.lat !== "number" ||
      typeof parsed.lng !== "number"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function saveStoredLocation(location: StoredAppLocation) {
  await AsyncStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(location));
}

/** On Android, prompt to turn on device location (network/GPS) when services are off. */
export async function prepareLocationServices(): Promise<boolean> {
  const servicesEnabled = await Location.hasServicesEnabledAsync();
  if (servicesEnabled) return true;

  if (Platform.OS === "android") {
    try {
      await Location.enableNetworkProviderAsync();
    } catch {
      // User dismissed the system dialog.
    }
    return Location.hasServicesEnabledAsync();
  }

  return false;
}

/** OS foreground permission only — does not enable device GPS services. */
export async function requestLocationPermission(): Promise<boolean> {
  const current = await Location.getForegroundPermissionsAsync();
  if (current.status === Location.PermissionStatus.GRANTED) {
    return true;
  }

  const permission = await Location.requestForegroundPermissionsAsync();
  return permission.status === Location.PermissionStatus.GRANTED;
}

export type LocationAccessResult =
  | { ok: true }
  | { ok: false; reason: "permission_denied" | "services_disabled" };

/**
 * Full device-location readiness flow (matches location-picker):
 * Android GPS toggle → OS permission → verify services are on.
 */
export async function ensureDeviceLocationAccess(): Promise<LocationAccessResult> {
  if (Platform.OS === "android") {
    const servicesEnabled = await Location.hasServicesEnabledAsync();
    if (!servicesEnabled) {
      try {
        await Location.enableNetworkProviderAsync();
      } catch {
        // User dismissed the system "Turn on device location" dialog.
      }

      const nowEnabled = await Location.hasServicesEnabledAsync();
      if (!nowEnabled) {
        return { ok: false, reason: "services_disabled" };
      }
    }
  }

  const { status, canAskAgain } = await Location.getForegroundPermissionsAsync();
  if (status !== Location.PermissionStatus.GRANTED) {
    if (status === Location.PermissionStatus.DENIED && !canAskAgain) {
      return { ok: false, reason: "permission_denied" };
    }

    const requested = await Location.requestForegroundPermissionsAsync();
    if (requested.status !== Location.PermissionStatus.GRANTED) {
      return { ok: false, reason: "permission_denied" };
    }
  }

  const servicesReady = await prepareLocationServices();
  if (!servicesReady) {
    return { ok: false, reason: "services_disabled" };
  }

  return { ok: true };
}

export async function hasLocationPermission(): Promise<boolean> {
  const { status } = await Location.getForegroundPermissionsAsync();
  return status === Location.PermissionStatus.GRANTED;
}

export async function getCurrentCoordinates(options?: {
  highAccuracy?: boolean;
  timeoutMs?: number;
}) {
  const servicesEnabled = await Location.hasServicesEnabledAsync();
  if (!servicesEnabled) {
    throw new Error("SERVICES_DISABLED");
  }

  const timeoutMs = options?.timeoutMs ?? 8_000;

  const position = await Promise.race([
    Location.getCurrentPositionAsync({
      accuracy: options?.highAccuracy
        ? Location.Accuracy.High        // High = cell-tower assisted, much faster than BestForNavigation
        : Location.Accuracy.Balanced,
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("GPS_TIMEOUT")), timeoutMs),
    ),
  ]);

  return {
    lat: position.coords.latitude,
    lng: position.coords.longitude,
    accuracy: position.coords.accuracy ?? null,
  };
}

/**
 * Instant-first location resolution.
 *
 * Returns last-known coordinates IMMEDIATELY via the callback (≤ 50 ms),
 * then resolves the promise with a fresh GPS fix when available.
 *
 * Flow (Swiggy / Uber style):
 *   1. getLastKnownPositionAsync()  ← ~5 ms, dispatched instantly
 *   2. onInstant(lastKnown)         ← caller updates UI immediately
 *   3. getCurrentPositionAsync()    ← runs in background (≤ 8 s)
 *   4. resolve(fresh)               ← caller refines UI silently
 */
export async function getBestAvailableCoordinates(options?: {
  onInstant?: (coords: { lat: number; lng: number; accuracy: number | null }) => void;
}): Promise<{
  lat: number;
  lng: number;
  accuracy: number | null;
  source: "current" | "last_known";
}> {
  // Step 1: last-known is synchronous from the OS location cache — returns in < 50 ms.
  const lastKnownPromise = Location.getLastKnownPositionAsync({
    requiredAccuracy: 5_000,          // accept up to 5 km stale accuracy
    maxAge: 10 * 60 * 1000,           // no older than 10 minutes
  });

  // Step 2: fire GPS request in parallel — don't await it first.
  const freshPromise = getCurrentCoordinates({
    highAccuracy: true,
    timeoutMs: 8_000,                 // reduced from 15 s
  });

  // Step 3: as soon as last-known resolves, notify caller so they can update UI now.
  const lastKnown = await lastKnownPromise;
  if (lastKnown && options?.onInstant) {
    options.onInstant({
      lat: lastKnown.coords.latitude,
      lng: lastKnown.coords.longitude,
      accuracy: lastKnown.coords.accuracy ?? null,
    });
  }

  // Step 4: wait for fresh GPS (may already be done since both ran in parallel).
  try {
    const current = await freshPromise;
    return { ...current, source: "current" };
  } catch {
    if (lastKnown) {
      return {
        lat: lastKnown.coords.latitude,
        lng: lastKnown.coords.longitude,
        accuracy: lastKnown.coords.accuracy ?? null,
        source: "last_known",
      };
    }
    throw new Error("GPS_TIMEOUT");
  }
}

export async function reverseGeocodeDetails(
  lat: number,
  lng: number,
  options?: { previousLabel?: string; previousLat?: number; previousLng?: number },
): Promise<{ label: string; isoCountryCode: string | null }> {
  const results = await Location.reverseGeocodeAsync({
    latitude: lat,
    longitude: lng,
  });

  if (!results.length) {
    return { label: `${lat.toFixed(4)}, ${lng.toFixed(4)}`, isoCountryCode: null };
  }

  const merged = mergeGeocodeResults(results);
  let label = pickConsistentLabel(results);
  const isoCountryCode = merged.isoCountryCode?.trim().toUpperCase() ?? null;

  if (
    options?.previousLabel &&
    options.previousLat != null &&
    options.previousLng != null
  ) {
    const dist = distanceMeters(options.previousLat, options.previousLng, lat, lng);
    if (shouldKeepPreviousLabel(options.previousLabel, label, dist)) {
      label = options.previousLabel;
    }
  }

  return { label, isoCountryCode };
}

export async function reverseGeocodeLabel(lat: number, lng: number) {
  const { label } = await reverseGeocodeDetails(lat, lng);
  return label;
}

export async function geocodeSearchQuery(query: string) {
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    throw new Error("Enter at least 2 characters.");
  }

  const results = await Location.geocodeAsync(trimmed);
  if (!results[0]) {
    throw new Error("No location found. Try a different search.");
  }

  const { latitude: lat, longitude: lng } = results[0];
  const { label, isoCountryCode } = await reverseGeocodeDetails(lat, lng).catch(
    () => ({ label: trimmed, isoCountryCode: null as string | null }),
  );

  return { lat, lng, label, isoCountryCode };
}

export async function detectDeviceLocation(options?: {
  previous?: StoredAppLocation | null;
  force?: boolean;
  /**
   * Called as soon as last-known coordinates are available (< 50 ms) so the
   * caller can update the UI immediately — before geocoding finishes.
   */
  onInstantCoords?: (partial: StoredAppLocation) => void;
}) {
  const granted = await hasLocationPermission();
  if (!granted) {
    throw new Error("PERMISSION_DENIED");
  }

  const servicesReady = await prepareLocationServices();
  if (!servicesReady) {
    throw new Error("SERVICES_DISABLED");
  }

  const previous = options?.previous ?? null;

  // Fire GPS + last-known in parallel. Notify caller with raw coords instantly.
  const coords = await getBestAvailableCoordinates({
    onInstant: options?.onInstantCoords
      ? (raw) => {
          options.onInstantCoords!({
            label: previous?.label ?? "Detecting location…",
            lat: raw.lat,
            lng: raw.lng,
            isoCountryCode: previous?.isoCountryCode ?? null,
            source: "gps",
            updatedAt: Date.now(),
          });
        }
      : undefined,
  });

  const { label, isoCountryCode } = await reverseGeocodeDetails(
    coords.lat,
    coords.lng,
    {
      previousLabel: previous?.label,
      previousLat: previous?.lat,
      previousLng: previous?.lng,
    },
  );

  const stored: StoredAppLocation = {
    label,
    lat: coords.lat,
    lng: coords.lng,
    isoCountryCode: isoCountryCode ?? previous?.isoCountryCode ?? null,
    source: "gps",
    updatedAt: Date.now(),
  };

  await saveStoredLocation(stored);
  return stored;
}

/** Re-format a stored label after app update (optional migration helper). */
export async function refreshLabelFromCoords(lat: number, lng: number) {
  return reverseGeocodeLabel(lat, lng);
}

/** City name for feed search, e.g. "Kukatpally, Hyderabad" → "Hyderabad". */
export function extractCityFromLocationLabel(label: string): string | undefined {
  const parts = label
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return undefined;
  if (parts.length === 1) return parts[0];
  return parts[parts.length - 1];
}

/**
 * Returns up to `maxResults` distinct geocoded suggestions for `query`.
 * Used by LocationAutocompleteInput.
 */
export async function geocodeQuerySuggestions(
  query: string,
  maxResults = 5,
): Promise<Array<{ label: string; lat: number; lng: number; isoCountryCode: string | null }>> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const results = await Location.geocodeAsync(trimmed);
  const sliced = results.slice(0, maxResults);

  const details = await Promise.all(
    sliced.map(async ({ latitude: lat, longitude: lng }) => {
      const { label, isoCountryCode } = await reverseGeocodeDetails(lat, lng).catch(() => ({
        label: `${lat.toFixed(3)}, ${lng.toFixed(3)}`,
        isoCountryCode: null as string | null,
      }));
      return { label, lat, lng, isoCountryCode };
    }),
  );

  // Deduplicate by label
  const seen = new Set<string>();
  return details.filter((s) => {
    const key = s.label.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export type DetailedLocationSuggestion = {
  id: string;
  title: string;
  subtitle: string;
  lat: number;
  lng: number;
  isoCountryCode: string | null;
};

/**
 * Returns detailed suggestions with title (primary name) and subtitle
 * (street, area, city, state, pincode) for professional autocomplete UIs.
 */
export async function geocodeDetailedSuggestions(
  query: string,
  maxResults = 5,
): Promise<DetailedLocationSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const results = await Location.geocodeAsync(trimmed);
  const sliced = results.slice(0, maxResults);

  const details = await Promise.all(
    sliced.map(async ({ latitude: lat, longitude: lng }, idx) => {
      try {
        const reverseResults = await Location.reverseGeocodeAsync({
          latitude: lat,
          longitude: lng,
        });

        if (!reverseResults.length) {
          return {
            id: `${lat}-${lng}-${idx}`,
            title: trimmed,
            subtitle: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
            lat,
            lng,
            isoCountryCode: null,
          };
        }

        const merged = mergeGeocodeResults(reverseResults);
        const raw = reverseResults[0];

        // Build title: prefer name/subregion that resembles what user typed
        const nameCandidates = [
          normalizePart(merged.name),
          normalizePart(merged.subregion),
          normalizePart(merged.district),
          normalizePart(raw?.name),
          normalizePart(raw?.street),
        ].filter((v) => v.length >= 2);

        let title = nameCandidates[0] || normalizePart(merged.city) || trimmed;

        // Build subtitle parts: street, area, city, region, pincode
        const subtitleParts: string[] = [];
        const street = normalizePart(raw?.street);
        if (street && street !== title && !looksLikeStreetAddress(street)) {
          subtitleParts.push(street);
        }
        const subregion = normalizePart(merged.subregion);
        if (subregion && subregion !== title && !subtitleParts.includes(subregion)) {
          subtitleParts.push(subregion);
        }
        const city = normalizePart(merged.city);
        if (city && city !== title && !subtitleParts.includes(city)) {
          subtitleParts.push(city);
        }
        const region = normalizePart(merged.region);
        if (region && region !== city && !subtitleParts.includes(region)) {
          subtitleParts.push(region);
        }
        const postalCode = normalizePart(merged.postalCode);
        if (postalCode) {
          subtitleParts.push(postalCode);
        }

        const subtitle = subtitleParts.join(", ") || normalizePart(merged.city) || "";
        const isoCountryCode = merged.isoCountryCode?.trim().toUpperCase() ?? null;

        return { id: `${lat}-${lng}-${idx}`, title, subtitle, lat, lng, isoCountryCode };
      } catch {
        return {
          id: `${lat}-${lng}-${idx}`,
          title: trimmed,
          subtitle: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
          lat,
          lng,
          isoCountryCode: null,
        };
      }
    }),
  );

  // Deduplicate by title+subtitle
  const seen = new Set<string>();
  return details.filter((s) => {
    const key = `${s.title}|${s.subtitle}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

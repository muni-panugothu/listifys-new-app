import type { LocationSource } from "@/store/slices/location-slice";

/** How listing APIs should scope results for the current location state. */
export type LocationQueryMode = "nearby" | "manual" | "global";

export type LocationQueryState = {
  lat: number | null;
  lng: number | null;
  label: string;
  isoCountryCode: string | null;
  source: LocationSource;
};

export type LocationQueryParams = {
  lat?: number;
  lng?: number;
  radius?: number;
  countryCode?: string;
  location?: string;
};

const PLACEHOLDER_LABELS = new Set(["Set location", "Detecting location…"]);

export function hasActionableLocation(state: LocationQueryState): boolean {
  if (state.lat == null || state.lng == null) return false;
  return state.source === "manual" || state.source === "gps";
}

/** True when neither GPS nor a manual pick provides coordinates. */
export function isGlobalLocationMode(state: LocationQueryState): boolean {
  return !hasActionableLocation(state);
}

export function getLocationQueryMode(state: LocationQueryState): LocationQueryMode {
  if (!hasActionableLocation(state)) return "global";
  return state.source === "manual" ? "manual" : "nearby";
}

/**
 * Build API geo params. Returns an empty object in global mode so callers never
 * send null lat/lng or accidental country filters.
 */
export function buildLocationQueryParams(
  state: LocationQueryState,
  options?: { radius?: number },
): LocationQueryParams {
  const radius = options?.radius ?? 100;

  if (state.lat == null || state.lng == null) {
    return {};
  }

  if (state.source !== "manual" && state.source !== "gps") {
    return {};
  }

  return {
    lat: state.lat,
    lng: state.lng,
    radius,
    countryCode: state.isoCountryCode ?? undefined,
  };
}

export function splitHomeLocationLabel(label: string) {
  const trimmed = label?.trim() || "Set location";
  if (PLACEHOLDER_LABELS.has(trimmed) || trimmed.startsWith("Detecting")) {
    return { primary: "Select Location", secondary: "Choose your city" };
  }
  const parts = trimmed
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length <= 1) {
    return { primary: parts[0] ?? trimmed, secondary: "" };
  }
  return {
    primary: parts[0],
    secondary: parts.slice(1).join(", "),
  };
}

/** Header copy when the user has not picked GPS or a manual city. */
export function formatHomeLocationHeader(
  state: LocationQueryState,
): { primary: string; secondary: string } {
  if (hasActionableLocation(state)) {
    return splitHomeLocationLabel(state.label);
  }
  return { primary: "Select Location", secondary: "Choose your city" };
}

export function isPlaceholderLocationLabel(label: string): boolean {
  const trimmed = label?.trim() ?? "";
  return !trimmed || PLACEHOLDER_LABELS.has(trimmed) || trimmed.startsWith("Detecting");
}

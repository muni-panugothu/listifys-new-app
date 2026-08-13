import { createAsyncThunk, createSelector, createSlice, type PayloadAction } from "@reduxjs/toolkit";

import {
  clearAllPersistedLocations,
  clearDeviceLocation,
  detectDeviceLocation,
  ensureDeviceLocationAccess,
  geocodeSearchQuery,
  hasLocationPermission,
  loadDeviceLocation,
  loadManualLocation,
  migrateLegacyLocationStorage,
  resolveActiveLocationFromStorage,
  LOCATION_AUTO_REFRESH_MS,
  saveStoredLocation,
  type StoredAppLocation,
} from "@/lib/location-service";

import {
  formatHomeLocationHeader,
  hasActionableLocation,
  type LocationQueryState,
} from "@/lib/location-query-params";

import type { RootState } from "../index";

export type LocationSource = "gps" | "manual" | "profile" | null;

type LocationState = {
  label: string;
  lat: number | null;
  lng: number | null;
  /** ISO 3166-1 alpha-2 country code, e.g. "IN", "US", "GB". */
  isoCountryCode: string | null;
  source: LocationSource;
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  hydrated: boolean;
};

const initialState: LocationState = {
  label: "Set location",
  lat: null,
  lng: null,
  isoCountryCode: null,
  source: null,
  status: "idle",
  error: null,
  hydrated: false,
};

function applyStored(state: LocationState, stored: StoredAppLocation) {
  state.label = stored.label;
  state.lat = stored.lat;
  state.lng = stored.lng;
  state.isoCountryCode = stored.isoCountryCode ?? null;
  state.source = stored.source;
  state.status = "ready";
  state.error = null;
}

export const hydrateAppLocation = createAsyncThunk(
  "location/hydrate",
  async () => {
    await migrateLegacyLocationStorage();
    return resolveActiveLocationFromStorage();
  },
);

/** Clear manual + device storage and reset Redux to global mode. */
export const clearActiveLocation = createAsyncThunk(
  "location/clearActive",
  async () => {
    await clearAllPersistedLocations();
  },
);

/** Sync Redux with storage after permission changes (deny/allow/manual). */
export const reconcileLocationPermission = createAsyncThunk(
  "location/reconcilePermission",
  async () => resolveActiveLocationFromStorage(),
);

export const refreshDeviceLocation = createAsyncThunk(
  "location/refreshDevice",
  async (options: { force?: boolean } | undefined, { getState, dispatch, rejectWithValue }) => {
    try {
      const stored = await loadManualLocation();
      const force = options?.force === true;

      // Never auto-override a user's manually chosen location with GPS
      if (!force && stored) {
        return stored;
      }

      const permitted = await hasLocationPermission();
      if (!permitted) {
        await clearDeviceLocation();
        return rejectWithValue("PERMISSION_DENIED");
      }

      const deviceStored = await loadDeviceLocation();

      if (
        deviceStored?.source === "gps" &&
        deviceStored.updatedAt &&
        !force &&
        Date.now() - deviceStored.updatedAt < LOCATION_AUTO_REFRESH_MS
      ) {
        return deviceStored;
      }

      const loc = (getState() as RootState).location;
      const previous: StoredAppLocation | null =
        deviceStored ??
        (loc.source === "gps" && loc.lat != null && loc.lng != null
          ? {
              label: loc.label,
              lat: loc.lat,
              lng: loc.lng,
              isoCountryCode: loc.isoCountryCode,
              source: "gps",
              updatedAt: 0,
            }
          : null);

      return await detectDeviceLocation({
        previous,
        force,
        onInstantCoords: (partial) => {
          dispatch(applyInstantCoords(partial));
        },
      });
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Could not detect location",
      );
    }
  },
);

export const setLocationFromSearch = createAsyncThunk(
  "location/setFromSearch",
  async (query: string, { rejectWithValue }) => {
    try {
      const result = await geocodeSearchQuery(query);
      const stored: StoredAppLocation = {
        label: result.label,
        lat: result.lat,
        lng: result.lng,
        isoCountryCode: result.isoCountryCode ?? null,
        source: "manual",
        updatedAt: Date.now(),
      };
      await saveStoredLocation(stored);
      return stored;
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Could not find location",
      );
    }
  },
);

export const useCurrentDeviceLocation = createAsyncThunk(
  "location/useCurrent",
  async (_, { getState, dispatch, rejectWithValue }) => {
    try {
      const access = await ensureDeviceLocationAccess();
      if (!access.ok) {
        if (access.reason === "permission_denied") {
          await clearDeviceLocation();
        }
        return rejectWithValue(
          access.reason === "permission_denied"
            ? "PERMISSION_DENIED"
            : "SERVICES_DISABLED",
        );
      }

      const deviceStored = await loadDeviceLocation();
      const loc = (getState() as RootState).location;
      const previous: StoredAppLocation | null =
        deviceStored ??
        (loc.source === "gps" && loc.lat != null && loc.lng != null
          ? {
              label: loc.label,
              lat: loc.lat,
              lng: loc.lng,
              isoCountryCode: loc.isoCountryCode,
              source: "gps",
              updatedAt: 0,
            }
          : null);

      return await detectDeviceLocation({
        previous,
        force: true,
        // Instant callback: dispatch partial location (coords only, no label yet)
        // so the UI updates in < 50 ms without waiting for reverse geocoding.
        onInstantCoords: (partial) => {
          dispatch(applyInstantCoords(partial));
        },
      });
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Could not get current location",
      );
    }
  },
);

function clearGpsCoords(state: LocationState) {
  if (state.source === "manual") return;
  state.label = initialState.label;
  state.lat = null;
  state.lng = null;
  state.isoCountryCode = null;
  state.source = null;
}

const locationSlice = createSlice({
  name: "location",
  initialState,
  reducers: {
    setProfileFallbackLocation(state, action: { payload: string }) {
      const address = action.payload.trim();
      if (!address) return;
      if (state.source === "gps" || state.source === "manual") return;
      if (state.lat != null && state.lng != null) return;

      state.label = address;
      state.source = "profile";
      state.status = "ready";
    },
    /** Wipe the user's chosen location and clear all derived coords/country. */
    clearLocation(state) {
      state.label = initialState.label;
      state.lat = null;
      state.lng = null;
      state.isoCountryCode = null;
      state.source = null;
      state.status = "ready";
      state.error = null;
    },
    /**
     * Partial "instant" update — coords are known but label/geocoding still pending.
     * Sets coords + a placeholder label so distance calculations on cards work
     * immediately; the full label arrives when the thunk resolves.
     */
    applyInstantCoords(state, action: PayloadAction<StoredAppLocation>) {
      const { lat, lng, label, isoCountryCode } = action.payload;
      if (state.source === "manual") return;
      state.lat = lat;
      state.lng = lng;
      state.label = label || "Detecting location…";
      if (isoCountryCode) state.isoCountryCode = isoCountryCode;
      state.source = "gps";
      state.error = null;
    },
    /** Directly set location from an autocomplete selection (no async needed). */
    setLocationDirect(
      state,
      action: {
        payload: {
          label: string;
          lat: number;
          lng: number;
          isoCountryCode?: string | null;
        };
      },
    ) {
      state.label = action.payload.label;
      state.lat = action.payload.lat;
      state.lng = action.payload.lng;
      if (action.payload.isoCountryCode !== undefined) {
        state.isoCountryCode = action.payload.isoCountryCode;
      }
      state.source = "manual";
      state.status = "ready";
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(hydrateAppLocation.pending, (state) => {
        state.status = "loading";
      })
      .addCase(hydrateAppLocation.fulfilled, (state, action) => {
        state.hydrated = true;
        const payload = action.payload;
        if (payload) {
          applyStored(state, payload);
        } else {
          clearGpsCoords(state);
          state.status = "ready";
        }
      })
      .addCase(hydrateAppLocation.rejected, (state) => {
        state.hydrated = true;
        clearGpsCoords(state);
        state.status = "ready";
      })

      .addCase(reconcileLocationPermission.fulfilled, (state, action) => {
        const payload = action.payload;
        if (payload) {
          applyStored(state, payload);
        } else {
          clearGpsCoords(state);
        }
        state.status = "ready";
        state.error = null;
      })
      .addCase(reconcileLocationPermission.rejected, (state) => {
        clearGpsCoords(state);
        state.status = "ready";
      })

      .addCase(clearActiveLocation.fulfilled, (state) => {
        state.label = initialState.label;
        state.lat = null;
        state.lng = null;
        state.isoCountryCode = null;
        state.source = null;
        state.status = "ready";
        state.error = null;
      })

      .addCase(refreshDeviceLocation.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(refreshDeviceLocation.fulfilled, (state, action) => {
        applyStored(state, action.payload);
      })
      .addCase(refreshDeviceLocation.rejected, (state, action) => {
        const reason = (action.payload as string) ?? "Location unavailable";
        if (reason === "PERMISSION_DENIED") {
          clearGpsCoords(state);
        }
        state.status = state.source === "manual" ? "ready" : state.lat != null ? "ready" : "error";
        state.error = reason;
      })

      .addCase(setLocationFromSearch.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(setLocationFromSearch.fulfilled, (state, action) => {
        applyStored(state, action.payload);
      })
      .addCase(setLocationFromSearch.rejected, (state, action) => {
        state.status = state.lat != null ? "ready" : "error";
        state.error = (action.payload as string) ?? "Search failed";
      })

      .addCase(useCurrentDeviceLocation.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(useCurrentDeviceLocation.fulfilled, (state, action) => {
        applyStored(state, action.payload);
      })
      .addCase(useCurrentDeviceLocation.rejected, (state, action) => {
        const reason = (action.payload as string) ?? "Location unavailable";
        if (reason === "PERMISSION_DENIED") {
          clearGpsCoords(state);
        }
        state.status = state.lat != null ? "ready" : "error";
        state.error = reason;
      })
      // When user logs out, wipe their location so a guest/new login
      // starts fresh with no location filter (shows all-countries data).
      .addMatcher(
        (action) => action.type === "auth/logout/fulfilled",
        (state) => {
          state.label = initialState.label;
          state.lat = initialState.lat;
          state.lng = initialState.lng;
          state.isoCountryCode = initialState.isoCountryCode;
          state.source = initialState.source;
          state.status = initialState.status;
          state.error = initialState.error;
          state.hydrated = false;
        },
      );
  },
});

export const { setProfileFallbackLocation, setLocationDirect, clearLocation, applyInstantCoords } = locationSlice.actions;

export const selectLocationLabel = (state: RootState) => {
  if (state.location.status === "loading" && !state.location.hydrated) {
    return "Detecting location…";
  }
  const { lat, lng, source, label } = state.location;
  if (lat == null || lng == null || (source !== "manual" && source !== "gps")) {
    return "Set location";
  }
  return label;
};

export const selectLocationCoords = createSelector(
  (state: RootState) => state.location.lat,
  (state: RootState) => state.location.lng,
  (state: RootState) => state.location.label,
  (state: RootState) => state.location.isoCountryCode,
  (lat, lng, label, isoCountryCode) => ({ lat, lng, label, isoCountryCode }),
);

export const selectIsoCountryCode = (state: RootState) =>
  state.location.isoCountryCode;

export const selectLocationSource = (state: RootState) =>
  state.location.source;

/** Distance on cards is shown only when coordinates are available. */
export const selectCanShowDistanceOnCards = (state: RootState) =>
  hasActionableLocation(selectLocationQueryState(state));

export const selectLocationQueryState = createSelector(
  (state: RootState) => state.location.lat,
  (state: RootState) => state.location.lng,
  (state: RootState) => state.location.label,
  (state: RootState) => state.location.isoCountryCode,
  (state: RootState) => state.location.source,
  (lat, lng, label, isoCountryCode, source): LocationQueryState => ({
    lat,
    lng,
    label,
    isoCountryCode,
    source,
  }),
);

export const selectHasActionableLocation = (state: RootState) =>
  hasActionableLocation(selectLocationQueryState(state));

/** Active location mode for UI / API: device (gps), manual, or none. */
export const selectLocationMode = (state: RootState): "device" | "manual" | "none" => {
  const { source, lat, lng } = state.location;
  if (lat != null && lng != null && source === "manual") return "manual";
  if (lat != null && lng != null && source === "gps") return "device";
  return "none";
};

export const selectIsGlobalLocationMode = (state: RootState) =>
  selectLocationMode(state) === "none";

export const selectHomeLocationHeader = createSelector(
  selectLocationQueryState,
  (queryState) => formatHomeLocationHeader(queryState),
);

export default locationSlice.reducer;

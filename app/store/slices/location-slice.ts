import { createAsyncThunk, createSelector, createSlice, type PayloadAction } from "@reduxjs/toolkit";

import {
  detectDeviceLocation,
  ensureDeviceLocationAccess,
  geocodeSearchQuery,
  hasLocationPermission,
  loadStoredLocation,
  LOCATION_AUTO_REFRESH_MS,
  LOCATION_STORAGE_KEY,
  saveStoredLocation,
  type StoredAppLocation,
} from "@/lib/location-service";

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
  async (_, { getState }) => {
    const stored = await loadStoredLocation();
    const permitted = await hasLocationPermission();

    if (stored) {
      // Manual picks are always honoured. GPS / legacy caches are dropped when
      // the user has denied location (e.g. tapped "No thanks" on the prompt).
      if (stored.source === "manual") {
        return stored;
      }

      if (!permitted) {
        try {
          const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
          await AsyncStorage.removeItem(LOCATION_STORAGE_KEY);
        } catch {
          // best-effort
        }
      } else if (stored.source === "gps" || stored.lat != null) {
        return stored;
      }
    }

    const user = (getState() as RootState).auth.user;
    const profileAddress = user?.address?.trim();
    if (profileAddress) {
      return {
        label: profileAddress,
        lat: null,
        lng: null,
        source: "profile" as const,
      };
    }

    return null;
  },
);

export const refreshDeviceLocation = createAsyncThunk(
  "location/refreshDevice",
  async (options: { force?: boolean } | undefined, { getState, dispatch, rejectWithValue }) => {
    try {
      const stored = await loadStoredLocation();
      const force = options?.force === true;

      // Never auto-override a user's manually chosen location with GPS
      if (!force && stored?.source === "manual") {
        return stored;
      }

      // If the OS no longer grants location, drop any stale GPS cache so we
      // don't keep showing the user's previous location after they've revoked
      // the permission. Manual entries above are preserved on purpose.
      const permitted = await hasLocationPermission();
      if (!permitted) {
        if (stored?.source === "gps") {
          try {
            const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
            await AsyncStorage.removeItem(LOCATION_STORAGE_KEY);
          } catch {
            // best-effort
          }
        }
        return rejectWithValue("PERMISSION_DENIED");
      }

      if (
        stored?.source === "gps" &&
        stored.updatedAt &&
        !force &&
        Date.now() - stored.updatedAt < LOCATION_AUTO_REFRESH_MS
      ) {
        return stored;
      }

      const loc = (getState() as RootState).location;
      const previous: StoredAppLocation | null =
        stored ??
        (loc.lat != null && loc.lng != null
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
        return rejectWithValue(
          access.reason === "permission_denied"
            ? "PERMISSION_DENIED"
            : "SERVICES_DISABLED",
        );
      }

      const stored = await loadStoredLocation();
      const loc = (getState() as RootState).location;
      const previous: StoredAppLocation | null =
        stored ??
        (loc.lat != null && loc.lng != null
          ? {
              label: loc.label,
              lat: loc.lat,
              lng: loc.lng,
              isoCountryCode: loc.isoCountryCode,
              source: loc.source === "manual" ? "manual" : "gps",
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
      if (state.source === "manual") return; // never override manual pick
      state.lat = lat;
      state.lng = lng;
      // Keep existing label if it's real; only use placeholder if nothing exists
      if (!state.label || state.label === "Set location") {
        state.label = label || "Detecting location…";
      }
      if (isoCountryCode) state.isoCountryCode = isoCountryCode;
      state.source = "gps";
      state.error = null;
      // Do NOT set status = "ready" — keep "loading" so spinner shows until full label arrives
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
        if (payload && "lat" in payload && payload.lat != null) {
          applyStored(state, payload as StoredAppLocation);
        } else if (payload && "label" in payload) {
          state.label = payload.label;
          state.lat = null;
          state.lng = null;
          state.source = payload.source ?? "profile";
          state.status = "ready";
          state.error = null;
        } else {
          clearGpsCoords(state);
          state.status = "ready";
        }
      })
      .addCase(hydrateAppLocation.rejected, (state) => {
        state.hydrated = true;
        state.status = "ready";
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
        // When the OS denies/revokes permission, drop any cached GPS coords so
        // the app no longer claims the user is at a stale location. Manual
        // and profile-set locations are preserved.
        if (reason === "PERMISSION_DENIED") {
          clearGpsCoords(state);
        }
        state.status = state.lat != null ? "ready" : "error";
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
  return state.location.label;
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

/** Distance on cards is shown only after the user explicitly picks a location. */
export const selectCanShowDistanceOnCards = (state: RootState) =>
  state.location.lat != null &&
  state.location.lng != null;

export default locationSlice.reducer;

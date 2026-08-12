import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";

/** Legacy auth onboarding flag (slide-3 skip / sign-in completion). */
const ONBOARDING_KEY = "@listify/onboarding_complete";
const ONBOARDING_VERSION = "v2";

/** First-install intro carousel — shown once per app install, survives logout. */
export const FIRST_INSTALL_INTRO_KEY = "@listify/first_install_intro_v1";
const FIRST_INSTALL_INTRO_VERSION = "v1";

type OnboardingState = {
  /** Legacy flag — used by auth slide-3 flows. */
  hasCompletedOnboarding: boolean | null;
  /** New 3-screen first-launch intro — null until storage is read. */
  hasCompletedFirstInstallIntro: boolean | null;
};

const initialState: OnboardingState = {
  hasCompletedOnboarding: null,
  hasCompletedFirstInstallIntro: null,
};

export const checkOnboarding = createAsyncThunk(
  "onboarding/check",
  async () => {
    const value = await AsyncStorage.getItem(ONBOARDING_KEY);
    return value === ONBOARDING_VERSION;
  },
);

export const completeOnboarding = createAsyncThunk(
  "onboarding/complete",
  async () => {
    await AsyncStorage.setItem(ONBOARDING_KEY, ONBOARDING_VERSION);
    return true;
  },
);

export const checkFirstInstallIntro = createAsyncThunk(
  "onboarding/checkFirstInstallIntro",
  async () => {
    const [introValue, legacyValue] = await Promise.all([
      AsyncStorage.getItem(FIRST_INSTALL_INTRO_KEY),
      AsyncStorage.getItem(ONBOARDING_KEY),
    ]);
    if (introValue === FIRST_INSTALL_INTRO_VERSION) return true;
    // App updates: users who already completed the legacy auth welcome flow.
    if (legacyValue === ONBOARDING_VERSION) return true;
    return false;
  },
);

export const completeFirstInstallIntro = createAsyncThunk(
  "onboarding/completeFirstInstallIntro",
  async () => {
    await AsyncStorage.setItem(
      FIRST_INSTALL_INTRO_KEY,
      FIRST_INSTALL_INTRO_VERSION,
    );
    return true;
  },
);

const onboardingSlice = createSlice({
  name: "onboarding",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(checkOnboarding.fulfilled, (state, action) => {
        state.hasCompletedOnboarding = action.payload;
      })
      .addCase(checkOnboarding.rejected, (state) => {
        state.hasCompletedOnboarding = false;
      })
      .addCase(completeOnboarding.fulfilled, (state) => {
        state.hasCompletedOnboarding = true;
      })
      .addCase(checkFirstInstallIntro.fulfilled, (state, action) => {
        state.hasCompletedFirstInstallIntro = action.payload;
      })
      .addCase(checkFirstInstallIntro.rejected, (state) => {
        state.hasCompletedFirstInstallIntro = false;
      })
      .addCase(completeFirstInstallIntro.fulfilled, (state) => {
        state.hasCompletedFirstInstallIntro = true;
      });
  },
});

export default onboardingSlice.reducer;

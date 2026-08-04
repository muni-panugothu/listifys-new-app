/**
 * Listifys design tokens for Light and Dark themes.
 *
 * IMPORTANT — Brand preservation:
 *   The primary brand green (#27BB97) is **preserved unchanged** across both
 *   themes. It stays the accent for buttons, badges, active states, and links
 *   so the app never loses its identity, only its surface treatment.
 *
 * Everything is semantic (background / surface / textPrimary / …) so screens
 * consume `theme.colors.background` — never raw hex — and stay in sync when
 * the mode changes.
 */

const BRAND = {
  /** Primary accent — used identically in both light and dark themes. */
  primary: "#27BB97",
  primaryDeep: "#1D9477",
  primarySoft: "rgba(39,187,151,0.12)",
  primarySoftStrong: "rgba(39,187,151,0.18)",
  // Support accents (kept identical across themes for badges / role icons)
  accentPink: "#F43F9C",
  accentPurple: "#8B5CF6",
  accentBlue: "#3B82F6",
  accentOrange: "#FB923C",
  accentIndigo: "#6366F1",
  danger: "#EF4444",
  warning: "#F59E0B",
  success: "#22C55E",
} as const;

export type ThemeMode = "light" | "dark" | "system";
export type ResolvedThemeMode = "light" | "dark";

export type ThemeColors = {
  /** Root screen background (behind everything). */
  background: string;
  /** One-level surface above background (cards, sheets, top bar). */
  surface: string;
  /** Elevated surface (raised cards, popovers). */
  surfaceElevated: string;
  /** Faint tint used for chips, category tiles, muted stat pills. */
  surfaceMuted: string;
  /** Sheet / modal backdrop. */
  scrim: string;
  /** Text — primary. */
  textPrimary: string;
  /** Text — secondary / caption. */
  textSecondary: string;
  /** Text — tertiary / disabled. */
  textTertiary: string;
  /** Inverse text (used on filled brand buttons). */
  textOnPrimary: string;
  /** Hairline dividers and card borders. */
  border: string;
  /** Slightly stronger border for inputs/tabs. */
  borderStrong: string;
  /** Skeleton / placeholder tone. */
  skeleton: string;
  /** Brand primary and derivatives. */
  primary: string;
  primaryDeep: string;
  primarySoft: string;
  primarySoftStrong: string;
  /** Accent colors (same in both themes). */
  accentPink: string;
  accentPurple: string;
  accentBlue: string;
  accentOrange: string;
  accentIndigo: string;
  danger: string;
  warning: string;
  success: string;
  /** Solid header/status-bar background driven from theme. */
  statusBarBackground: string;
  /** "dark" | "light" — used with expo-status-bar. */
  statusBarStyle: "dark" | "light";
  /** Icon default tint (matches textPrimary for maximum contrast). */
  icon: string;
  /** Muted icon tint (used for placeholders / chevrons). */
  iconMuted: string;
  /** Card default background (equal to surface but named for clarity). */
  card: string;
  /** Input background. */
  inputBackground: string;
  /** Input placeholder text. */
  inputPlaceholder: string;
  /** Chat bubble tints. */
  bubbleMe: string;
  bubbleThem: string;
  bubbleTextMe: string;
  bubbleTextThem: string;
};

export type Theme = {
  mode: ResolvedThemeMode;
  colors: ThemeColors;
};

const LIGHT: ThemeColors = {
  background: "#F6F7F8",
  surface: "#FFFFFF",
  surfaceElevated: "#FFFFFF",
  surfaceMuted: "#F1F2F4",
  scrim: "rgba(0,0,0,0.40)",
  textPrimary: "#161D1A",
  textSecondary: "#6B7280",
  textTertiary: "#9CA3AF",
  textOnPrimary: "#FFFFFF",
  border: "#E5E7EB",
  borderStrong: "#D1D5DB",
  skeleton: "#EEF0F2",
  primary: BRAND.primary,
  primaryDeep: BRAND.primaryDeep,
  primarySoft: BRAND.primarySoft,
  primarySoftStrong: BRAND.primarySoftStrong,
  accentPink: BRAND.accentPink,
  accentPurple: BRAND.accentPurple,
  accentBlue: BRAND.accentBlue,
  accentOrange: BRAND.accentOrange,
  accentIndigo: BRAND.accentIndigo,
  danger: BRAND.danger,
  warning: BRAND.warning,
  success: BRAND.success,
  statusBarBackground: "#FFFFFF",
  statusBarStyle: "dark",
  icon: "#161D1A",
  iconMuted: "#9CA3AF",
  card: "#FFFFFF",
  inputBackground: "#FFFFFF",
  inputPlaceholder: "#9CA3AF",
  bubbleMe: BRAND.primary,
  bubbleThem: "#F1F2F4",
  bubbleTextMe: "#FFFFFF",
  bubbleTextThem: "#161D1A",
};

const DARK: ThemeColors = {
  // Rich charcoal, not pure black — matches Airbnb / Spotify tone.
  background: "#0D0F12",
  surface: "#161A1F",
  surfaceElevated: "#1E232A",
  surfaceMuted: "#22282F",
  scrim: "rgba(0,0,0,0.60)",
  textPrimary: "#F5F7FA",
  textSecondary: "#B0B6BF",
  textTertiary: "#7E858E",
  textOnPrimary: "#FFFFFF",
  border: "#242A32",
  borderStrong: "#2E353F",
  skeleton: "#1E232A",
  primary: BRAND.primary,
  primaryDeep: BRAND.primaryDeep,
  primarySoft: "rgba(39,187,151,0.18)",
  primarySoftStrong: "rgba(39,187,151,0.28)",
  accentPink: BRAND.accentPink,
  accentPurple: BRAND.accentPurple,
  accentBlue: BRAND.accentBlue,
  accentOrange: BRAND.accentOrange,
  accentIndigo: BRAND.accentIndigo,
  danger: BRAND.danger,
  warning: BRAND.warning,
  success: BRAND.success,
  statusBarBackground: "#0D0F12",
  statusBarStyle: "light",
  icon: "#F5F7FA",
  iconMuted: "#7E858E",
  card: "#161A1F",
  inputBackground: "#1E232A",
  inputPlaceholder: "#7E858E",
  bubbleMe: BRAND.primary,
  bubbleThem: "#22282F",
  bubbleTextMe: "#FFFFFF",
  bubbleTextThem: "#F5F7FA",
};

export const LightTheme: Theme = { mode: "light", colors: LIGHT };
export const DarkTheme: Theme = { mode: "dark", colors: DARK };

export function getTheme(mode: ResolvedThemeMode): Theme {
  return mode === "dark" ? DarkTheme : LightTheme;
}

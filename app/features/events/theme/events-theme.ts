import { useMemo } from "react";

import { useTheme } from "@/providers/theme-provider";
import type { ThemeColors } from "@/theme/theme-tokens";

/** Semantic tokens for the entire Events section (category pages, cards, details). */
export type EventsThemeTokens = {
  background: string;
  surface: string;
  surfaceSecondary: string;
  headerBg: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  icon: string;
  iconMuted: string;
  border: string;
  divider: string;
  chipBg: string;
  chipBorder: string;
  chipText: string;
  chipActiveBg: string;
  chipActiveBorder: string;
  chipIconMuted: string;
  bookmarkBg: string;
  bookmarkIcon: string;
  skeleton: string;
  skeletonSecondary: string;
  emptyButtonBorder: string;
  emptyButtonText: string;
  heroTitleText: string;
  tabActiveText: string;
  tabInactiveText: string;
  footerMuted: string;
  /** Hero media area behind event detail */
  detailHeroBg: string;
  detailScrim: string;
  detailOverlayIconBg: string;
  detailCollapsedHeaderBg: string;
};

export function buildEventsTheme(
  colors: ThemeColors,
  isDark: boolean,
): EventsThemeTokens {
  return {
    background: colors.background,
    surface: colors.surface,
    surfaceSecondary: colors.surfaceMuted,
    headerBg: colors.background,
    textPrimary: colors.textPrimary,
    textSecondary: colors.textSecondary,
    textMuted: colors.textTertiary,
    icon: colors.icon,
    iconMuted: colors.iconMuted,
    border: colors.border,
    divider: isDark ? "rgba(255,255,255,0.08)" : colors.border,
    chipBg: isDark ? colors.surfaceElevated : colors.surface,
    chipBorder: isDark ? colors.borderStrong : colors.border,
    chipText: colors.textPrimary,
    chipActiveBg: isDark ? "rgba(255,255,255,0.08)" : colors.surfaceElevated,
    chipActiveBorder: colors.textPrimary,
    chipIconMuted: colors.iconMuted,
    bookmarkBg: isDark ? "rgba(0,0,0,0.52)" : "rgba(255,255,255,0.94)",
    bookmarkIcon: isDark ? "#FFFFFF" : colors.textPrimary,
    skeleton: colors.skeleton,
    skeletonSecondary: isDark ? "rgba(255,255,255,0.05)" : colors.border,
    emptyButtonBorder: isDark ? "rgba(255,255,255,0.22)" : colors.borderStrong,
    emptyButtonText: colors.textPrimary,
    heroTitleText: isDark ? "#FFFFFF" : colors.textPrimary,
    tabActiveText: colors.textPrimary,
    tabInactiveText: colors.textSecondary,
    footerMuted: colors.textTertiary,
    detailHeroBg: isDark ? "#000000" : colors.background,
    detailScrim: isDark ? "rgba(0,0,0,0.45)" : "rgba(0,0,0,0.22)",
    detailOverlayIconBg: isDark ? "rgba(0,0,0,0.38)" : "rgba(255,255,255,0.88)",
    detailCollapsedHeaderBg: isDark
      ? "rgba(13,15,18,0.94)"
      : "rgba(255,255,255,0.96)",
  };
}

export function useEventsTheme() {
  const { colors, isDark, theme } = useTheme();
  const tokens = useMemo(
    () => buildEventsTheme(colors, isDark),
    [colors, isDark],
  );
  return { ...tokens, isDark, colors, theme };
}

export function getCategoryHeroGradient(
  heroGradientDark: [string, string, string],
  heroGradientLight: [string, string, string] | undefined,
  isDark: boolean,
  colors: ThemeColors,
): [string, string, string] {
  if (isDark) return heroGradientDark;
  return (
    heroGradientLight ?? [
      colors.surfaceElevated,
      colors.surface,
      colors.background,
    ]
  );
}

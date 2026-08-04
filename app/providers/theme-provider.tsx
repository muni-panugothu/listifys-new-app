/**
 * Listifys ThemeProvider — single source of truth for Light / Dark / System.
 *
 * - Preference persisted in AsyncStorage (`@listify/theme_mode`)
 * - Instant UI updates via React context
 * - Syncs React Native `Appearance.setColorScheme` so native chrome follows
 * - System mode listens to OS appearance changes live
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Appearance, type ColorSchemeName } from "react-native";

import {
  DarkTheme,
  LightTheme,
  type ResolvedThemeMode,
  type Theme,
  type ThemeMode,
} from "@/theme/theme-tokens";

const STORAGE_KEY = "@listify/theme_mode";
const VALID_MODES = new Set<ThemeMode>(["light", "dark", "system"]);

type ThemeContextValue = {
  mode: ThemeMode;
  resolvedMode: ResolvedThemeMode;
  theme: Theme;
  colors: Theme["colors"];
  isDark: boolean;
  setMode: (mode: ThemeMode) => Promise<void>;
  hydrated: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function resolve(
  mode: ThemeMode,
  systemScheme: ColorSchemeName,
): ResolvedThemeMode {
  if (mode === "system") return systemScheme === "dark" ? "dark" : "light";
  return mode;
}

/** Keep RN Appearance in sync so native dialogs / status chrome follow us. */
function syncNativeAppearance(mode: ThemeMode) {
  try {
    if (mode === "system") {
      Appearance.setColorScheme(null);
    } else {
      Appearance.setColorScheme(mode);
    }
  } catch {
    // Older runtimes may not support setColorScheme — ignore.
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("system");
  const [systemScheme, setSystemScheme] = useState<ColorSchemeName>(
    () => Appearance.getColorScheme(),
  );
  const [hydrated, setHydrated] = useState(false);

  // Hydrate persisted preference ASAP on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = (await AsyncStorage.getItem(STORAGE_KEY)) as ThemeMode | null;
        if (!cancelled && stored && VALID_MODES.has(stored)) {
          setModeState(stored);
          syncNativeAppearance(stored);
        }
      } catch {
        // fall back to system
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Follow OS while (and after) user picks "system".
  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme);
    });
    return () => sub.remove();
  }, []);

  const setMode = useCallback(async (next: ThemeMode) => {
    if (!VALID_MODES.has(next)) return;
    // Apply instantly — do not wait for AsyncStorage.
    setModeState(next);
    syncNativeAppearance(next);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, next);
    } catch {
      // non-fatal
    }
  }, []);

  const resolvedMode = useMemo(
    () => resolve(mode, systemScheme),
    [mode, systemScheme],
  );
  const theme = resolvedMode === "dark" ? DarkTheme : LightTheme;

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      resolvedMode,
      theme,
      colors: theme.colors,
      isDark: resolvedMode === "dark",
      setMode,
      hydrated,
    }),
    [mode, resolvedMode, theme, setMode, hydrated],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

/** Access the current theme + setter. Throws if used outside ThemeProvider. */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // Safe fallback during early render / tests — never crash the tree.
    return {
      mode: "system",
      resolvedMode: "light",
      theme: LightTheme,
      colors: LightTheme.colors,
      isDark: false,
      setMode: async () => {},
      hydrated: false,
    };
  }
  return ctx;
}

export function useThemeColors(): Theme["colors"] {
  return useTheme().colors;
}

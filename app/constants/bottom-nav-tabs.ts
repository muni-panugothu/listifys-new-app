import type { ComponentProps } from "react";
import { MaterialIcons } from "@expo/vector-icons";

/** Tabs shown in the floating pill. `sell` / `profile` remain for legacy screen active states. */
export type BottomNavTabId = "home" | "hotlists" | "search" | "sell" | "profile";

export type BottomNavTab = {
  id: BottomNavTabId;
  label: string;
  icon: ComponentProps<typeof MaterialIcons>["name"];
  activeIcon?: ComponentProps<typeof MaterialIcons>["name"];
};

/** District-style Home / Hotlists / Search floating tabs. */
export const BOTTOM_NAV_TABS: BottomNavTab[] = [
  { id: "home", label: "Home", icon: "home", activeIcon: "home" },
  {
    id: "hotlists",
    label: "Hotlists",
    icon: "bookmark-border",
    activeIcon: "bookmark",
  },
  { id: "search", label: "Search", icon: "search", activeIcon: "search" },
];

/** Approximate vertical space reserved above screen bottom (pill + margin, excluding safe area). */
export const FLOATING_BOTTOM_NAV_OFFSET = 76;

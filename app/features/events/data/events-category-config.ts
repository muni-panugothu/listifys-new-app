import type { ImageSourcePropType } from "react-native";

import { EVENTS_EXPLORE_CATEGORIES } from "@/features/events/data/events-discovery";

export type CategorySubTab = {
  id: string;
  label: string;
  /** Client-side keyword filter on title/description/features */
  keyword?: string;
};

export type CategoryDateFilterId = "all" | "today" | "tomorrow" | "weekend";

export type CategorySortId = "newest" | "date" | "nearby";

export type EventsCategoryConfig = {
  id: string;
  label: string;
  icon: ImageSourcePropType;
  /** Backend Events subcategory enum value */
  apiSubcategory: string;
  heroGradient: [string, string, string];
  /** Light-mode hero gradient (category tint preserved) */
  heroGradientLight?: [string, string, string];
  accentColor: string;
  subTabs: CategorySubTab[];
};

const DEFAULT_SUB_TABS: CategorySubTab[] = [{ id: "all", label: "All" }];

/** Maps Explore Events tile id → full category page configuration. */
export const EVENTS_CATEGORY_CONFIG: Record<string, EventsCategoryConfig> = {
  music: {
    id: "music",
    label: "Music",
    icon: require("@/assets/events/events-icon-music.png"),
    apiSubcategory: "Music",
    heroGradient: ["#1E3A5F", "#0F172A", "#000000"],
    heroGradientLight: ["#E8EEF8", "#F0F4FA", "#F6F7F8"],
    accentColor: "#818CF8",
    subTabs: [
      { id: "all", label: "All" },
      { id: "concerts", label: "Concerts", keyword: "concert" },
      { id: "live", label: "Live Music", keyword: "live" },
      { id: "dj", label: "DJ Nights", keyword: "dj" },
      { id: "classical", label: "Classical", keyword: "classical" },
    ],
  },
  comedy: {
    id: "comedy",
    label: "Comedy",
    icon: require("@/assets/events/events-icon-comedy.png"),
    apiSubcategory: "Comedy",
    heroGradient: ["#3D3428", "#1A1612", "#000000"],
    heroGradientLight: ["#F5F0E8", "#FAF7F2", "#F6F7F8"],
    accentColor: "#C084FC",
    subTabs: [
      { id: "all", label: "All" },
      { id: "standups", label: "Standups", keyword: "stand" },
      { id: "improv", label: "Improv", keyword: "improv" },
      { id: "roasts", label: "Roasts", keyword: "roast" },
      { id: "open-mics", label: "Open Mics", keyword: "open mic" },
    ],
  },
  performances: {
    id: "performances",
    label: "Performances",
    icon: require("@/assets/events/events-icon-performances.png"),
    apiSubcategory: "Theater",
    heroGradient: ["#4A2C2A", "#1A1210", "#000000"],
    heroGradientLight: ["#F8EEEC", "#FAF5F4", "#F6F7F8"],
    accentColor: "#FB923C",
    subTabs: [
      { id: "all", label: "All" },
      { id: "theater", label: "Theater", keyword: "theater" },
      { id: "dance", label: "Dance", keyword: "dance" },
      { id: "drama", label: "Drama", keyword: "drama" },
    ],
  },
  festivals: {
    id: "festivals",
    label: "Fests & Events",
    icon: require("@/assets/events/events-icon-fests.png"),
    apiSubcategory: "Community",
    heroGradient: ["#4A1942", "#1A0A18", "#000000"],
    heroGradientLight: ["#F8ECF4", "#FAF2F8", "#F6F7F8"],
    accentColor: "#F472B6",
    subTabs: [
      { id: "all", label: "All" },
      { id: "festivals", label: "Festivals", keyword: "fest" },
      { id: "community", label: "Community", keyword: "community" },
    ],
  },
  nightlife: {
    id: "nightlife",
    label: "Nightlife",
    icon: require("@/assets/events/events-icon-nightlife.png"),
    apiSubcategory: "Music",
    heroGradient: ["#3B2F5C", "#151020", "#000000"],
    heroGradientLight: ["#EEEAF8", "#F4F0FA", "#F6F7F8"],
    accentColor: "#E879F9",
    subTabs: [
      { id: "all", label: "All" },
      { id: "clubs", label: "Clubs", keyword: "club" },
      { id: "dj", label: "DJ Nights", keyword: "dj" },
      { id: "parties", label: "Parties", keyword: "party" },
    ],
  },
  sports: {
    id: "sports",
    label: "Sports",
    icon: require("@/assets/events/events-icon-sports.png"),
    apiSubcategory: "Sports",
    heroGradient: ["#1E3A2F", "#0A1A14", "#000000"],
    heroGradientLight: ["#E8F5F0", "#F0FAF6", "#F6F7F8"],
    accentColor: "#34D399",
    subTabs: [
      { id: "all", label: "All" },
      { id: "matches", label: "Matches", keyword: "match" },
      { id: "tournaments", label: "Tournaments", keyword: "tournament" },
      { id: "fitness", label: "Fitness", keyword: "fitness" },
    ],
  },
  food: {
    id: "food",
    label: "Food & Drinks",
    icon: require("@/assets/events/events-icon-food.png"),
    apiSubcategory: "Food & Drink",
    heroGradient: ["#4A3020", "#1A1008", "#000000"],
    heroGradientLight: ["#F8F0EA", "#FAF6F2", "#F6F7F8"],
    accentColor: "#FB923C",
    subTabs: [
      { id: "all", label: "All" },
      { id: "food", label: "Food", keyword: "food" },
      { id: "drinks", label: "Drinks", keyword: "drink" },
      { id: "tasting", label: "Tastings", keyword: "tasting" },
    ],
  },
  social: {
    id: "social",
    label: "Social",
    icon: require("@/assets/events/events-icon-social.png"),
    apiSubcategory: "Community",
    heroGradient: ["#3D2E4A", "#140F1A", "#000000"],
    heroGradientLight: ["#F0ECF5", "#F6F2FA", "#F6F7F8"],
    accentColor: "#F472B6",
    subTabs: [
      { id: "all", label: "All" },
      { id: "mixers", label: "Mixers", keyword: "mixer" },
      { id: "networking", label: "Networking", keyword: "network" },
      { id: "meetups", label: "Meetups", keyword: "meetup" },
    ],
  },
};

export function resolveCategoryConfig(
  categoryId: string,
  categoryLabel?: string,
): EventsCategoryConfig {
  const id = categoryId.toLowerCase().trim();
  const existing = EVENTS_CATEGORY_CONFIG[id];
  if (existing) return existing;

  const explore = EVENTS_EXPLORE_CATEGORIES.find((c) => c.id === id);
  if (explore) {
    return {
      id: explore.id,
      label: categoryLabel?.trim() || explore.label,
      icon: explore.icon,
      apiSubcategory: explore.subcategory ?? explore.label,
      heroGradient: ["#2C2C30", "#141416", "#000000"],
      accentColor: "#C084FC",
      subTabs: DEFAULT_SUB_TABS,
    };
  }

  return {
    id: id || "events",
    label: categoryLabel?.trim() || "Events",
    icon: require("@/assets/events/events-icon-fests.png"),
    apiSubcategory: categoryLabel?.trim() || "Other",
    heroGradient: ["#2C2C30", "#141416", "#000000"] as [string, string, string],
    accentColor: "#C084FC",
    subTabs: DEFAULT_SUB_TABS,
  };
}

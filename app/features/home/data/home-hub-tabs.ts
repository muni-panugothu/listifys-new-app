import type { ImageSourcePropType } from "react-native";

import type { CategorySlug } from "@/constants/categories";
import { getCategoryHref } from "@/lib/navigate-to-category";
import type { Href } from "@/lib/safe-router";

/** Hub switcher tab ids — core destinations + featured marketplace categories. */
export type MarketplaceHubTabId =
  | "home"
  | "sell"
  | CategorySlug;

export type MarketplaceHubTab = {
  id: MarketplaceHubTabId;
  label: string;
  icon: ImageSourcePropType;
  href?: Href;
};

/**
 * District-style hub grid: Home, Sell, Events, and top marketplace categories.
 * Replaces generic lifestyle tabs (Movies, Stores, Activities, Play).
 */
export const MARKETPLACE_HUB_TABS: MarketplaceHubTab[] = [
  {
    id: "home",
    label: "Home",
    icon: require("@/assets/events/hub/hub-icon-home.png"),
  },
  {
    id: "sell",
    label: "Sell",
    icon: require("@/assets/events/hub/hub-icon-stores.png"),
  },
  {
    id: "events",
    label: "Events",
    icon: require("@/assets/home/explore/categories/cat-events.png"),
    href: getCategoryHref("events"),
  },
  {
    id: "jobs",
    label: "Jobs",
    icon: require("@/assets/home/explore/categories/cat-jobs.png"),
    href: getCategoryHref("jobs"),
  },
  {
    id: "services",
    label: "Services",
    icon: require("@/assets/home/explore/categories/cat-services.png"),
    href: getCategoryHref("services"),
  },
  {
    id: "properties",
    label: "Properties",
    icon: require("@/assets/home/explore/categories/cat-properties.png"),
    href: getCategoryHref("properties"),
  },
  {
    id: "mobiles",
    label: "Mobiles",
    icon: require("@/assets/home/explore/categories/cat-mobiles.png"),
    href: getCategoryHref("mobiles"),
  },
  {
    id: "electronics",
    label: "Electronics",
    icon: require("@/assets/home/explore/categories/cat-electronics.png"),
    href: getCategoryHref("electronics"),
  },
  {
    id: "vehicles",
    label: "Vehicles",
    icon: require("@/assets/home/explore/categories/cat-vehicles.png"),
    href: getCategoryHref("vehicles"),
  },
  {
    id: "fashion",
    label: "Fashion",
    icon: require("@/assets/home/explore/categories/cat-fashion.png"),
    href: getCategoryHref("fashion"),
  },
  {
    id: "furniture",
    label: "Furniture",
    icon: require("@/assets/home/explore/categories/cat-furniture.png"),
    href: getCategoryHref("furniture"),
  },
  {
    id: "sports",
    label: "Sports",
    icon: require("@/assets/home/explore/categories/cat-sports.png"),
    href: getCategoryHref("sports"),
  },
];

/** @deprecated Use MarketplaceHubTabId */
export type EventsHubTabId = MarketplaceHubTabId;

/** @deprecated Use MarketplaceHubTab */
export type EventsHubTab = MarketplaceHubTab;

/** @deprecated Use MARKETPLACE_HUB_TABS */
export const EVENTS_HUB_TABS = MARKETPLACE_HUB_TABS;

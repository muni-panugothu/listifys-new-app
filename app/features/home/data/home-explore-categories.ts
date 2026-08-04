import type { ImageSourcePropType } from "react-native";

import type { CategorySlug } from "@/constants/categories";
import { getCategoryHref } from "@/lib/navigate-to-category";
import type { Href } from "@/lib/safe-router";

export type HomeExploreCategory = {
  id: CategorySlug;
  label: string;
  icon: ImageSourcePropType;
  gradient: [string, string, string];
  glow: string;
  href: Href;
};

type ExploreDef = {
  id: CategorySlug;
  label: string;
  icon: ImageSourcePropType;
  gradient: [string, string, string];
  glow: string;
};

/** All marketplace categories with District-style 3D pop-out icons. */
const EXPLORE_DEFS: ExploreDef[] = [
  {
    id: "electronics",
    label: "Electronics",
    icon: require("@/assets/home/explore/categories/cat-electronics.png"),
    gradient: ["#DCEEFF", "#F0F7FF", "#FFFFFF"],
    glow: "rgba(59, 130, 246, 0.25)",
  },
  {
    id: "vehicles",
    label: "Vehicles",
    icon: require("@/assets/home/explore/categories/cat-vehicles.png"),
    gradient: ["#D8E4FC", "#F0F4FF", "#FFFFFF"],
    glow: "rgba(75, 108, 183, 0.25)",
  },
  {
    id: "mobiles",
    label: "Mobiles",
    icon: require("@/assets/home/explore/categories/cat-mobiles.png"),
    gradient: ["#D4F0FF", "#F0FAFF", "#FFFFFF"],
    glow: "rgba(14, 165, 233, 0.25)",
  },
  {
    id: "furniture",
    label: "Furniture",
    icon: require("@/assets/home/explore/categories/cat-furniture.png"),
    gradient: ["#F5E6D3", "#FFF8F0", "#FFFFFF"],
    glow: "rgba(180, 120, 60, 0.22)",
  },
  {
    id: "fashion",
    label: "Fashion",
    icon: require("@/assets/home/explore/categories/cat-fashion.png"),
    gradient: ["#FCE4F0", "#FFF5FA", "#FFFFFF"],
    glow: "rgba(236, 72, 153, 0.22)",
  },
  {
    id: "jobs",
    label: "Jobs",
    icon: require("@/assets/home/explore/categories/cat-jobs.png"),
    gradient: ["#E8E0FF", "#F6F3FF", "#FFFFFF"],
    glow: "rgba(124, 58, 237, 0.22)",
  },
  {
    id: "takecare",
    label: "Take Care",
    icon: require("@/assets/home/explore/categories/cat-takecare.png"),
    gradient: ["#FFE0E8", "#FFF5F7", "#FFFFFF"],
    glow: "rgba(244, 63, 94, 0.22)",
  },
  {
    id: "events",
    label: "Events",
    icon: require("@/assets/home/explore/categories/cat-events.png"),
    gradient: ["#FFF3C4", "#FFFBEB", "#FFFFFF"],
    glow: "rgba(234, 179, 8, 0.25)",
  },
  {
    id: "services",
    label: "Services",
    icon: require("@/assets/home/explore/categories/cat-services.png"),
    gradient: ["#D8F5F0", "#F0FCFA", "#FFFFFF"],
    glow: "rgba(20, 184, 166, 0.22)",
  },
  {
    id: "properties",
    label: "Properties",
    icon: require("@/assets/home/explore/categories/cat-properties.png"),
    gradient: ["#E0F0E8", "#F4FBF7", "#FFFFFF"],
    glow: "rgba(34, 197, 94, 0.2)",
  },
  {
    id: "sports",
    label: "Sports",
    icon: require("@/assets/home/explore/categories/cat-sports.png"),
    gradient: ["#DCFCE7", "#F3FDF6", "#FFFFFF"],
    glow: "rgba(34, 197, 94, 0.22)",
  },
  {
    id: "collectibles",
    label: "Collectibles",
    icon: require("@/assets/home/explore/categories/cat-collectibles.png"),
    gradient: ["#FFE8CC", "#FFF7ED", "#FFFFFF"],
    glow: "rgba(249, 115, 22, 0.22)",
  },
  {
    id: "pets supplies",
    label: "Pets Supplies",
    icon: require("@/assets/home/explore/categories/cat-pets.png"),
    gradient: ["#E4F5D8", "#F6FCF0", "#FFFFFF"],
    glow: "rgba(132, 204, 22, 0.22)",
  },
  {
    id: "books",
    label: "Books",
    icon: require("@/assets/home/explore/categories/cat-books.png"),
    gradient: ["#E0E8F5", "#F4F7FC", "#FFFFFF"],
    glow: "rgba(100, 116, 139, 0.22)",
  },
  {
    id: "beauty",
    label: "Beauty",
    icon: require("@/assets/home/explore/categories/cat-beauty.png"),
    gradient: ["#FCE4EC", "#FFF5F8", "#FFFFFF"],
    glow: "rgba(244, 114, 182, 0.22)",
  },
  {
    id: "toys",
    label: "Toys",
    icon: require("@/assets/home/explore/categories/cat-toys.png"),
    gradient: ["#FFE4D6", "#FFF7F2", "#FFFFFF"],
    glow: "rgba(251, 146, 60, 0.22)",
  },
  {
    id: "others",
    label: "Others",
    icon: require("@/assets/home/explore/categories/cat-others.png"),
    gradient: ["#FFF0D0", "#FFFCF4", "#FFFFFF"],
    glow: "rgba(202, 138, 4, 0.25)",
  },
];

export const HOME_EXPLORE_CATEGORIES: HomeExploreCategory[] = EXPLORE_DEFS.map(
  (item) => ({
    ...item,
    href: getCategoryHref(item.id),
  }),
);

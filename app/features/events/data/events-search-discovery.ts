import type { ImageSourcePropType } from "react-native";

export type EventsSearchCategory = {
  id: string;
  label: string;
  icon: ImageSourcePropType;
};

/** Cream-card Explore categories for Events Search hub. */
export const EVENTS_SEARCH_CATEGORIES: EventsSearchCategory[] = [
  {
    id: "music",
    label: "MUSIC",
    icon: require("@/assets/events/search/search-icon-music.png"),
  },
  {
    id: "comedy",
    label: "COMEDY",
    icon: require("@/assets/events/search/search-icon-comedy.png"),
  },
  {
    id: "performances",
    label: "PERFORMANCES",
    icon: require("@/assets/events/search/search-icon-performances.png"),
  },
  {
    id: "festivals",
    label: "FESTIVALS",
    icon: require("@/assets/events/search/search-icon-festivals.png"),
  },
  {
    id: "nightlife",
    label: "NIGHTLIFE",
    icon: require("@/assets/events/search/search-icon-nightlife.png"),
  },
  {
    id: "sports",
    label: "SPORTS",
    icon: require("@/assets/events/search/search-icon-sports.png"),
  },
  {
    id: "food",
    label: "FOOD & DRINKS",
    icon: require("@/assets/events/search/search-icon-food.png"),
  },
  {
    id: "social",
    label: "SOCIAL MIXERS",
    icon: require("@/assets/events/search/search-icon-social.png"),
  },
];

export type EventsSearchArtist = {
  id: string;
  name: string;
  avatar: string;
};

export const EVENTS_SEARCH_ARTISTS: EventsSearchArtist[] = [
  {
    id: "a1",
    name: "Papon",
    avatar:
      "https://images.unsplash.com/photo-1516307365426-bea591f05011?auto=format&fit=crop&w=400&q=80",
  },
  {
    id: "a2",
    name: "Nanku",
    avatar:
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80",
  },
  {
    id: "a3",
    name: "Abi Sampa",
    avatar:
      "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=400&q=80",
  },
  {
    id: "a4",
    name: "Prateek",
    avatar:
      "https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&w=400&q=80",
  },
  {
    id: "a5",
    name: "Arijit",
    avatar:
      "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=400&q=80",
  },
];

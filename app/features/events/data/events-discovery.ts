/**
 * Static discovery content for the Events hub UI.
 * Category chips map onto existing Events API subcategories where possible.
 */

import type { ImageSourcePropType } from "react-native";

import type { MaterialIcons } from "@expo/vector-icons";

export type EventsHeroSlide = {
  id: string;
  image: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
  gradient: [string, string, string];
};

export const EVENTS_HERO_SLIDES: EventsHeroSlide[] = [
  {
    id: "hero-1",
    image:
      "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=1200&q=80",
    eyebrow: "Friendship",
    title: "MAXXING",
    subtitle: "Eat, laugh, party together",
    ctaLabel: "Explore now",
    gradient: ["#5B21B6", "#1E3A8A", "#0F172A"],
  },
  {
    id: "hero-2",
    image:
      "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1200&q=80",
    eyebrow: "Live Music",
    title: "WEEKEND",
    subtitle: "Discover concerts near you",
    ctaLabel: "Explore now",
    gradient: ["#7C3AED", "#312E81", "#0F172A"],
  },
  {
    id: "hero-3",
    image:
      "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1200&q=80",
    eyebrow: "Nightlife",
    title: "AFTER DARK",
    subtitle: "Clubs, DJs & late nights",
    ctaLabel: "Explore now",
    gradient: ["#DB2777", "#4C1D95", "#0F172A"],
  },
];

export type EventsWeekCategory = {
  id: string;
  label: string;
  image: string;
  /** Maps to API subcategory filter; undefined = All */
  subcategory?: string;
};

/** Circular "What's happening this week" categories. */
export const EVENTS_WEEK_CATEGORIES: EventsWeekCategory[] = [
  {
    id: "nightlife",
    label: "Nightlife",
    image:
      "https://images.unsplash.com/photo-1571266028241-5633c1288bd0?auto=format&fit=crop&w=400&q=80",
    subcategory: "Music",
  },
  {
    id: "music",
    label: "Music",
    image:
      "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=400&q=80",
    subcategory: "Music",
  },
  {
    id: "social",
    label: "Social Mixers",
    image:
      "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=400&q=80",
    subcategory: "Community",
  },
  {
    id: "food",
    label: "Food & Drinks",
    image:
      "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=400&q=80",
    subcategory: "Food & Drink",
  },
  {
    id: "comedy",
    label: "Comedy",
    image:
      "https://images.unsplash.com/photo-1527224857830-43a7acc85260?auto=format&fit=crop&w=400&q=80",
    subcategory: "Comedy",
  },
  {
    id: "sports",
    label: "Sports",
    image:
      "https://images.unsplash.com/photo-1461896836934-ffe607ba6851?auto=format&fit=crop&w=400&q=80",
    subcategory: "Sports",
  },
  {
    id: "workshops",
    label: "Workshops",
    image:
      "https://images.unsplash.com/photo-1524178232363-1fb2b075b655?auto=format&fit=crop&w=400&q=80",
    subcategory: "Education",
  },
  {
    id: "family",
    label: "Family Events",
    image:
      "https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?auto=format&fit=crop&w=400&q=80",
    subcategory: "Community",
  },
];

export type EventsExploreCategory = {
  id: string;
  label: string;
  icon: ImageSourcePropType;
  /** Soft glow tint behind the icon */
  glow: string;
  /** Maps to API subcategory filter; undefined = All */
  subcategory?: string;
};

/** Explore events — District-style 3D category cards. */
export const EVENTS_EXPLORE_CATEGORIES: EventsExploreCategory[] = [
  {
    id: "music",
    label: "Music",
    icon: require("@/assets/events/events-icon-music.png"),
    glow: "rgba(59,130,246,0.55)",
    subcategory: "Music",
  },
  {
    id: "comedy",
    label: "Comedy",
    icon: require("@/assets/events/events-icon-comedy.png"),
    glow: "rgba(234,179,8,0.5)",
    subcategory: "Comedy",
  },
  {
    id: "performances",
    label: "Performances",
    icon: require("@/assets/events/events-icon-performances.png"),
    glow: "rgba(249,115,22,0.5)",
    subcategory: "Theater",
  },
  {
    id: "festivals",
    label: "Fests & Events",
    icon: require("@/assets/events/events-icon-fests.png"),
    glow: "rgba(236,72,153,0.5)",
    subcategory: "Community",
  },
  {
    id: "nightlife",
    label: "Nightlife",
    icon: require("@/assets/events/events-icon-nightlife.png"),
    glow: "rgba(234,179,8,0.55)",
    subcategory: "Music",
  },
  {
    id: "sports",
    label: "Sports",
    icon: require("@/assets/events/events-icon-sports.png"),
    glow: "rgba(234,179,8,0.5)",
    subcategory: "Sports",
  },
  {
    id: "food",
    label: "Food & Drinks",
    icon: require("@/assets/events/events-icon-food.png"),
    glow: "rgba(249,115,22,0.5)",
    subcategory: "Food & Drink",
  },
  {
    id: "social",
    label: "Social",
    icon: require("@/assets/events/events-icon-social.png"),
    glow: "rgba(249,115,22,0.45)",
    subcategory: "Community",
  },
];

export type EventsArtistItem = {
  id: string;
  name: string;
  profession: string;
  avatar: string;
  stats: Array<{
    icon: keyof typeof MaterialIcons.glyphMap;
    value: string;
  }>;
  eventDate: string;
};

export const EVENTS_ARTISTS_DUMMY: EventsArtistItem[] = [
  {
    id: "artist-1",
    name: "Papon",
    profession: "Singer",
    avatar:
      "https://images.unsplash.com/photo-1516307365426-bea591f05011?auto=format&fit=crop&w=400&q=80",
    stats: [
      { icon: "music-note", value: "7.6M" },
      { icon: "photo-camera", value: "1.2M" },
      { icon: "play-circle-outline", value: "1.5M" },
    ],
    eventDate: "Sat, 28 Nov, 7:00 PM",
  },
  {
    id: "artist-2",
    name: "Nanku",
    profession: "Rapper",
    avatar:
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80",
    stats: [
      { icon: "music-note", value: "2.1M" },
      { icon: "photo-camera", value: "890K" },
      { icon: "play-circle-outline", value: "1.1M" },
    ],
    eventDate: "Fri, 12 Dec, 8:00 PM",
  },
  {
    id: "artist-3",
    name: "Abi Sampa",
    profession: "Multi-instrumentalist",
    avatar:
      "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=400&q=80",
    stats: [
      { icon: "music-note", value: "5.2M" },
      { icon: "photo-camera", value: "980K" },
      { icon: "play-circle-outline", value: "1.1M" },
    ],
    eventDate: "Sun, 20 Sep, 7:30 PM",
  },
  {
    id: "artist-4",
    name: "Prateek Kuhad",
    profession: "Indie Artist",
    avatar:
      "https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&w=400&q=80",
    stats: [
      { icon: "music-note", value: "3.1M" },
      { icon: "photo-camera", value: "540K" },
      { icon: "play-circle-outline", value: "820K" },
    ],
    eventDate: "Sun, 16 Nov, 6:30 PM",
  },
  {
    id: "artist-5",
    name: "Arijit Singh",
    profession: "Playback Singer",
    avatar:
      "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=400&q=80",
    stats: [
      { icon: "music-note", value: "22M" },
      { icon: "photo-camera", value: "3.4M" },
      { icon: "play-circle-outline", value: "5.8M" },
    ],
    eventDate: "Fri, 12 Dec, 8:00 PM",
  },
];

export type FeaturedEventDummy = {
  id: string;
  title: string;
  image: string;
  venue: string;
  eventDate: string;
  eventTime: string;
  offerLabel?: string;
  price: number;
  category: string;
};

/** Static events for discovery carousels (UI placeholder). */
export const FEATURED_EVENTS_DUMMY: FeaturedEventDummy[] = [
  {
    id: "feat-1",
    title: "90s Nostalgia Night ft DJ John | Retro Party",
    image:
      "https://images.unsplash.com/photo-1571266028241-5633c1288bd0?auto=format&fit=crop&w=800&q=80",
    venue: "Underdoggs | Hitech City, Hyderabad",
    eventDate: "Fri, 31 Jul",
    eventTime: "8:00 PM",
    offerLabel: "15% OFF up to ₹800",
    price: 999,
    category: "nightlife",
  },
  {
    id: "feat-2",
    title: "Jamming Night - Hyderabad Live Session",
    image:
      "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=800&q=80",
    venue: "Mindspace Social | Hitec City",
    eventDate: "Sat, 01 Aug",
    eventTime: "7:30 PM",
    offerLabel: "FREE Entry",
    price: 0,
    category: "music",
  },
  {
    id: "feat-3",
    title: "Bollywood Retro Night | Dance Floor Special",
    image:
      "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=800&q=80",
    venue: "Prism | Jubilee Hills",
    eventDate: "Sat, 01 Aug",
    eventTime: "9:00 PM",
    offerLabel: "20% OFF up to ₹500",
    price: 799,
    category: "nightlife",
  },
  {
    id: "feat-4",
    title: "Masoom Vichar",
    image:
      "https://images.unsplash.com/photo-1527224857830-43a7acc85260?auto=format&fit=crop&w=800&q=80",
    venue: "The comedy Theatre - Hyderabad",
    eventDate: "Sun, 09 Aug, Multiple slots",
    eventTime: "",
    price: 499,
    category: "comedy",
  },
  {
    id: "feat-4b",
    title: "Aakash Mehta LIVE",
    image:
      "https://images.unsplash.com/photo-1516280440614-6697288d5d38?auto=format&fit=crop&w=800&q=80",
    venue: "Heart Cup Coffee - Kondapur",
    eventDate: "Every Sun & Sat, 7:00 PM onwards",
    eventTime: "",
    price: 599,
    category: "comedy",
  },
  {
    id: "feat-4c",
    title: "Weekend Laugh Riot",
    image:
      "https://images.unsplash.com/photo-1585699324551-f6c309eedeca?auto=format&fit=crop&w=800&q=80",
    venue: "Hard Rock Cafe | Hitec City",
    eventDate: "Sat, 16 Aug, 8:00 PM",
    eventTime: "",
    price: 449,
    category: "comedy",
  },
  {
    id: "feat-5",
    title: "Sunset Acoustic Sessions | Open Mic",
    image:
      "https://images.unsplash.com/photo-1493676304819-0d7a8d026dcf?auto=format&fit=crop&w=800&q=80",
    venue: "Phoenix Arena | Madhapur",
    eventDate: "Sun, 02 Aug",
    eventTime: "5:30 PM",
    offerLabel: "FREE Entry",
    price: 0,
    category: "music",
  },
  {
    id: "feat-6",
    title: "Electronic Beats Weekend | DJ Showcase",
    image:
      "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=800&q=80",
    venue: "Amphitheatre | Gachibowli",
    eventDate: "Fri, 07 Aug",
    eventTime: "10:00 PM",
    offerLabel: "10% OFF up to ₹300",
    price: 1299,
    category: "nightlife",
  },
  {
    id: "feat-7",
    title: "Open Mic Night",
    image:
      "https://images.unsplash.com/photo-1485846234645-a62644f84728?auto=format&fit=crop&w=800&q=80",
    venue: "Comedy Store | Banjara Hills",
    eventDate: "Fri, 22 Aug, 7:30 PM",
    eventTime: "",
    price: 299,
    category: "comedy",
  },
  {
    id: "feat-8",
    title: "Hyderabad Food Fest | Street & Gourmet",
    image:
      "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=800&q=80",
    venue: "Hitex Exhibition Center",
    eventDate: "Sat, 16 Aug",
    eventTime: "12:00 PM",
    offerLabel: "Early Bird",
    price: 299,
    category: "food",
  },
  {
    id: "feat-9",
    title: "Craft Cocktail Masterclass",
    image:
      "https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?auto=format&fit=crop&w=800&q=80",
    venue: "The Moonshine Project",
    eventDate: "Sun, 17 Aug",
    eventTime: "5:00 PM",
    price: 1499,
    category: "food",
  },
  {
    id: "feat-10",
    title: "Pottery & Paint Workshop",
    image:
      "https://images.unsplash.com/photo-1452860606245-08befc0ff44b?auto=format&fit=crop&w=800&q=80",
    venue: "Art Garage | Jubilee Hills",
    eventDate: "Sat, 23 Aug",
    eventTime: "11:00 AM",
    offerLabel: "Materials included",
    price: 899,
    category: "workshops",
  },
  {
    id: "feat-11",
    title: "Indie Music Festival Weekend",
    image:
      "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?auto=format&fit=crop&w=800&q=80",
    venue: "Gachibowli Stadium Lawn",
    eventDate: "Fri, 29 Aug",
    eventTime: "4:00 PM",
    offerLabel: "Group Offer",
    price: 1999,
    category: "festivals",
  },
  {
    id: "feat-12",
    title: "Kids Carnival & Fun Fair",
    image:
      "https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?auto=format&fit=crop&w=800&q=80",
    venue: "Inorbit Mall | Madhapur",
    eventDate: "Sun, 31 Aug",
    eventTime: "10:00 AM",
    offerLabel: "Kids Free",
    price: 199,
    category: "family",
  },
  {
    id: "feat-13",
    title: "Hyderabad Premier League Finals",
    image:
      "https://images.unsplash.com/photo-1461896836934-ffe607ba6851?auto=format&fit=crop&w=800&q=80",
    venue: "Uppal Stadium",
    eventDate: "Sat, 06 Sep",
    eventTime: "6:30 PM",
    offerLabel: "10% OFF",
    price: 499,
    category: "sports",
  },
  {
    id: "feat-14",
    title: "Acoustic Unplugged ft Local Bands",
    image:
      "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=800&q=80",
    venue: "Heart Cup Coffee | Kondapur",
    eventDate: "Fri, 05 Sep",
    eventTime: "8:00 PM",
    offerLabel: "FREE Entry",
    price: 0,
    category: "music",
  },
];

export type EventsCategorySection = {
  id: string;
  title: string;
  categoryId: string;
};

/** Discovery carousels above the sticky All Events feed. */
export const EVENTS_CATEGORY_SECTIONS: EventsCategorySection[] = [
  { id: "sec-featured", title: "Featured events", categoryId: "featured" },
  { id: "sec-comedy", title: "Comedy events", categoryId: "comedy" },
];

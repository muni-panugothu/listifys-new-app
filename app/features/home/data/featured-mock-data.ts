/**
 * Static demo content for the "Artists in your District" and
 * "Explore Events near you" sections on the home feed.
 *
 * These are purely UI placeholders — no API, business logic, or state slice
 * changes have been made. Swap the arrays here when the real endpoints ship.
 */

import type { MaterialIcons } from "@expo/vector-icons";

export type FeaturedArtistItem = {
  id: string;
  name: string;
  subtitle: string;
  avatar: string;
  stats: Array<{
    icon: keyof typeof MaterialIcons.glyphMap;
    value: string;
  }>;
  eventDate: string;
};

export type ExploreNearYouItem = {
  id: string;
  image: string;
  location: string;
  title: string;
  dateTime: string;
};

export const FEATURED_ARTISTS: FeaturedArtistItem[] = [
  {
    id: "artist-1",
    name: "Papon",
    subtitle: "Singer",
    avatar:
      "https://images.unsplash.com/photo-1516307365426-bea591f05011?auto=format&fit=crop&w=400&q=80",
    stats: [
      { icon: "photo-camera", value: "1.2M" },
      { icon: "music-note", value: "7.6M" },
      { icon: "play-circle-outline", value: "1.5M" },
    ],
    eventDate: "Sat, 28 Nov, 7:00 PM",
  },
  {
    id: "artist-2",
    name: "Abi Sampa",
    subtitle: "Multi-instrumentalist",
    avatar:
      "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=400&q=80",
    stats: [
      { icon: "photo-camera", value: "980K" },
      { icon: "music-note", value: "5.2M" },
      { icon: "play-circle-outline", value: "1.1M" },
    ],
    eventDate: "Sun, 20 Sep, 7:30 PM",
  },
  {
    id: "artist-3",
    name: "Arijit Singh",
    subtitle: "Playback Singer",
    avatar:
      "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=400&q=80",
    stats: [
      { icon: "photo-camera", value: "3.4M" },
      { icon: "music-note", value: "22M" },
      { icon: "play-circle-outline", value: "5.8M" },
    ],
    eventDate: "Fri, 12 Dec, 8:00 PM",
  },
  {
    id: "artist-4",
    name: "Shreya Ghoshal",
    subtitle: "Singer / Composer",
    avatar:
      "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80",
    stats: [
      { icon: "photo-camera", value: "2.1M" },
      { icon: "music-note", value: "18M" },
      { icon: "play-circle-outline", value: "4.2M" },
    ],
    eventDate: "Sat, 04 Oct, 9:00 PM",
  },
  {
    id: "artist-5",
    name: "Prateek Kuhad",
    subtitle: "Indie Artist",
    avatar:
      "https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&w=400&q=80",
    stats: [
      { icon: "photo-camera", value: "540K" },
      { icon: "music-note", value: "3.1M" },
      { icon: "play-circle-outline", value: "820K" },
    ],
    eventDate: "Sun, 16 Nov, 6:30 PM",
  },
];

export const EXPLORE_NEAR_YOU: ExploreNearYouItem[] = [
  {
    id: "event-1",
    image:
      "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=800&q=80",
    location: "Mindspace Social | Hitec City",
    title: "Jamming Night - Hyderabad",
    dateTime: "Every Sat, 8:00 PM to 9:00 PM",
  },
  {
    id: "event-2",
    image:
      "https://images.unsplash.com/photo-1524368535928-5b5e00ddc76b?auto=format&fit=crop&w=800&q=80",
    location: "Hard Rock Cafe | Hitec City",
    title: "Avalon Live Karaoke",
    dateTime: "Fri, 21 Aug, 9:00 PM",
  },
  {
    id: "event-3",
    image:
      "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=800&q=80",
    location: "Amphitheatre | Gachibowli",
    title: "Friday Live Jam Session",
    dateTime: "Sun, 20 Sep, 7:00 PM",
  },
  {
    id: "event-4",
    image:
      "https://images.unsplash.com/photo-1493676304819-0d7a8d026dcf?auto=format&fit=crop&w=800&q=80",
    location: "Phoenix Arena | Madhapur",
    title: "Sunset Acoustic Sessions",
    dateTime: "Sat, 27 Sep, 6:30 PM",
  },
  {
    id: "event-5",
    image:
      "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?auto=format&fit=crop&w=800&q=80",
    location: "The Moonshine Project",
    title: "Bollywood Retro Night",
    dateTime: "Fri, 03 Oct, 9:30 PM",
  },
  {
    id: "event-6",
    image:
      "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=800&q=80",
    location: "Prism | Jubilee Hills",
    title: "Electronic Beats Weekend",
    dateTime: "Sat, 11 Oct, 10:00 PM",
  },
];

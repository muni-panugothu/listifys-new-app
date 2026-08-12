import type { FeaturedEventDummy } from "@/features/events/data/events-discovery";

export type EventsTripDummy = FeaturedEventDummy & {
  badge?: "International" | "Featured";
  city?: string;
};

/** Large "Your next event trip" posters. */
export const EVENTS_TRIP_DUMMY: EventsTripDummy[] = [
  {
    id: "trip-1",
    title: "OFFLIMITS MUSIC FESTIVAL",
    image:
      "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?auto=format&fit=crop&w=900&q=80",
    venue: "Bangkok, Thailand",
    eventDate: "Fri, 12 Sep",
    eventTime: "4:00 PM",
    price: 4999,
    category: "festivals",
    badge: "International",
    city: "Bangkok",
  },
  {
    id: "trip-2",
    title: "SHAKIRA WORLD TOUR",
    image:
      "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=900&q=80",
    venue: "Dubai, UAE",
    eventDate: "Sat, 20 Sep",
    eventTime: "8:00 PM",
    price: 7999,
    category: "music",
    badge: "International",
    city: "Dubai",
  },
  {
    id: "trip-3",
    title: "Sunburn Arena",
    image:
      "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=900&q=80",
    venue: "Hyderabad, India",
    eventDate: "Sat, 27 Sep",
    eventTime: "6:00 PM",
    price: 2499,
    category: "nightlife",
    badge: "Featured",
    city: "Hyderabad",
  },
];

/** Nearby / discovery strip cards matching District open-mic style. */
export const EVENTS_NEARBY_DUMMY: FeaturedEventDummy[] = [
  {
    id: "near-1",
    title: "Open Mic | Raw & Real",
    image:
      "https://images.unsplash.com/photo-1516280440614-6697288d5d38?auto=format&fit=crop&w=800&q=80",
    venue: "Zostel Hyderabad",
    eventDate: "Tonight, 8:00 PM",
    eventTime: "",
    price: 0,
    category: "music",
  },
  {
    id: "near-2",
    title: "Nishant Suri Live",
    image:
      "https://images.unsplash.com/photo-1527224857830-43a7acc85260?auto=format&fit=crop&w=800&q=80",
    venue: "The comedy Theatre",
    eventDate: "Sun, 06 Sep",
    eventTime: "7:00 PM",
    price: 499,
    category: "comedy",
  },
  {
    id: "near-3",
    title: "Acoustic Sundays",
    image:
      "https://images.unsplash.com/photo-1493676304819-0d7a8d026dcf?auto=format&fit=crop&w=800&q=80",
    venue: "Hard Rock Cafe",
    eventDate: "Sun, 07 Sep",
    eventTime: "6:30 PM",
    price: 299,
    category: "music",
  },
  {
    id: "near-4",
    title: "Weekend Laugh Riot",
    image:
      "https://images.unsplash.com/photo-1585699324551-f6c309eedeca?auto=format&fit=crop&w=800&q=80",
    venue: "Heart Cup Coffee",
    eventDate: "Sat, 13 Sep",
    eventTime: "8:00 PM",
    price: 449,
    category: "comedy",
  },
];

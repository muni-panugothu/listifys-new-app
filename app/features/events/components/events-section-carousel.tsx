import { memo, useCallback, useState } from "react";
import {
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  ScrollView,
  Text,
  View,
} from "react-native";

import { ListifyFonts } from "@/constants/typography";
import { FeaturedEventCard } from "@/features/events/components/featured-event-card";
import type { FeaturedEventDummy } from "@/features/events/data/events-discovery";
import type { ListingItem } from "@/features/listing/services/listing-api";
import { useTheme } from "@/providers/theme-provider";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const H_PAD = 16;
const CARD_WIDTH = SCREEN_WIDTH * 0.52;
const GAP = 12;

function toListingItem(item: FeaturedEventDummy): ListingItem {
  return {
    _id: item.id,
    title: item.title,
    images: item.image ? [item.image] : [],
    videos: item.videos,
    location: item.venue,
    price: item.price,
    currency: "INR",
    category: "events",
    eventDate: item.eventDate,
    eventTime: item.eventTime,
    venue: item.venue,
    featured: true,
  } as ListingItem;
}

export type EventsSectionCarouselProps = {
  title: string;
  events: FeaturedEventDummy[];
  savedIds: Set<string>;
  onToggleSave: (id: string) => void;
  onPressEvent?: (item: FeaturedEventDummy, index: number) => void;
  /** When false, hide offer badges (matches comedy/reference cards). */
  showOffers?: boolean;
};

function EventsSectionCarouselImpl({
  title,
  events,
  savedIds,
  onToggleSave,
  onPressEvent,
  showOffers = false,
}: EventsSectionCarouselProps) {
  const { colors } = useTheme();
  const [activeIndex, setActiveIndex] = useState(0);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetX = event.nativeEvent.contentOffset.x;
      const index = Math.round(offsetX / (CARD_WIDTH + GAP));
      setActiveIndex(Math.max(0, Math.min(index, events.length - 1)));
    },
    [events.length],
  );

  if (events.length === 0) return null;

  return (
    <View style={{ marginTop: 28 }}>
      <Text
        style={{
          fontFamily: ListifyFonts.bold,
          fontSize: 22,
          color: colors.textPrimary,
          paddingHorizontal: H_PAD,
          marginBottom: 14,
          ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
        }}
      >
        {title}
      </Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{
          paddingHorizontal: H_PAD,
          gap: GAP,
          paddingBottom: 4,
        }}
        decelerationRate="fast"
        snapToInterval={CARD_WIDTH + GAP}
        snapToAlignment="start"
      >
        {events.map((item, index) => (
          <FeaturedEventCard
            key={item.id}
            event={toListingItem(item)}
            cardWidth={CARD_WIDTH}
            isSaved={savedIds.has(item.id)}
            isMediaActive={index === activeIndex}
            offerLabel={showOffers ? item.offerLabel : null}
            onPress={() => onPressEvent?.(item, index)}
            onToggleSave={() => onToggleSave(item.id)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

export const EventsSectionCarousel = memo(EventsSectionCarouselImpl);

import { memo } from "react";
import { Dimensions, Platform, ScrollView, Text, View } from "react-native";

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
    images: [item.image],
    location: item.venue,
    price: item.price,
    currency: "INR",
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
  onPressEvent?: (item: FeaturedEventDummy) => void;
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
        contentContainerStyle={{
          paddingHorizontal: H_PAD,
          gap: GAP,
          paddingBottom: 4,
        }}
        decelerationRate="fast"
        snapToInterval={CARD_WIDTH + GAP}
        snapToAlignment="start"
      >
        {events.map((item) => (
          <FeaturedEventCard
            key={item.id}
            event={toListingItem(item)}
            cardWidth={CARD_WIDTH}
            isSaved={savedIds.has(item.id)}
            offerLabel={showOffers ? item.offerLabel : null}
            onPress={() => onPressEvent?.(item)}
            onToggleSave={() => onToggleSave(item.id)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

export const EventsSectionCarousel = memo(EventsSectionCarouselImpl);

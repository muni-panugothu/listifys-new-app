import { memo, useCallback, useMemo } from "react";
import {
  Dimensions,
  FlatList,
  Platform,
  Text,
  View,
  type ListRenderItem,
} from "react-native";

import { ListifyFonts } from "@/constants/typography";
import { FeaturedEventCard } from "@/features/events/components/featured-event-card";
import type { FeaturedEventDummy } from "@/features/events/data/events-discovery";
import type { ListingItem } from "@/features/listing/services/listing-api";
import { HORIZONTAL_CAROUSEL_PROPS } from "@/lib/performance/horizontal-list-config";
import { useTheme } from "@/providers/theme-provider";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const H_PAD = 16;
const CARD_WIDTH = SCREEN_WIDTH * 0.52;
const GAP = 12;
const SNAP_INTERVAL = CARD_WIDTH + GAP;

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
    eventFormat: item.eventFormat,
    eventDuration: item.eventDuration,
    subcategory: item.category === "comedy" ? "Comedy" : undefined,
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

  const listingMap = useMemo(() => {
    const map = new Map<string, ListingItem>();
    for (const item of events) {
      map.set(item.id, toListingItem(item));
    }
    return map;
  }, [events]);

  const renderItem: ListRenderItem<FeaturedEventDummy> = useCallback(
    ({ item, index }) => {
      const listing = listingMap.get(item.id);
      if (!listing) return null;
      return (
        <FeaturedEventCard
          event={listing}
          cardWidth={CARD_WIDTH}
          isSaved={savedIds.has(item.id)}
          offerLabel={showOffers ? item.offerLabel : null}
          onPress={() => onPressEvent?.(item, index)}
          onToggleSave={() => onToggleSave(item.id)}
        />
      );
    },
    [listingMap, onPressEvent, onToggleSave, savedIds, showOffers],
  );

  const keyExtractor = useCallback((item: FeaturedEventDummy) => item.id, []);

  const getItemLayout = useCallback(
    (_: ArrayLike<FeaturedEventDummy> | null | undefined, index: number) => ({
      length: SNAP_INTERVAL,
      offset: SNAP_INTERVAL * index,
      index,
    }),
    [],
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

      <FlatList
        horizontal
        data={events}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        showsHorizontalScrollIndicator={false}
        nestedScrollEnabled
        contentContainerStyle={{
          paddingHorizontal: H_PAD,
          paddingBottom: 4,
        }}
        ItemSeparatorComponent={() => <View style={{ width: GAP }} />}
        decelerationRate="fast"
        snapToInterval={SNAP_INTERVAL}
        snapToAlignment="start"
        getItemLayout={getItemLayout}
        {...HORIZONTAL_CAROUSEL_PROPS}
      />
    </View>
  );
}

export const EventsSectionCarousel = memo(EventsSectionCarouselImpl);

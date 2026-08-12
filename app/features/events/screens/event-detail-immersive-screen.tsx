import { useCallback, useMemo, useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useLocalSearchParams } from "@/lib/safe-router";

import { EventDetailPage } from "@/features/events/components/event-detail/event-detail-page";
import {
  parseEventIdsParam,
} from "@/features/events/utils/event-detail-helpers";
import { prefetchSimilarEvents } from "@/features/events/services/events-api";
import { useEventsTheme } from "@/features/events/theme/events-theme";
import { cacheKeys, getCachedStale } from "@/lib/cache";
import type { ListingItem } from "@/features/listing/services/listing-api";
import { useAppSelector } from "@/store/hooks";
import { selectIsoCountryCode, selectLocationCoords } from "@/store/slices/location-slice";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

function seedListingFromCache(id: string): ListingItem | undefined {
  const cached = getCachedStale<{ listing?: ListingItem }>(
    cacheKeys.listingDetail("events", id),
  );
  return cached?.data.listing;
}

export function EventDetailImmersiveScreen() {
  const params = useLocalSearchParams<{
    id?: string | string[];
    eventIds?: string | string[];
    index?: string | string[];
    category?: string | string[];
  }>();
  const et = useEventsTheme();
  const userCoords = useAppSelector(selectLocationCoords);
  const isoCountryCode = useAppSelector(selectIsoCountryCode);

  const initialId = Array.isArray(params.id) ? params.id[0] : params.id ?? "";
  const parsedIds = parseEventIdsParam(params.eventIds);
  const eventIds = useMemo(() => {
    if (parsedIds.length > 0) return parsedIds;
    return initialId ? [initialId] : [];
  }, [initialId, parsedIds]);

  const initialIndexRaw = Array.isArray(params.index) ? params.index[0] : params.index;
  const initialIndex = useMemo(() => {
    const parsed = Number(initialIndexRaw);
    if (Number.isFinite(parsed) && parsed >= 0 && parsed < eventIds.length) {
      return parsed;
    }
    const found = eventIds.indexOf(initialId);
    return found >= 0 ? found : 0;
  }, [eventIds, initialId, initialIndexRaw]);

  const listRef = useRef<FlatList<string>>(null);
  const [activeIndex, setActiveIndex] = useState(initialIndex);

  const onHorizontalScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
      if (idx === activeIndex) return;
      setActiveIndex(idx);

      const neighbors = [eventIds[idx - 1], eventIds[idx + 1]].filter(Boolean);
      for (const neighborId of neighbors) {
        const cached = seedListingFromCache(neighborId);
        if (!cached) continue;
        prefetchSimilarEvents(neighborId, {
          lat: userCoords?.lat ?? undefined,
          lng: userCoords?.lng ?? undefined,
          countryCode: isoCountryCode ?? undefined,
        });
      }
    },
    [activeIndex, eventIds, isoCountryCode, userCoords?.lat, userCoords?.lng],
  );

  const renderPage = useCallback(
    ({ item, index }: { item: string; index: number }) => (
      <EventDetailPage
        eventId={item}
        pageWidth={SCREEN_WIDTH}
        isActive={index === activeIndex}
      />
    ),
    [activeIndex],
  );

  if (eventIds.length === 0) {
    return <View style={{ flex: 1, backgroundColor: et.background }} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: et.detailHeroBg }}>
      <StatusBar style={et.colors.statusBarStyle} backgroundColor={et.background} />
      <FlatList
        ref={listRef}
        data={eventIds}
        keyExtractor={(id) => id}
        renderItem={renderPage}
        horizontal
        pagingEnabled
        bounces={eventIds.length > 1}
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={initialIndex > 0 ? initialIndex : undefined}
        getItemLayout={(_, index) => ({
          length: SCREEN_WIDTH,
          offset: SCREEN_WIDTH * index,
          index,
        })}
        decelerationRate="fast"
        directionalLockEnabled
        scrollEventThrottle={16}
        onMomentumScrollEnd={onHorizontalScrollEnd}
        windowSize={3}
        maxToRenderPerBatch={2}
        initialNumToRender={1}
        removeClippedSubviews
        extraData={activeIndex}
        style={{ backgroundColor: et.detailHeroBg }}
      />
    </View>
  );
}

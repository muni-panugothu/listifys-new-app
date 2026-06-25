import { MaterialIcons } from "@expo/vector-icons";
import { type Href, useRouter } from "@/lib/safe-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StatusBar,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { VoiceSearchModal } from "@/components/voice-search-modal";
import { EventListingCard } from "@/features/category/components/event-listing-card";
import { EventsCalendarModal } from "@/features/events/components/events-calendar-modal";
import { EventsDateStrip } from "@/features/events/components/events-date-strip";
import { useEventsFeed } from "@/features/events/hooks/use-events-feed";
import {
  toggleSaveListing,
  type ListingItem,
} from "@/features/listing/services/listing-api";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { useDynamicSubcategories } from "@/hooks/use-dynamic-subcategories";
import { dateKey } from "@/lib/event-dates";
import { getCurrencyCodeFromCountry, getCurrencySymbol } from "@/lib/currency";
import { ListifyFonts, ListifyTypography } from "@/constants/typography";
import { useLocale } from "@/providers/locale-provider";
import { useAppSelector } from "@/store/hooks";
import {
  selectIsoCountryCode,
  selectLocationCoords,
  selectLocationLabel,
} from "@/store/slices/location-slice";

const BG = "#F6F7F8";
const BRAND = "#27BB97";
const GRID_SIDE_PADDING = 16;

function formatEventPrice(
  price?: number,
  currency?: string,
  isoCountryCode?: string | null,
): string {
  if (!price || price === 0) return "FREE";
  const symbol = getCurrencySymbol(currency ?? getCurrencyCodeFromCountry(isoCountryCode));
  return `${symbol}${Number(price).toLocaleString("en-IN")}`;
}

export function EventsListingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isoCountryCode: localeCountryCode } = useLocale();
  const user = useAppSelector((s) => s.auth.user);
  const userCoords = useAppSelector(selectLocationCoords);
  const locationLabel = useAppSelector(selectLocationLabel);
  const rawCountryCode = useAppSelector(selectIsoCountryCode);
  const hasLocationCoords = userCoords.lat != null && userCoords.lng != null;
  const isoCountryCode = (rawCountryCode ?? localeCountryCode ?? null)?.toUpperCase() ?? null;
  const shouldApplyCountryFilter = hasLocationCoords || isoCountryCode === "US";

  const { subcategories } = useDynamicSubcategories("events");

  const [searchQuery, setSearchQuery] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [selectedSubcategory, setSelectedSubcategory] = useState("All");
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [voiceVisible, setVoiceVisible] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);

  const isRealLabel =
    hasLocationCoords &&
    Boolean(locationLabel) &&
    locationLabel !== "Set location" &&
    !locationLabel.startsWith("Detecting");
  const locationForApi = isRealLabel
    ? locationLabel
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean)
        .slice(0, 2)
        .join(", ") || undefined
    : undefined;

  const queryParams = useMemo(
    () => ({
      search: appliedSearch.trim() || undefined,
      subcategory: selectedSubcategory === "All" ? undefined : selectedSubcategory,
      location: locationForApi,
      lat: hasLocationCoords ? userCoords.lat! : undefined,
      lng: hasLocationCoords ? userCoords.lng! : undefined,
      radius: hasLocationCoords ? 500 : undefined,
      countryCode: shouldApplyCountryFilter ? isoCountryCode : undefined,
      sort: hasLocationCoords ? "nearest" : "newest",
      limit: 30,
    }),
    [
      appliedSearch,
      selectedSubcategory,
      locationForApi,
      hasLocationCoords,
      userCoords.lat,
      userCoords.lng,
      shouldApplyCountryFilter,
      isoCountryCode,
    ],
  );

  const {
    selectedDateKey,
    selectedDate,
    selectDate,
    calendar,
    feed,
    loadMore,
    refresh,
  } = useEventsFeed(queryParams);

  const headerHeight = insets.top + 12 + 52;
  const titleHeight = 64;
  const dateStripHeight = 96;
  const categoryTabsHeight = 52;
  const stickyOffset = headerHeight + titleHeight + dateStripHeight + categoryTabsHeight;

  const { refreshing, onRefresh } = usePullToRefresh(refresh);

  const handleToggleSave = useCallback(
    async (id: string) => {
      try {
        const res = await toggleSaveListing("events", id);
        setSavedIds((prev) => {
          const next = new Set(prev);
          if (res.saved) next.add(id);
          else next.delete(id);
          return next;
        });
      } catch {
        // ignore
      }
    },
    [],
  );

  const openDetail = useCallback(
    (item: ListingItem) => {
      router.push(`/event-detail?category=events&id=${item._id}` as Href);
    },
    [router],
  );

  const handleSubmitSearch = useCallback(() => {
    setAppliedSearch(searchQuery.trim());
  }, [searchQuery]);

  const handleVoiceResult = useCallback((text: string) => {
    setSearchQuery(text);
    setAppliedSearch(text);
  }, []);

  const handleCalendarSelect = useCallback(
    (date: Date) => {
      selectDate(dateKey(date));
    },
    [selectDate],
  );

  const renderItem = useCallback(
    ({ item }: { item: ListingItem }) => (
      <View style={{ paddingHorizontal: GRID_SIDE_PADDING, marginBottom: 16 }}>
        <EventListingCard
          event={item}
          priceLabel={formatEventPrice(item.price, item.currency, isoCountryCode)}
          isSaved={savedIds.has(item._id) || Boolean(user?.id && item.savedBy?.includes(user.id))}
          onPress={() => openDetail(item)}
          onToggleSave={() => handleToggleSave(item._id)}
        />
      </View>
    ),
    [handleToggleSave, isoCountryCode, openDetail, savedIds, user?.id],
  );

  const listHeader = useMemo(
    () => (
      <View>
        <View style={{ height: stickyOffset }} />
        {feed.isLoading && feed.listings.length === 0 ? (
          <View className="items-center py-16">
            <ActivityIndicator size="large" color={BRAND} />
            <Text className="mt-3 text-[14px]" style={ListifyTypography.label}>
              Loading events…
            </Text>
          </View>
        ) : null}
      </View>
    ),
    [feed.isLoading, feed.listings.length, stickyOffset],
  );

  const listEmpty = useMemo(() => {
    if (feed.isLoading) return null;
    return (
      <View className="items-center px-6 py-20">
        <MaterialIcons name="event-busy" size={56} color="#D1D5DB" />
        <Text className="mt-4 text-[18px]" style={ListifyTypography.sectionTitle}>
          No events on this date
        </Text>
        <Text className="mt-2 text-center text-[14px] text-[#6C7A74]">
          Try another date or adjust your filters.
        </Text>
      </View>
    );
  }, [feed.isLoading]);

  const listFooter = useMemo(() => {
    if (!feed.hasMore) return <View style={{ height: Math.max(insets.bottom, 16) + 24 }} />;
    return (
      <View className="items-center py-6">
        {feed.isLoadingMore ? (
          <ActivityIndicator color={BRAND} />
        ) : (
          <Pressable onPress={loadMore}>
            <Text style={{ fontFamily: ListifyFonts.semiBold, color: BRAND }}>Load more</Text>
          </Pressable>
        )}
        <View style={{ height: Math.max(insets.bottom, 16) }} />
      </View>
    );
  }, [feed.hasMore, feed.isLoadingMore, insets.bottom, loadMore]);

  return (
    <View className="flex-1" style={{ backgroundColor: BG }}>
      <StatusBar barStyle="dark-content" backgroundColor={BG} />

      <VoiceSearchModal
        visible={voiceVisible}
        onResult={handleVoiceResult}
        onClose={() => setVoiceVisible(false)}
      />

      <EventsCalendarModal
        visible={showCalendar}
        onClose={() => setShowCalendar(false)}
        selectedDate={selectedDate}
        counts={calendar.counts}
        onSelectDate={handleCalendarSelect}
      />

      {/* Fixed header */}
      <View
        className="absolute inset-x-0 top-0 z-50 px-4"
        style={{ paddingTop: insets.top + 8, height: headerHeight, backgroundColor: BG }}
      >
        <View className="h-11 flex-row items-center gap-3">
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            className="h-10 w-10 items-center justify-center"
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          >
            <MaterialIcons name="arrow-back-ios" size={20} color="#1A1A1A" />
          </Pressable>
          <View
            className="h-17 flex-1 flex-row items-center rounded-full border border-[#E8E8E8] bg-white px-4"
            style={{
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.04,
              shadowRadius: 6,
              elevation: 1,
            }}
          >
            <MaterialIcons name="search" size={22} color="#B8B8B8" />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSubmitEditing={handleSubmitSearch}
              returnKeyType="search"
              placeholder="Search here"
              placeholderTextColor="#B0B0B0"
              className="ml-3 flex-1 text-[15px] text-[#1A1A1A]"
              style={{ fontFamily: ListifyFonts.regular, paddingVertical: 0 }}
            />
            {searchQuery.length > 0 ? (
              <Pressable
                onPress={() => {
                  setSearchQuery("");
                  setAppliedSearch("");
                }}
                hitSlop={8}
              >
                <MaterialIcons name="close" size={20} color="#9CA3AF" />
              </Pressable>
            ) : (
              <Pressable onPress={() => setVoiceVisible(true)} hitSlop={8}>
                <MaterialIcons name="mic" size={20} color="#9CA3AF" />
              </Pressable>
            )}
          </View>
        </View>
      </View>

      <View
        className="absolute inset-x-0 z-45 px-4"
        style={{ top: headerHeight, height: titleHeight, backgroundColor: BG, paddingVertical: 16 }}
      >
        <Text
          style={{
            fontFamily: ListifyFonts.bold,
            fontSize: 24,
            lineHeight: 32,
            color: "#161D1A",
          }}
        >
          Upcoming Events
        </Text>
      </View>

      <View
        className="absolute inset-x-0 z-44 px-4"
        style={{
          top: headerHeight + titleHeight,
          height: dateStripHeight,
          backgroundColor: BG,
        }}
      >
        {calendar.isLoading && calendar.stripItems.length === 0 ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color={BRAND} size="small" />
          </View>
        ) : (
          <EventsDateStrip
            items={calendar.stripItems}
            selectedKey={selectedDateKey}
            onSelect={selectDate}
            onOpenCalendar={() => setShowCalendar(true)}
          />
        )}
      </View>

      <View
        className="absolute inset-x-0 z-40 bg-[#F6F7F8]"
        style={{ top: headerHeight + titleHeight + dateStripHeight, height: categoryTabsHeight }}
      >
        <FlatList
          horizontal
          data={subcategories}
          keyExtractor={(chip) => chip}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: GRID_SIDE_PADDING,
            paddingVertical: 10,
            gap: 20,
            alignItems: "center",
          }}
          renderItem={({ item: chip }) => {
            const isActive = selectedSubcategory === chip;
            return (
              <Pressable onPress={() => setSelectedSubcategory(chip)}>
                <Text
                  className="text-[22px] tracking-tight"
                  style={{
                    fontFamily: ListifyFonts.bold,
                    color: isActive ? "#1A1A1A" : "#C8CDD2",
                  }}
                >
                  {chip}
                </Text>
              </Pressable>
            );
          }}
        />
      </View>

      <FlatList
        data={feed.listings}
        keyExtractor={(item) => item._id}
        renderItem={renderItem}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        ListFooterComponent={listFooter}
        onEndReached={() => {
          if (feed.hasMore && !feed.isLoadingMore) loadMore();
        }}
        onEndReachedThreshold={0.4}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[BRAND]}
            tintColor={BRAND}
            progressViewOffset={stickyOffset}
          />
        }
        showsVerticalScrollIndicator={false}
        initialNumToRender={6}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews
      />
    </View>
  );
}

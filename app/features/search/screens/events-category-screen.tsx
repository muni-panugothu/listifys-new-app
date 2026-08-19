import { StatusBar } from "expo-status-bar";
import { MaterialIcons } from "@expo/vector-icons";
import { useFocusEffect, useRouter, type Href } from "@/lib/safe-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ListifyFonts } from "@/constants/typography";
import { EventsCategoryFilterBar } from "@/features/events/components/events-category-filter-bar";
import { EventsCategoryHero } from "@/features/events/components/events-category-hero";
import { EventsCategoryTabs } from "@/features/events/components/events-category-tabs";
import { EventsGridCard } from "@/features/events/components/events-grid-card";
import { FeaturedEventCard } from "@/features/events/components/featured-event-card";
import {
  resolveCategoryConfig,
  type CategoryDateFilterId,
  type CategorySortId,
  type CategorySubTab,
} from "@/features/events/data/events-category-config";
import { useCategoryEventsFeed } from "@/features/events/hooks/use-category-events-feed";
import { toggleSaveListing, type ListingItem } from "@/features/listing/services/listing-api";
import { buildEventDetailParams } from "@/features/events/utils/event-detail-helpers";
import { normalizeListingItem } from "@/features/listing/services/listing-api";
import { seedListingDetail } from "@/lib/cache";
import { useEventsTheme } from "@/features/events/theme/events-theme";
import { MARKETPLACE_LIST_PROPS } from "@/lib/performance/flat-list-config";
import { useLocalSearchParams } from "@/lib/safe-router";
import { useAppSelector } from "@/store/hooks";
import {
  selectLocationQueryState,
} from "@/store/slices/location-slice";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const H_PAD = 16;
const GRID_GAP = 12;
const CARD_WIDTH = (SCREEN_WIDTH - H_PAD * 2 - GRID_GAP) / 2;
const FEATURED_CARD_W = SCREEN_WIDTH * 0.52;
const HEADER_BODY_HEIGHT = 54;
const STICKY_THRESHOLD = 2;

function paramToString(value?: string | string[]) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function GridSkeleton({ width }: { width: number }) {
  const { skeleton, skeletonSecondary } = useEventsTheme();
  return (
    <View style={{ width, marginBottom: GRID_GAP }}>
      <View
        style={{
          width: "100%",
          height: width * 1.35,
          borderRadius: 14,
          backgroundColor: skeleton,
        }}
      />
      <View
        style={{
          marginTop: 8,
          height: 14,
          width: "85%",
          borderRadius: 4,
          backgroundColor: skeletonSecondary,
        }}
      />
      <View
        style={{
          marginTop: 6,
          height: 10,
          width: "60%",
          borderRadius: 4,
          backgroundColor: skeletonSecondary,
        }}
      />
    </View>
  );
}

export function EventsCategoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const et = useEventsTheme();
  const params = useLocalSearchParams<{
    categoryId?: string | string[];
    categoryLabel?: string | string[];
  }>();
  const user = useAppSelector((s) => s.auth.user);
  const locationQueryState = useAppSelector(selectLocationQueryState);

  const categoryId = paramToString(params.categoryId).toLowerCase();
  const categoryLabel = paramToString(params.categoryLabel);
  const config = useMemo(
    () => resolveCategoryConfig(categoryId, categoryLabel),
    [categoryId, categoryLabel],
  );

  const [activeTab, setActiveTab] = useState<CategorySubTab>(config.subTabs[0]);
  const [dateFilter, setDateFilter] = useState<CategoryDateFilterId>("all");
  const [sort, setSort] = useState<CategorySortId>("newest");
  const [under10km, setUnder10km] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [tabsSticky, setTabsSticky] = useState(false);
  const [filtersSticky, setFiltersSticky] = useState(false);

  const listRef = useRef<FlatList<ListingItem>>(null);
  const scrollOffsetRef = useRef(0);
  const tabsAnchorY = useRef(0);
  const filtersAnchorY = useRef(0);
  const tabsHeightRef = useRef(48);
  const filtersHeightRef = useRef(58);

  const headerHeight = insets.top + HEADER_BODY_HEIGHT;

  const {
    listings,
    featured,
    isLoading,
    isLoadingMore,
    isRefreshing,
    hasMore,
    error,
    loadMore,
    refresh,
  } = useCategoryEventsFeed({
    apiSubcategory: config.apiSubcategory,
    activeTab,
    dateFilter,
    sort,
    under10km,
    locationState: locationQueryState,
  });

  useEffect(() => {
    setActiveTab(config.subTabs[0]);
    setUnder10km(false);
    setTabsSticky(false);
    setFiltersSticky(false);
    tabsAnchorY.current = 0;
    filtersAnchorY.current = 0;
    scrollOffsetRef.current = 0;
  }, [config.id, config.subTabs]);

  useFocusEffect(
    useCallback(() => {
      if (scrollOffsetRef.current > 0) {
        requestAnimationFrame(() => {
          listRef.current?.scrollToOffset({
            offset: scrollOffsetRef.current,
            animated: false,
          });
        });
      }
    }, []),
  );

  const toggleSave = useCallback(async (eventId: string) => {
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
    if (!user) return;
    try {
      const res = await toggleSaveListing("events", eventId);
      setSavedIds((prev) => {
        const next = new Set(prev);
        if (res.saved) next.add(eventId);
        else next.delete(eventId);
        return next;
      });
    } catch {
      /* keep optimistic */
    }
  }, [user]);

  const openEvent = useCallback(
    (eventId: string, pool: ListingItem[]) => {
      const match = pool.find((item) => item._id === eventId);
      if (match) {
        seedListingDetail("events", match._id, normalizeListingItem(match), 120_000, {
          force: true,
        });
      }
      const ids = pool.map((e) => e._id);
      const index = Math.max(0, ids.indexOf(eventId));
      router.push({
        pathname: "/event-detail",
        params: buildEventDetailParams(eventId, ids, index),
      } as Href);
    },
    [router],
  );

  const openSearch = useCallback(() => {
    router.push({
      pathname: "/events-search",
      params: {
        categoryId: config.id,
        categoryLabel: config.label,
        subcategory: config.apiSubcategory,
      },
    } as Href);
  }, [config.apiSubcategory, config.id, config.label, router]);

  const cycleSort = useCallback(() => {
    setSort((prev) => {
      const hasCoords =
        locationQueryState.lat != null && locationQueryState.lng != null;
      if (prev === "newest") return hasCoords ? "nearby" : "date";
      if (prev === "nearby") return "date";
      return "newest";
    });
  }, [locationQueryState.lat, locationQueryState.lng]);

  const cycleDateFilter = useCallback(() => {
    setDateFilter((prev) => {
      const order: CategoryDateFilterId[] = [
        "all",
        "today",
        "tomorrow",
        "weekend",
      ];
      const idx = order.indexOf(prev);
      return order[(idx + 1) % order.length];
    });
  }, []);

  const toggleUnder10km = useCallback(() => {
    setUnder10km((prev) => !prev);
  }, []);

  const clearSort = useCallback(() => setSort("newest"), []);
  const clearDateFilter = useCallback(() => setDateFilter("all"), []);
  const clearUnder10km = useCallback(() => setUnder10km(false), []);

  const showTabsSticky = tabsSticky || filtersSticky;

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      scrollOffsetRef.current = y;

      const nextTabsSticky =
        tabsAnchorY.current > 0 && y >= tabsAnchorY.current - STICKY_THRESHOLD;
      const nextFiltersSticky =
        filtersAnchorY.current > 0 &&
        y >= filtersAnchorY.current - STICKY_THRESHOLD;

      setTabsSticky((prev) => (prev === nextTabsSticky ? prev : nextTabsSticky));
      setFiltersSticky((prev) =>
        prev === nextFiltersSticky ? prev : nextFiltersSticky,
      );
    },
    [],
  );

  const renderGridItem = useCallback(
    ({ item }: { item: ListingItem }) => (
      <EventsGridCard
        event={item}
        cardWidth={CARD_WIDTH}
        isSaved={
          savedIds.has(item._id) ||
          Boolean(user?.id && item.savedBy?.includes(user.id))
        }
        onPress={() => openEvent(item._id, listings)}
        onToggleSave={() => toggleSave(item._id)}
      />
    ),
    [listings, openEvent, savedIds, toggleSave, user?.id],
  );

  const keyExtractor = useCallback((item: ListingItem) => item._id, []);

  const listHeader = useMemo(
    () => (
      <View style={{ backgroundColor: et.background }}>
        <EventsCategoryHero config={config} />

        <View
          onLayout={(e) => {
            tabsAnchorY.current = e.nativeEvent.layout.y;
            tabsHeightRef.current = e.nativeEvent.layout.height;
          }}
          style={{ opacity: showTabsSticky ? 0 : 1 }}
          pointerEvents={showTabsSticky ? "none" : "auto"}
        >
          <EventsCategoryTabs
            tabs={config.subTabs}
            activeTabId={activeTab.id}
            accentColor={config.accentColor}
            onSelect={setActiveTab}
          />
        </View>
        {showTabsSticky ? <View style={{ height: tabsHeightRef.current }} /> : null}

        {featured.length > 0 ? (
          <View style={{ marginTop: 22 }}>
            <Text
              style={{
                fontFamily: ListifyFonts.bold,
                fontSize: 22,
                color: et.textPrimary,
                paddingHorizontal: H_PAD,
                marginBottom: 14,
                ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
              }}
            >
              Featured
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              scrollEventThrottle={16}
              nestedScrollEnabled
              contentContainerStyle={{
                paddingHorizontal: H_PAD,
                gap: 12,
                paddingBottom: 4,
              }}
              decelerationRate="fast"
            >
              {featured.map((event, index) => (
                <FeaturedEventCard
                  key={event._id}
                  event={event}
                  cardWidth={FEATURED_CARD_W}
                  isSaved={
                    savedIds.has(event._id) ||
                    Boolean(user?.id && event.savedBy?.includes(user.id))
                  }
                  onPress={() => openEvent(event._id, featured)}
                  onToggleSave={() => toggleSave(event._id)}
                />
              ))}
            </ScrollView>
          </View>
        ) : isLoading ? (
          <View style={{ marginTop: 22, paddingHorizontal: H_PAD }}>
            <View
              style={{
                height: 18,
                width: 100,
                borderRadius: 4,
                backgroundColor: et.skeleton,
                marginBottom: 14,
              }}
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {[0, 1].map((i) => (
                <View
                  key={i}
                  style={{
                    width: FEATURED_CARD_W,
                    height: FEATURED_CARD_W * 1.35,
                    borderRadius: 16,
                    marginRight: 12,
                    backgroundColor: et.skeletonSecondary,
                  }}
                />
              ))}
            </ScrollView>
          </View>
        ) : null}

        <Text
          style={{
            marginTop: 28,
            marginBottom: 4,
            paddingHorizontal: H_PAD,
            fontFamily: ListifyFonts.bold,
            fontSize: 22,
            color: et.textPrimary,
            ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
          }}
        >
          All {config.label} Events
        </Text>

        <View
          onLayout={(e) => {
            filtersAnchorY.current = e.nativeEvent.layout.y;
            filtersHeightRef.current = e.nativeEvent.layout.height;
          }}
          style={{ opacity: filtersSticky ? 0 : 1 }}
          pointerEvents={filtersSticky ? "none" : "auto"}
        >
          <EventsCategoryFilterBar
            sort={sort}
            dateFilter={dateFilter}
            under10km={under10km}
            onSortPress={cycleSort}
            onDatePress={cycleDateFilter}
            onDateFilterSelect={setDateFilter}
            onToggleUnder10km={toggleUnder10km}
            onClearSort={clearSort}
            onClearDateFilter={clearDateFilter}
            onClearUnder10km={clearUnder10km}
          />
        </View>
        {filtersSticky ? (
          <View style={{ height: filtersHeightRef.current }} />
        ) : null}

        {error && listings.length === 0 ? (
          <View style={{ padding: H_PAD, alignItems: "center" }}>
            <Text
              style={{
                fontFamily: ListifyFonts.medium,
                fontSize: 14,
                color: et.textSecondary,
                textAlign: "center",
              }}
            >
              Could not load events. Pull to refresh or try again.
            </Text>
            <Pressable
              onPress={() => void refresh()}
              style={{ marginTop: 12, paddingHorizontal: 16, paddingVertical: 8 }}
            >
              <Text
                style={{
                  fontFamily: ListifyFonts.semiBold,
                  fontSize: 14,
                  color: config.accentColor,
                }}
              >
                Retry
              </Text>
            </Pressable>
          </View>
        ) : null}

        {!isLoading && listings.length === 0 && !error ? (
          <View style={{ paddingHorizontal: H_PAD, paddingVertical: 32 }}>
            <Text
              style={{
                fontFamily: ListifyFonts.semiBold,
                fontSize: 16,
                color: et.textPrimary,
                textAlign: "center",
              }}
            >
              No {config.label.toLowerCase()} events found nearby.
            </Text>
            <Text
              style={{
                marginTop: 8,
                fontFamily: ListifyFonts.regular,
                fontSize: 13,
                color: et.textSecondary,
                textAlign: "center",
                lineHeight: 20,
              }}
            >
              Try changing location, clearing filters, or explore other categories.
            </Text>
            <Pressable
              onPress={() => router.push("/location-picker" as Href)}
              style={{
                marginTop: 16,
                alignSelf: "center",
                paddingHorizontal: 18,
                paddingVertical: 10,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: et.emptyButtonBorder,
              }}
            >
              <Text
                style={{
                  fontFamily: ListifyFonts.semiBold,
                  fontSize: 13,
                  color: et.textPrimary,
                }}
              >
                Change location
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    ),
    [
      activeTab.id,
      config,
      cycleDateFilter,
      cycleSort,
      dateFilter,
      error,
      featured,
      filtersSticky,
      showTabsSticky,
      tabsSticky,
      isLoading,
      listings.length,
      openEvent,
      refresh,
      router,
      sort,
      under10km,
      toggleUnder10km,
      clearSort,
      clearDateFilter,
      clearUnder10km,
      toggleSave,
      user?.id,
      savedIds,
      et,
    ],
  );

  return (
    <View style={{ flex: 1, backgroundColor: et.background }}>
      <StatusBar style={et.colors.statusBarStyle} backgroundColor={et.headerBg} />
      <View
        style={{
          paddingTop: insets.top + 6,
          paddingHorizontal: H_PAD,
          paddingBottom: 8,
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: et.headerBg,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={({ pressed }) => ({
            width: 40,
            height: 40,
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.75 : 1,
          })}
        >
          <MaterialIcons name="arrow-back" size={24} color={et.icon} />
        </Pressable>

        <Text
          numberOfLines={1}
          style={{
            flex: 1,
            marginLeft: 4,
            fontFamily: ListifyFonts.bold,
            fontSize: 18,
            color: et.textPrimary,
            ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
          }}
        >
          {config.label}
        </Text>

        <Pressable
          onPress={openSearch}
          hitSlop={12}
          style={({ pressed }) => ({
            width: 40,
            height: 40,
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.75 : 1,
          })}
        >
          <MaterialIcons name="search" size={24} color={et.icon} />
        </Pressable>
      </View>

      {showTabsSticky ? (
        <View
          style={{
            position: "absolute",
            top: headerHeight,
            left: 0,
            right: 0,
            zIndex: 30,
            backgroundColor: et.background,
            borderBottomWidth: filtersSticky ? 0 : 1,
            borderBottomColor: et.divider,
          }}
        >
          <EventsCategoryTabs
            tabs={config.subTabs}
            activeTabId={activeTab.id}
            accentColor={config.accentColor}
            onSelect={setActiveTab}
          />
        </View>
      ) : null}

      {filtersSticky ? (
        <View
          style={{
            position: "absolute",
            top: headerHeight + (showTabsSticky ? tabsHeightRef.current : 0),
            left: 0,
            right: 0,
            zIndex: 29,
            backgroundColor: et.background,
            borderBottomWidth: 1,
            borderBottomColor: et.divider,
          }}
        >
          <EventsCategoryFilterBar
            sort={sort}
            dateFilter={dateFilter}
            under10km={under10km}
            onSortPress={cycleSort}
            onDatePress={cycleDateFilter}
            onDateFilterSelect={setDateFilter}
            onToggleUnder10km={toggleUnder10km}
            onClearSort={clearSort}
            onClearDateFilter={clearDateFilter}
            onClearUnder10km={clearUnder10km}
          />
        </View>
      ) : null}

      <FlatList
        ref={listRef}
        data={listings}
        keyExtractor={keyExtractor}
        renderItem={renderGridItem}
        numColumns={2}
        ListHeaderComponent={listHeader}
        columnWrapperStyle={{
          gap: GRID_GAP,
          paddingHorizontal: H_PAD,
          marginBottom: GRID_GAP,
        }}
        contentContainerStyle={{
          paddingBottom: Math.max(insets.bottom, 16) + 24,
        }}
        style={{ flex: 1, backgroundColor: et.background }}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        onEndReached={() => loadMore()}
        onEndReachedThreshold={0.4}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => void refresh()}
            tintColor={config.accentColor}
            colors={[config.accentColor]}
          />
        }
        ListFooterComponent={
          isLoadingMore ? (
            <View style={{ paddingVertical: 20 }}>
              <ActivityIndicator color={config.accentColor} />
            </View>
          ) : !hasMore && listings.length > 0 ? (
            <Text
              style={{
                textAlign: "center",
                paddingVertical: 16,
                fontFamily: ListifyFonts.regular,
                fontSize: 12,
                color: et.footerMuted,
              }}
            >
              You&apos;ve seen all events
            </Text>
          ) : null
        }
        ListEmptyComponent={
          isLoading ? (
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                paddingHorizontal: H_PAD,
                gap: GRID_GAP,
              }}
            >
              <GridSkeleton width={CARD_WIDTH} />
              <GridSkeleton width={CARD_WIDTH} />
              <GridSkeleton width={CARD_WIDTH} />
              <GridSkeleton width={CARD_WIDTH} />
            </View>
          ) : null
        }
        {...MARKETPLACE_LIST_PROPS}
        extraData={`${savedIds.size}-${activeTab.id}-${dateFilter}-${sort}-${under10km}`}
      />
    </View>
  );
}

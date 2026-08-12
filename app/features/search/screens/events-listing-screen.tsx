import { StatusBar } from "expo-status-bar";
import { MaterialIcons } from "@expo/vector-icons";
import { useFocusEffect, useRouter, type Href } from "@/lib/safe-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  Platform,
  Pressable,
  Text,
  View,
  type ListRenderItem,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ListifyFonts } from "@/constants/typography";
import { EventsCustomDatesSheet } from "@/features/events/components/events-custom-dates-sheet";
import { EventsExploreGrid } from "@/features/events/components/events-explore-grid";
import { EventsFilterBar } from "@/features/events/components/events-filter-bar";
import {
  EventsFloatingNav,
  type EventsFloatingNavTab,
} from "@/features/events/components/events-floating-nav";
import { EventsHubSwitcherModal } from "@/features/events/components/events-hub-switcher-modal";
import type { MarketplaceHubTab } from "@/features/home/data/home-hub-tabs";
import { navigateFromHubTab } from "@/lib/navigate-from-hub-tab";
import { EventsGridCard } from "@/features/events/components/events-grid-card";
import { EventsHeroCarousel } from "@/features/events/components/events-hero-carousel";
import { EventsSectionCarousel } from "@/features/events/components/events-section-carousel";
import { EventsWeekCategoryStrip } from "@/features/events/components/events-week-category-strip";
import {
  buildWeekPeriodOptions,
  EventsWeekPeriodMenu,
  weekPeriodLabel,
  type WeekPeriodId,
} from "@/features/events/components/events-week-period-menu";
import type { EventsAllFilterId } from "@/features/events/data/events-all-filters";
import {
  EVENTS_CATEGORY_SECTIONS,
  EVENTS_WEEK_CATEGORIES,
  type EventsExploreCategory,
  type EventsWeekCategory,
  type FeaturedEventDummy,
} from "@/features/events/data/events-discovery";
// import { FeaturedProfileCard } from "@/features/home/components/featured-profile-card";
// import {
//   FEATURED_ARTISTS,
//   type FeaturedArtistItem,
// } from "@/features/home/data/featured-mock-data";
import { fetchUpcomingEvents } from "@/features/events/services/events-api";
import type { ListingItem } from "@/features/listing/services/listing-api";
import { normalizeListingItem } from "@/features/listing/services/listing-api";
import {
  buildEventsFilterQuery,
  needsClientSideFilter,
} from "@/features/events/utils/events-filter-query";
import {
  buildEventDetailParams,
  listingToFeaturedEvent,
  matchesEventsAllFilter,
} from "@/features/events/utils/event-detail-helpers";
import { useTabNavigation } from "@/lib/use-tab-navigation";
import { seedListingDetail } from "@/lib/cache";
import { MARKETPLACE_LIST_PROPS } from "@/lib/performance/flat-list-config";
import { useEventsTheme } from "@/features/events/theme/events-theme";
import { useTheme } from "@/providers/theme-provider";
import { useAppSelector } from "@/store/hooks";
import {
  selectIsoCountryCode,
  selectLocationCoords,
  selectLocationLabel,
} from "@/store/slices/location-slice";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const H_PAD = 16;
// const ARTIST_CARD_WIDTH = SCREEN_WIDTH * 0.48;
// const ARTIST_GAP = 14;
const GRID_GAP = 12;
const GRID_CARD_WIDTH = (SCREEN_WIDTH - H_PAD * 2 - GRID_GAP) / 2;

type EventGridRow = {
  id: string;
  left: ListingItem;
  right?: ListingItem;
};

function filterFeaturedByQuery(events: FeaturedEventDummy[], q: string) {
  if (!q) return events;
  return events.filter(
    (e) =>
      e.title.toLowerCase().includes(q) || e.venue.toLowerCase().includes(q),
  );
}

function eventsForSection(
  sectionCategoryId: string,
  all: FeaturedEventDummy[],
  q: string,
): FeaturedEventDummy[] {
  const filtered = filterFeaturedByQuery(all, q);
  if (sectionCategoryId === "featured") {
    return filtered.slice(0, 6);
  }
  return filtered.filter((e) => e.category === sectionCategoryId);
}

function filterListingsByQuery(listings: ListingItem[], q: string) {
  if (!q) return listings;
  const needle = q.toLowerCase();
  return listings.filter((item) => {
    const venue =
      ((item as { venue?: string }).venue as string | undefined)?.trim() ||
      item.location?.trim() ||
      "";
    return (
      item.title?.toLowerCase().includes(needle) ||
      venue.toLowerCase().includes(needle)
    );
  });
}

function formatCustomRangeLabel(start: Date, end: Date) {
  const sameMonth =
    start.getMonth() === end.getMonth() &&
    start.getFullYear() === end.getFullYear();
  if (sameMonth && start.getDate() === end.getDate()) {
    return `${start.getDate()} ${start.toLocaleString("en-GB", { month: "short" })}`;
  }
  if (sameMonth) {
    return `${start.getDate()}-${end.getDate()} ${end.toLocaleString("en-GB", { month: "short" })}`;
  }
  return `${start.getDate()} ${start.toLocaleString("en-GB", { month: "short" })} – ${end.getDate()} ${end.toLocaleString("en-GB", { month: "short" })}`;
}

export function EventsListingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const et = useEventsTheme();
  const scrollRef = useRef<FlatList<{ id: string; left: ListingItem; right?: ListingItem }>>(null);
  const filtersAnchorY = useRef(0);
  const lastScrollY = useRef(0);
  const lastFetchAtRef = useRef(0);
  const navCollapse = useSharedValue(0);

  const [selectedWeekId, setSelectedWeekId] = useState<string | null>(null);
  const [selectedExploreId, setSelectedExploreId] = useState<string | null>(
    null,
  );
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  // const [savedArtistIds, setSavedArtistIds] = useState<Set<string>>(new Set());
  const [activeNavTab, setActiveNavTab] =
    useState<EventsFloatingNavTab>("events");
  const [hubVisible, setHubVisible] = useState(false);
  const [allFilterId, setAllFilterId] = useState<EventsAllFilterId>("all");
  const [filtersSticky, setFiltersSticky] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const handleTabPress = useTabNavigation();

  const [periodMenuVisible, setPeriodMenuVisible] = useState(false);
  const [customDatesVisible, setCustomDatesVisible] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<WeekPeriodId>("week");
  const [customRange, setCustomRange] = useState<{
    start: Date;
    end: Date;
  } | null>(null);
  const [periodMenuTop, setPeriodMenuTop] = useState(0);

  const headerHeight = insets.top + 12 + 52;
  const query = "";

  const periodOptions = useMemo(() => buildWeekPeriodOptions(new Date()), []);

  const customLabel = customRange
    ? formatCustomRangeLabel(customRange.start, customRange.end)
    : null;
  const periodText = weekPeriodLabel(selectedPeriod, customLabel);

  // Artists in your District — temporarily disabled
  // const artists = useMemo(() => {
  //   if (!query) return FEATURED_ARTISTS;
  //   return FEATURED_ARTISTS.filter(
  //     (a) =>
  //       a.name.toLowerCase().includes(query) ||
  //       a.subtitle.toLowerCase().includes(query),
  //   );
  // }, [query]);

  const locationCoords = useAppSelector(selectLocationCoords);
  const locationLabel = useAppSelector(selectLocationLabel);
  const isoCountryCode = useAppSelector(selectIsoCountryCode);

  const [apiListings, setApiListings] = useState<ListingItem[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);

  const loadUpcomingEvents = useCallback(async (force = false) => {
    setEventsLoading(true);
    try {
      const queryParams = buildEventsFilterQuery(allFilterId, {
        lat: locationCoords.lat,
        lng: locationCoords.lng,
        countryCode: isoCountryCode,
        locationLabel,
      });
      const res = await fetchUpcomingEvents(queryParams, { force });
      let listings = res.listings ?? [];
      if (needsClientSideFilter(allFilterId)) {
        listings = listings.filter((listing) =>
          matchesEventsAllFilter(listing, allFilterId, {
            userLat: locationCoords.lat,
            userLng: locationCoords.lng,
          }),
        );
      }
      setApiListings(listings);
      lastFetchAtRef.current = Date.now();
    } catch {
      setApiListings([]);
    } finally {
      setEventsLoading(false);
    }
  }, [
    allFilterId,
    isoCountryCode,
    locationCoords.lat,
    locationCoords.lng,
    locationLabel,
  ]);

  useEffect(() => {
    void loadUpcomingEvents();
  }, [loadUpcomingEvents]);

  useFocusEffect(
    useCallback(() => {
      const staleMs = 60_000;
      if (Date.now() - lastFetchAtRef.current > staleMs) {
        void loadUpcomingEvents(true);
      }
    }, [loadUpcomingEvents]),
  );

  const featuredEvents = useMemo(
    () => apiListings.map(listingToFeaturedEvent),
    [apiListings],
  );

  const featuredSection = EVENTS_CATEGORY_SECTIONS[0];
  const musicSection = EVENTS_CATEGORY_SECTIONS[1];
  const comedySection = EVENTS_CATEGORY_SECTIONS[2];

  const allEventsFiltered = useMemo(() => {
    const base = filterListingsByQuery(apiListings, query);
    if (needsClientSideFilter(allFilterId)) {
      return base.filter((listing) =>
        matchesEventsAllFilter(listing, allFilterId, {
          userLat: locationCoords.lat,
          userLng: locationCoords.lng,
        }),
      );
    }
    return base;
  }, [allFilterId, apiListings, locationCoords.lat, locationCoords.lng, query]);

  const eventIndexById = useMemo(() => {
    const map = new Map<string, number>();
    allEventsFiltered.forEach((event, index) => {
      map.set(event._id, index);
    });
    return map;
  }, [allEventsFiltered]);

  const eventRows = useMemo(() => {
    const rows: Array<{
      id: string;
      left: ListingItem;
      right?: ListingItem;
    }> = [];
    for (let i = 0; i < allEventsFiltered.length; i += 2) {
      rows.push({
        id: `row-${allEventsFiltered[i]._id}`,
        left: allEventsFiltered[i],
        right: allEventsFiltered[i + 1],
      });
    }
    return rows;
  }, [allEventsFiltered]);

  const handleToggleSave = useCallback((id: string) => {
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const openFeaturedEvent = useCallback(
    (event: FeaturedEventDummy, index: number, pool: FeaturedEventDummy[]) => {
      const fromApi = apiListings.find((item) => item._id === event.id);
      if (fromApi) {
        seedListingDetail("events", fromApi._id, normalizeListingItem(fromApi), 120_000, {
          force: true,
        });
      }
      const ids = pool.map((item) => item.id);
      router.push({
        pathname: "/event-detail",
        params: buildEventDetailParams(event.id, ids, index),
      } as Href);
    },
    [apiListings, router],
  );

  const openListingEvent = useCallback(
    (listing: ListingItem, index: number, pool: ListingItem[]) => {
      seedListingDetail("events", listing._id, normalizeListingItem(listing), 120_000, {
        force: true,
      });
      const ids = pool.map((item) => item._id);
      router.push({
        pathname: "/event-detail",
        params: buildEventDetailParams(listing._id, ids, index),
      } as Href);
    },
    [router],
  );

  const featuredCarouselEvents = useMemo(
    () => eventsForSection(featuredSection.categoryId, featuredEvents, query),
    [featuredEvents, featuredSection.categoryId, query],
  );

  const comedyCarouselEvents = useMemo(() => {
    if (!comedySection) return [];
    return eventsForSection(comedySection.categoryId, featuredEvents, query);
  }, [comedySection, featuredEvents, query]);

  const musicCarouselEvents = useMemo(() => {
    if (!musicSection) return [];
    return eventsForSection(musicSection.categoryId, featuredEvents, query);
  }, [featuredEvents, musicSection, query]);

  // const handleToggleArtistSave = useCallback((id: string) => {
  //   setSavedArtistIds((prev) => {
  //     const next = new Set(prev);
  //     if (next.has(id)) next.delete(id);
  //     else next.add(id);
  //     return next;
  //   });
  // }, []);

  const handleWeekSelect = useCallback(
    (cat: EventsWeekCategory) => {
      setSelectedWeekId(cat.id);
      const categoryIndex = EVENTS_WEEK_CATEGORIES.findIndex((c) => c.id === cat.id);
      router.push({
        pathname: "/events-category-story",
        params: {
          categoryId: cat.id,
          categoryLabel: cat.label,
          categoryIndex: String(categoryIndex >= 0 ? categoryIndex : 0),
          startIndex: "0",
        },
      } as Href);
    },
    [router],
  );

  const handleExploreSelect = useCallback(
    (cat: EventsExploreCategory) => {
      setSelectedExploreId(cat.id);
      router.push({
        pathname: "/events-category",
        params: {
          categoryId: cat.id,
          categoryLabel: cat.label,
        },
      });
    },
    [router],
  );

  const handlePressPeriodTitle = useCallback((anchorBottom: number) => {
    setPeriodMenuTop(anchorBottom);
    setPeriodMenuVisible((prev) => !prev);
  }, []);

  const handlePeriodSelect = useCallback(
    (id: Exclude<WeekPeriodId, "week">) => {
      setPeriodMenuVisible(false);
      if (id === "custom") {
        setCustomDatesVisible(true);
        return;
      }
      setSelectedPeriod(id);
    },
    [],
  );

  const handleCustomApply = useCallback(
    (range: { start: Date; end: Date }) => {
      setCustomRange(range);
      setSelectedPeriod("custom");
    },
    [],
  );

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      const dy = y - lastScrollY.current;
      if (y <= 16) {
        navCollapse.value = withTiming(0, { duration: 240 });
      } else if (dy > 6) {
        navCollapse.value = withTiming(1, { duration: 240 });
      } else if (dy < -6) {
        navCollapse.value = withTiming(0, { duration: 240 });
      }
      lastScrollY.current = y;

      const stickyAt = filtersAnchorY.current;
      const sticky = stickyAt > 80 && y >= stickyAt - 2;
      const back = sticky && y > stickyAt + 140;
      setFiltersSticky((prev) => (prev === sticky ? prev : sticky));
      setShowBackToTop((prev) => (prev === back ? prev : back));
    },
    [navCollapse],
  );

  const openEventsSearch = useCallback(() => {
    router.push("/events-search");
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      setActiveNavTab("events");
    }, []),
  );

  const handleFloatingNavPress = useCallback(
    (tab: EventsFloatingNavTab) => {
      if (tab === "search") {
        openEventsSearch();
        return;
      }
      setActiveNavTab("events");
      setHubVisible(true);
    },
    [openEventsSearch],
  );

  const handleHubSelect = useCallback(
    (tab: MarketplaceHubTab) => {
      setHubVisible(false);
      if (tab.id === "events") {
        setActiveNavTab("events");
        return;
      }
      navigateFromHubTab(tab, router, handleTabPress);
    },
    [handleTabPress, router],
  );

  const handleBackToTop = useCallback(() => {
    scrollRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

  const listHeader = useMemo(
    () => (
      <>
        <EventsHeroCarousel onExplore={() => {}} />

        <EventsWeekCategoryStrip
          selectedId={selectedWeekId}
          onSelect={handleWeekSelect}
          periodLabel={periodText}
          menuOpen={periodMenuVisible}
          onPressTitle={handlePressPeriodTitle}
        />

        <EventsSectionCarousel
          title={featuredSection.title}
          events={featuredCarouselEvents}
          savedIds={savedIds}
          onToggleSave={handleToggleSave}
          onPressEvent={(event, index) =>
            openFeaturedEvent(event, index, featuredCarouselEvents)
          }
          showOffers
        />

        {musicSection && musicCarouselEvents.length > 0 ? (
          <EventsSectionCarousel
            title={musicSection.title}
            events={musicCarouselEvents}
            savedIds={savedIds}
            onToggleSave={handleToggleSave}
            onPressEvent={(event, index) =>
              openFeaturedEvent(event, index, musicCarouselEvents)
            }
          />
        ) : null}

        <EventsExploreGrid
          selectedId={selectedExploreId}
          onSelect={handleExploreSelect}
        />

        {comedySection ? (
          <EventsSectionCarousel
            title={comedySection.title}
            events={comedyCarouselEvents}
            savedIds={savedIds}
            onToggleSave={handleToggleSave}
            onPressEvent={(event, index) =>
              openFeaturedEvent(event, index, comedyCarouselEvents)
            }
          />
        ) : null}

        <Text
          style={{
            fontFamily: ListifyFonts.bold,
            fontSize: 24,
            color: colors.textPrimary,
            paddingHorizontal: H_PAD,
            marginTop: 28,
            marginBottom: 8,
            ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
          }}
        >
          All Events
        </Text>

        <View
          onLayout={(e) => {
            filtersAnchorY.current = e.nativeEvent.layout.y;
          }}
          style={{ opacity: filtersSticky ? 0 : 1 }}
          pointerEvents={filtersSticky ? "none" : "auto"}
        >
          <EventsFilterBar
            selectedId={allFilterId}
            onSelect={setAllFilterId}
          />
        </View>

        {filtersSticky ? <View style={{ height: 54 }} /> : null}

        {!eventsLoading && eventRows.length === 0 ? (
          <Text
            style={{
              fontFamily: ListifyFonts.regular,
              fontSize: 15,
              color: colors.textSecondary,
              paddingHorizontal: H_PAD,
              paddingTop: GRID_GAP,
              paddingBottom: GRID_GAP,
            }}
          >
            No upcoming events match this filter yet. Try another category or post a new event.
          </Text>
        ) : null}
      </>
    ),
    [
      allFilterId,
      colors.textPrimary,
      colors.textSecondary,
      comedyCarouselEvents,
      comedySection,
      eventRows.length,
      eventsLoading,
      featuredCarouselEvents,
      featuredSection.title,
      filtersSticky,
      handleExploreSelect,
      handlePressPeriodTitle,
      handleToggleSave,
      handleWeekSelect,
      musicCarouselEvents,
      musicSection,
      openFeaturedEvent,
      periodMenuVisible,
      periodText,
      savedIds,
      selectedExploreId,
      selectedWeekId,
    ],
  );

  const renderEventRow: ListRenderItem<EventGridRow> = useCallback(
    ({ item: row }) => (
      <View
        style={{
          flexDirection: "row",
          paddingHorizontal: H_PAD,
          paddingTop: GRID_GAP,
          gap: GRID_GAP,
        }}
      >
        <EventsGridCard
          event={row.left}
          cardWidth={GRID_CARD_WIDTH}
          isSaved={savedIds.has(row.left._id)}
          onPress={() => {
            openListingEvent(
              row.left,
              eventIndexById.get(row.left._id) ?? 0,
              allEventsFiltered,
            );
          }}
          onToggleSave={() => handleToggleSave(row.left._id)}
        />
        {row.right ? (
          <EventsGridCard
            event={row.right}
            cardWidth={GRID_CARD_WIDTH}
            isSaved={savedIds.has(row.right._id)}
            onPress={() => {
              openListingEvent(
                row.right!,
                eventIndexById.get(row.right!._id) ?? 0,
                allEventsFiltered,
              );
            }}
            onToggleSave={() => handleToggleSave(row.right!._id)}
          />
        ) : (
          <View style={{ width: GRID_CARD_WIDTH }} />
        )}
      </View>
    ),
    [
      allEventsFiltered,
      eventIndexById,
      handleToggleSave,
      openListingEvent,
      savedIds,
    ],
  );

  const rowKeyExtractor = useCallback(
    (row: { id: string }) => row.id,
    [],
  );

  // const artistKeyExtractor = useCallback(
  //   (item: FeaturedArtistItem) => item.id,
  //   [],
  // );

  // const renderArtist = useCallback(
  //   ({ item }: { item: FeaturedArtistItem }) => (
  //     <FeaturedProfileCard
  //       id={item.id}
  //       name={item.name}
  //       subtitle={item.subtitle}
  //       avatar={item.avatar}
  //       stats={item.stats}
  //       eventDate={item.eventDate}
  //       cardWidth={ARTIST_CARD_WIDTH}
  //       isSaved={savedArtistIds.has(item.id)}
  //       onPress={() => {}}
  //       onToggleSave={() => handleToggleArtistSave(item.id)}
  //     />
  //   ),
  //   [handleToggleArtistSave, savedArtistIds],
  // );

  return (
    <View style={{ flex: 1, backgroundColor: et.background }}>
      <StatusBar style={et.colors.statusBarStyle} backgroundColor={et.headerBg} />
      <EventsHubSwitcherModal
        visible={hubVisible}
        activeTab="events"
        onClose={() => setHubVisible(false)}
        onSelect={handleHubSelect}
      />

      <EventsWeekPeriodMenu
        visible={periodMenuVisible}
        topOffset={periodMenuTop || headerHeight + 120}
        selectedId={selectedPeriod}
        options={periodOptions}
        onSelect={handlePeriodSelect}
        onClose={() => setPeriodMenuVisible(false)}
      />

      <EventsCustomDatesSheet
        visible={customDatesVisible}
        onClose={() => setCustomDatesVisible(false)}
        initialStart={customRange?.start}
        initialEnd={customRange?.end}
        onApply={handleCustomApply}
      />

      <View
        style={{
          zIndex: 50,
          paddingTop: insets.top + 8,
          paddingBottom: 8,
          paddingHorizontal: H_PAD,
          backgroundColor: et.headerBg,
        }}
      >
        <View
          style={{
            height: 44,
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
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
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <MaterialIcons name="arrow-back-ios" size={20} color={colors.icon} />
          </Pressable>

          <Pressable
            onPress={openEventsSearch}
            style={({ pressed }) => ({
              flex: 1,
              height: 48,
              flexDirection: "row",
              alignItems: "center",
              borderRadius: 999,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
              paddingHorizontal: 14,
              opacity: pressed ? 0.9 : 1,
            })}
          >
            <MaterialIcons name="search" size={22} color={colors.iconMuted} />
            <Text
              numberOfLines={1}
              style={{
                marginLeft: 10,
                flex: 1,
                fontSize: 15,
                fontFamily: ListifyFonts.regular,
                color: colors.inputPlaceholder,
              }}
            >
              Search for events
            </Text>
            <MaterialIcons name="mic" size={20} color={colors.iconMuted} />
          </Pressable>
        </View>
      </View>

      {filtersSticky ? (
        <View
          style={{
            position: "absolute",
            top: headerHeight,
            left: 0,
            right: 0,
            zIndex: 48,
            backgroundColor: et.background,
          }}
        >
          <EventsFilterBar
            selectedId={allFilterId}
            onSelect={setAllFilterId}
          />
        </View>
      ) : null}

      <FlatList
        ref={scrollRef}
        data={eventRows}
        keyExtractor={rowKeyExtractor}
        renderItem={renderEventRow}
        ListHeaderComponent={listHeader}
        style={{ flex: 1, backgroundColor: et.background }}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={handleScroll}
        nestedScrollEnabled
        contentContainerStyle={{
          paddingTop: 8,
          paddingBottom: Math.max(insets.bottom, 16) + 120,
        }}
        extraData={`${savedIds.size}-${allFilterId}`}
        {...MARKETPLACE_LIST_PROPS}
      />

      {showBackToTop ? (
        <Pressable
          onPress={handleBackToTop}
          style={{
            position: "absolute",
            top: headerHeight + 58,
            zIndex: 55,
            left: SCREEN_WIDTH / 2 - 64,
            height: 34,
            paddingHorizontal: 14,
            borderRadius: 999,
            backgroundColor: isDark ? colors.surfaceElevated : colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.12,
            shadowRadius: 8,
            elevation: 6,
          }}
        >
          <MaterialIcons name="arrow-upward" size={16} color={colors.icon} />
          <Text
            style={{
              fontFamily: ListifyFonts.medium,
              fontSize: 12,
              color: colors.textPrimary,
            }}
          >
            Back to top
          </Text>
        </Pressable>
      ) : null}

      <EventsFloatingNav
        activeTab={activeNavTab}
        onTabPress={handleFloatingNavPress}
        collapseProgress={navCollapse}
      />
    </View>
  );
}

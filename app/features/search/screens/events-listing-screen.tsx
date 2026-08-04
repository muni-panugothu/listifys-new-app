import { MaterialIcons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "@/lib/safe-router";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  Dimensions,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
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
import type { EventsHubTab } from "@/features/events/data/events-hub-discovery";
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
  FEATURED_EVENTS_DUMMY,
  type EventsExploreCategory,
  type EventsWeekCategory,
  type FeaturedEventDummy,
} from "@/features/events/data/events-discovery";
import { FeaturedProfileCard } from "@/features/home/components/featured-profile-card";
import {
  FEATURED_ARTISTS,
  type FeaturedArtistItem,
} from "@/features/home/data/featured-mock-data";
import { useTabNavigation } from "@/lib/use-tab-navigation";
import { useTheme } from "@/providers/theme-provider";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const H_PAD = 16;
const ARTIST_CARD_WIDTH = SCREEN_WIDTH * 0.48;
const ARTIST_GAP = 14;
const GRID_GAP = 12;
const GRID_CARD_WIDTH = (SCREEN_WIDTH - H_PAD * 2 - GRID_GAP) / 2;

function filterByQuery(events: FeaturedEventDummy[], q: string) {
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
  const filtered = filterByQuery(all, q);
  if (sectionCategoryId === "featured") {
    return filtered.slice(0, 6);
  }
  return filtered.filter((e) => e.category === sectionCategoryId);
}

function applyAllEventsFilter(
  events: FeaturedEventDummy[],
  filterId: EventsAllFilterId,
): FeaturedEventDummy[] {
  switch (filterId) {
    case "all":
    case "tomorrow":
    case "weekend":
    case "under_10km":
      return events;
    case "social":
      return events.filter(
        (e) =>
          e.category === "social" ||
          e.title.toLowerCase().includes("social") ||
          e.venue.toLowerCase().includes("social"),
      );
    default:
      return events.filter((e) => e.category === filterId);
  }
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
  const scrollRef = useRef<ScrollView>(null);
  const filtersAnchorY = useRef(0);
  const lastScrollY = useRef(0);
  const navCollapse = useSharedValue(0);

  const [selectedWeekId, setSelectedWeekId] = useState<string | null>(null);
  const [selectedExploreId, setSelectedExploreId] = useState<string | null>(
    null,
  );
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [savedArtistIds, setSavedArtistIds] = useState<Set<string>>(new Set());
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

  const artists = useMemo(() => {
    if (!query) return FEATURED_ARTISTS;
    return FEATURED_ARTISTS.filter(
      (a) =>
        a.name.toLowerCase().includes(query) ||
        a.subtitle.toLowerCase().includes(query),
    );
  }, [query]);

  const featuredSection = EVENTS_CATEGORY_SECTIONS[0];
  const comedySection = EVENTS_CATEGORY_SECTIONS[1];

  const allEventsFiltered = useMemo(() => {
    const base = filterByQuery(FEATURED_EVENTS_DUMMY, query);
    const filtered = applyAllEventsFilter(base, allFilterId);
    return filtered.length > 0 ? filtered : base;
  }, [allFilterId, query]);

  const eventRows = useMemo(() => {
    const rows: Array<{
      id: string;
      left: FeaturedEventDummy;
      right?: FeaturedEventDummy;
    }> = [];
    for (let i = 0; i < allEventsFiltered.length; i += 2) {
      rows.push({
        id: `row-${allEventsFiltered[i].id}`,
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

  const handleToggleArtistSave = useCallback((id: string) => {
    setSavedArtistIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleWeekSelect = useCallback((cat: EventsWeekCategory) => {
    setSelectedWeekId((prev) => (prev === cat.id ? null : cat.id));
  }, []);

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
    (tab: EventsHubTab) => {
      setHubVisible(false);
      if (tab.id === "home") {
        handleTabPress("home");
        return;
      }
      if (tab.id === "events") {
        setActiveNavTab("events");
      }
    },
    [handleTabPress],
  );

  const handleBackToTop = useCallback(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, []);

  const artistKeyExtractor = useCallback(
    (item: FeaturedArtistItem) => item.id,
    [],
  );

  const renderArtist = useCallback(
    ({ item }: { item: FeaturedArtistItem }) => (
      <FeaturedProfileCard
        id={item.id}
        name={item.name}
        subtitle={item.subtitle}
        avatar={item.avatar}
        stats={item.stats}
        eventDate={item.eventDate}
        cardWidth={ARTIST_CARD_WIDTH}
        isSaved={savedArtistIds.has(item.id)}
        onPress={() => {}}
        onToggleSave={() => handleToggleArtistSave(item.id)}
      />
    ),
    [handleToggleArtistSave, savedArtistIds],
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
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
          backgroundColor: colors.background,
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
            backgroundColor: colors.background,
          }}
        >
          <EventsFilterBar
            selectedId={allFilterId}
            onSelect={setAllFilterId}
          />
        </View>
      ) : null}

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={handleScroll}
        contentContainerStyle={{
          paddingTop: 8,
          paddingBottom: Math.max(insets.bottom, 16) + 120,
        }}
      >
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
          events={eventsForSection(
            featuredSection.categoryId,
            FEATURED_EVENTS_DUMMY,
            query,
          )}
          savedIds={savedIds}
          onToggleSave={handleToggleSave}
          showOffers
        />

        <EventsExploreGrid
          selectedId={selectedExploreId}
          onSelect={handleExploreSelect}
        />

        {artists.length > 0 ? (
          <View style={{ marginTop: 28, marginBottom: 4 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingHorizontal: H_PAD,
              }}
            >
              <Text
                style={{
                  fontFamily: ListifyFonts.bold,
                  fontSize: 22,
                  color: colors.textPrimary,
                  ...(Platform.OS === "android"
                    ? { includeFontPadding: false }
                    : {}),
                }}
              >
                Artists in your District
              </Text>
              <Pressable hitSlop={8}>
                <Text
                  style={{
                    fontFamily: ListifyFonts.medium,
                    fontSize: 12,
                    color: colors.primary,
                  }}
                >
                  See all
                </Text>
              </Pressable>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{
                paddingHorizontal: H_PAD,
                paddingTop: ARTIST_CARD_WIDTH * 0.24,
                paddingBottom: 8,
                gap: ARTIST_GAP,
              }}
              decelerationRate="fast"
              snapToInterval={ARTIST_CARD_WIDTH + ARTIST_GAP}
              snapToAlignment="start"
            >
              {artists.map((item) => (
                <View key={artistKeyExtractor(item)}>
                  {renderArtist({ item })}
                </View>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {comedySection ? (
          <EventsSectionCarousel
            title={comedySection.title}
            events={eventsForSection(
              comedySection.categoryId,
              FEATURED_EVENTS_DUMMY,
              query,
            )}
            savedIds={savedIds}
            onToggleSave={handleToggleSave}
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

        {/* Spacer when sticky clone is showing so content doesn't jump */}
        {filtersSticky ? <View style={{ height: 54 }} /> : null}

        <View style={{ paddingBottom: 8 }}>
          {eventRows.map((row) => (
            <View
              key={row.id}
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
                isSaved={savedIds.has(row.left.id)}
                onPress={() => {}}
                onToggleSave={() => handleToggleSave(row.left.id)}
              />
              {row.right ? (
                <EventsGridCard
                  event={row.right}
                  cardWidth={GRID_CARD_WIDTH}
                  isSaved={savedIds.has(row.right.id)}
                  onPress={() => {}}
                  onToggleSave={() => handleToggleSave(row.right!.id)}
                />
              ) : (
                <View style={{ width: GRID_CARD_WIDTH }} />
              )}
            </View>
          ))}
        </View>
      </ScrollView>

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

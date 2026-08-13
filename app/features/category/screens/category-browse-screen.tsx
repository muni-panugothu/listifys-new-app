import { MaterialIcons } from "@expo/vector-icons";
import { type Href, useRouter } from "@/lib/safe-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ListingItemsGridCard } from "@/components/listing-items-grid-card";
import { PropertyNearbyCard } from "@/features/category/components/property-nearby-card";
import { VoiceSearchModal } from "@/components/voice-search-modal";
import type { CategorySlug } from "@/constants/categories";
import { ListifyFonts, ListifyTypography } from "@/constants/typography";
import { EventListingCard } from "@/features/category/components/event-listing-card";
import { JobListingCard } from "@/features/category/components/job-listing-card";
import { JOBS_APPLY_TEAL, JOBS_PAGE_BG } from "@/features/jobs/data/jobs-discovery";
import type { JobListingExtras } from "@/features/jobs/utils/jobs-formatters";
import {
  fetchCategoryListings,
  toggleSaveListing,
  type ListingItem,
} from "@/features/listing/services/listing-api";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { useDynamicSubcategories } from "@/hooks/use-dynamic-subcategories";
import { getListingDistanceLabel, resolveListingDistanceKm } from "@/lib/listing-distance";
import { buildLocationQueryParams } from "@/lib/location-query-params";
import { useLocale } from "@/providers/locale-provider";
import { useTheme } from "@/providers/theme-provider";
import { useAppSelector } from "@/store/hooks";
import {
  selectLocationCoords,
  selectLocationLabel,
  selectLocationQueryState,
} from "@/store/slices/location-slice";
import { getCurrencyCodeFromCountry, getCurrencySymbol } from "@/lib/currency";
import { MARKETPLACE_LIST_PROPS } from "@/lib/performance/flat-list-config";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const BRAND = "#27BB97";
const GRID_GUTTER = 12;
const GRID_SIDE_PADDING = 16;
const CARD_WIDTH = (SCREEN_WIDTH - GRID_SIDE_PADDING * 2 - GRID_GUTTER) / 2;

const SORT_OPTIONS = [
  { key: "relevance", label: "Popular" },
  { key: "newest", label: "Newest" },
  { key: "price_asc", label: "Low to High" },
  { key: "price_desc", label: "High to Low" },
] as const;

const SPECIAL_DETAIL: Record<string, string> = {
  events: "/event-detail",
  properties: "/property-detail",
  jobs: "/job-detail",
};

const FETCH_TIMEOUT_MS = 8_000;

function formatSalary(listing: ListingItem, isoCountryCode?: string | null): string {
  const salary = (listing as { salary?: { min?: number; max?: number } }).salary;
  const currencyCode = listing.currency ?? getCurrencyCodeFromCountry(isoCountryCode);
  const symbol = getCurrencySymbol(currencyCode);
  if (salary?.min && salary?.max) {
    const fmt = (n: number) => {
      if (n >= 100000) return `${(n / 100000).toFixed(n % 100000 === 0 ? 0 : 1)}L`;
      if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
      return n.toLocaleString("en-IN");
    };
    return `${symbol}${fmt(salary.min)} - ${symbol}${fmt(salary.max)}`;
  }
  if (listing.price) return `${symbol}${Number(listing.price).toLocaleString("en-IN")}`;
  return "Salary not disclosed";
}

function formatEventPrice(price?: number, currency?: string, isoCountryCode?: string | null): string {
  if (!price || price === 0) return "FREE";
  const symbol = getCurrencySymbol(currency ?? getCurrencyCodeFromCountry(isoCountryCode));
  return `${symbol}${Number(price).toLocaleString("en-IN")}`;
}

function sortListings(
  items: ListingItem[],
  sortKey: string,
  options?: {
    userCoords?: { lat: number; lng: number } | null;
    categorySlug?: CategorySlug;
  },
) {
  const copy = [...items];
  if (sortKey === "price_asc") {
    copy.sort((a, b) => Number(a.price ?? 1e12) - Number(b.price ?? 1e12));
  } else if (sortKey === "price_desc") {
    copy.sort((a, b) => Number(b.price ?? 0) - Number(a.price ?? 0));
  } else if (sortKey === "newest") {
    copy.sort((a, b) => {
      const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bt - at;
    });
  } else if (
    sortKey === "relevance" &&
    options?.userCoords &&
    options.categorySlug
  ) {
    copy.sort((a, b) => {
      const da =
        resolveListingDistanceKm(
          {
            _id: a._id,
            category: options.categorySlug,
            distance: a.distance as number | undefined,
            coordinates: a.coordinates,
          },
          options.userCoords,
        ) ?? Number.POSITIVE_INFINITY;
      const db =
        resolveListingDistanceKm(
          {
            _id: b._id,
            category: options.categorySlug,
            distance: b.distance as number | undefined,
            coordinates: b.coordinates,
          },
          options.userCoords,
        ) ?? Number.POSITIVE_INFINITY;
      return da - db;
    });
  }
  return copy;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function buildCalendarGrid(month: Date): (Date | null)[][] {
  const year = month.getFullYear();
  const m = month.getMonth();
  const firstDay = new Date(year, m, 1).getDay();
  const daysInMonth = new Date(year, m + 1, 0).getDate();
  const cells: (Date | null)[] = Array(firstDay).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, m, d));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

type CategoryBrowseScreenProps = {
  categorySlug: CategorySlug;
  initialSubcategory?: string;
};

export function CategoryBrowseScreen({
  categorySlug,
  initialSubcategory,
}: CategoryBrowseScreenProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { isoCountryCode: localeCountryCode } = useLocale();
  const user = useAppSelector((s) => s.auth.user);
  const userCoords = useAppSelector(selectLocationCoords);
  const locationLabel = useAppSelector(selectLocationLabel);
  const locationQueryState = useAppSelector(selectLocationQueryState);
  const hasLocationCoords =
    userCoords.lat != null &&
    userCoords.lng != null;
  const isoCountryCode = (locationQueryState.isoCountryCode ?? localeCountryCode ?? null)?.toUpperCase() ?? null;

  // Subcategories fetched live from the DB so any new subcategory added to
  // the model (or posted by a seller) appears immediately — static list from
  // CATEGORY_MAP is used as fallback while loading or when offline.
  const { subcategories } = useDynamicSubcategories(categorySlug);

  const layout =
    categorySlug === "jobs"
      ? "jobs"
      : categorySlug === "events"
        ? "events"
        : categorySlug === "properties"
          ? "properties"
          : "grid";

  const [searchQuery, setSearchQuery] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [selectedSubcategory, setSelectedSubcategory] = useState(
    initialSubcategory && initialSubcategory !== "All" ? initialSubcategory : "All",
  );
  const [activeSort, setActiveSort] = useState<string>("relevance");
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [sortMenuAnchor, setSortMenuAnchor] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const sortAnchorRef = useRef<View>(null);
  const [listings, setListings] = useState<ListingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [voiceVisible, setVoiceVisible] = useState(false);
  const [selectedDateIndex, setSelectedDateIndex] = useState(0);
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());

  const [calendarDates, setCalendarDates] = useState<Date[]>(() => {
    const now = new Date();
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now);
      d.setDate(now.getDate() + i);
      return d;
    });
  });

  const headerHeight = insets.top + 12 + 52;
  const categoryTabsHeight = 52;
  const countSortBarHeight = layout === "events" ? 0 : 44;
  const eventsTitleHeight = layout === "events" ? 64 : 0;
  const datePickerHeight = layout === "events" ? 96 : 0;
  const stickyOffset =
    headerHeight +
    eventsTitleHeight +
    datePickerHeight +
    categoryTabsHeight +
    countSortBarHeight;

  const loadListings = useCallback(async () => {
    setLoading(true);
    try {
      const hasCoords = hasLocationCoords;

      const baseParams = {
        subcategory: selectedSubcategory === "All" ? undefined : selectedSubcategory,
        search: appliedSearch.trim() || undefined,
        ...buildLocationQueryParams(locationQueryState, { radius: 100 }),
      };

      const res = await Promise.race([
        fetchCategoryListings(categorySlug, baseParams),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("timeout")), FETCH_TIMEOUT_MS);
        }),
      ]);
      let items = res.listings ?? [];

      if (items.length === 0 && hasLocationCoords) {
        const fallback = await fetchCategoryListings(categorySlug, {
          subcategory: selectedSubcategory === "All" ? undefined : selectedSubcategory,
          search: appliedSearch.trim() || undefined,
        });
        items = fallback.listings ?? [];
      }
      setListings(items);
      if (user?.id) {
        const saved = new Set<string>();
        for (const item of items) {
          if (item.savedBy?.includes(user.id)) saved.add(item._id);
        }
        setSavedIds(saved);
      }
    } catch {
      setListings((prev) => (prev.length > 0 ? prev : []));
    } finally {
      setLoading(false);
    }
  }, [
    appliedSearch,
    categorySlug,
    hasLocationCoords,
    locationQueryState,
    selectedSubcategory,
    user?.id,
    userCoords.lat,
    userCoords.lng,
  ]);

  // Fire on subcategory / search changes (screen already mounted)
  useEffect(() => {
    void loadListings();
  }, [loadListings]);

  // Also fire when the screen regains focus (e.g. after posting a new listing),
  // but skip the very first focus because useEffect handles the initial load.
  const isMounted = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (isMounted.current) {
        void loadListings();
      } else {
        isMounted.current = true;
      }
    }, [loadListings]),
  );

  const handleRefresh = useCallback(async () => {
    await loadListings();
  }, [loadListings]);

  const { refreshing, onRefresh } = usePullToRefresh(handleRefresh);

  const displayListings = useMemo(() => {
    let items = sortListings(listings, activeSort, {
      userCoords:
        hasLocationCoords && userCoords.lat != null && userCoords.lng != null
          ? { lat: userCoords.lat, lng: userCoords.lng }
          : null,
      categorySlug,
    });
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      items = items.filter(
        (item) =>
          item.title?.toLowerCase().includes(q) ||
          item.location?.toLowerCase().includes(q) ||
          item.subcategory?.toLowerCase().includes(q),
      );
    }
    return items;
  }, [activeSort, categorySlug, hasLocationCoords, listings, searchQuery, userCoords.lat, userCoords.lng]);

  const openDetail = useCallback(
    (item: ListingItem) => {
      const special = SPECIAL_DETAIL[categorySlug];
      if (special) {
        router.push(`${special}?category=${categorySlug}&id=${item._id}` as Href);
        return;
      }
      router.push(
        `/listing-detail-template?category=${categorySlug}&id=${item._id}` as Href,
      );
    },
    [categorySlug, router],
  );

  const handleToggleSave = useCallback(
    async (id: string) => {
      try {
        const res = await toggleSaveListing(categorySlug, id);
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
    [categorySlug],
  );

  const handleSubmitSearch = useCallback(() => {
    setAppliedSearch(searchQuery.trim());
  }, [searchQuery]);

  const handleVoiceResult = useCallback((text: string) => {
    setSearchQuery(text);
    setAppliedSearch(text);
  }, []);

  const calendarGrid = useMemo(() => buildCalendarGrid(calendarMonth), [calendarMonth]);
  const selectedCalendarDate = calendarDates[selectedDateIndex] ?? calendarDates[0];

  const navigateCalendarMonth = useCallback((dir: number) => {
    setCalendarMonth((prev) => {
      const next = new Date(prev);
      next.setMonth(next.getMonth() + dir);
      return next;
    });
  }, []);

  const onPickCalendarDate = useCallback((date: Date) => {
    const newDates = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(date);
      d.setDate(date.getDate() + i);
      return d;
    });
    setCalendarDates(newDates);
    setSelectedDateIndex(0);
    setCalendarMonth(date);
    setShowCalendar(false);
  }, []);

  const isGridLayout = layout === "grid";

  const keyExtractor = useCallback((item: ListingItem) => item._id, []);

  const renderListItem = useCallback(
    ({ item }: { item: ListingItem }) => {
      if (layout === "jobs") {
        return (
          <JobListingCard
            job={item as JobListingExtras}
            isoCountryCode={isoCountryCode}
            isSaved={savedIds.has(item._id)}
            onPress={() => openDetail(item)}
            onToggleSave={() => handleToggleSave(item._id)}
          />
        );
      }
      if (layout === "events") {
        return (
          <EventListingCard
            event={item}
            priceLabel={formatEventPrice(item.price, item.currency, isoCountryCode)}
            isSaved={savedIds.has(item._id)}
            onPress={() => openDetail(item)}
            onToggleSave={() => handleToggleSave(item._id)}
          />
        );
      }
      if (layout === "properties") {
        const sub = (item.subcategory ?? "").toLowerCase();
        const priceSuffix =
          sub.includes("rent") ||
          sub.includes("room") ||
          sub.includes("paying guest") ||
          sub.includes("pg")
            ? "/Month"
            : "";
        const distanceLabel = hasLocationCoords
          ? getListingDistanceLabel(
              {
                _id: item._id,
                category: categorySlug,
                distance: item.distance as number | undefined,
                coordinates: item.coordinates,
                countryCode: item.countryCode,
                currency: item.currency,
              },
              { lat: userCoords.lat!, lng: userCoords.lng! },
              isoCountryCode,
            )
          : undefined;
        return (
          <PropertyNearbyCard
            title={item.title}
            location={item.location}
            distanceLabel={distanceLabel}
            badge={item.subcategory || "Home"}
            price={item.price ?? null}
            currency={item.currency}
            isoCountryCode={item.countryCode ?? isoCountryCode}
            priceSuffix={priceSuffix}
            image={item.images?.[0]}
            isSaved={savedIds.has(item._id)}
            onPress={() => openDetail(item)}
            onToggleSave={() => handleToggleSave(item._id)}
          />
        );
      }
      const distanceLabel = hasLocationCoords
        ? getListingDistanceLabel(
            {
              _id: item._id,
              category: categorySlug,
              distance: item.distance as number | undefined,
              coordinates: item.coordinates,
              countryCode: item.countryCode,
              currency: item.currency,
            },
            { lat: userCoords.lat!, lng: userCoords.lng! },
            isoCountryCode,
          )
        : undefined;
      return (
        <ListingItemsGridCard
          title={item.title}
          subtitle={item.condition || item.subcategory}
          price={item.price ?? null}
          currency={item.currency}
          isoCountryCode={item.countryCode ?? isoCountryCode}
          image={item.images?.[0]}
          createdAt={item.createdAt}
          width={CARD_WIDTH}
          distanceLabel={distanceLabel}
          isSaved={savedIds.has(item._id)}
          onPress={() => openDetail(item)}
          onToggleSave={() => handleToggleSave(item._id)}
        />
      );
    },
    [categorySlug, handleToggleSave, hasLocationCoords, isoCountryCode, layout, openDetail, savedIds, userCoords.lat, userCoords.lng],
  );

  const listEmptyComponent = useMemo(() => {
    if (loading || refreshing) {
      return (
        <View className="items-center py-20">
          <ActivityIndicator size="large" color={BRAND} />
          <Text
            className="mt-3 text-[14px]"
            style={{ fontFamily: ListifyFonts.regular, color: colors.textSecondary }}
          >
            Loading listings…
          </Text>
        </View>
      );
    }
    return (
      <View className="items-center px-6 py-20">
        <MaterialIcons name="inventory-2" size={56} color={colors.iconMuted} />
        <Text
          className="mt-4 text-[18px]"
          style={{ fontFamily: ListifyFonts.bold, color: colors.textPrimary }}
        >
          No listings found
          {hasLocationCoords && locationLabel && locationLabel !== "Set location"
            ? ` near ${locationLabel.split(",")[0]}`
            : ""}
        </Text>
        <Text
          className="mt-2 text-center text-[14px]"
          style={{ fontFamily: ListifyFonts.regular, color: colors.textSecondary }}
        >
          Try another filter or search term
        </Text>
      </View>
    );
  }, [colors.iconMuted, colors.textPrimary, colors.textSecondary, loading, locationLabel, refreshing]);

  const jobsAccent = layout === "jobs" ? JOBS_APPLY_TEAL : BRAND;

  const toggleSortMenu = useCallback(() => {
    if (sortMenuOpen) {
      setSortMenuOpen(false);
      return;
    }

    sortAnchorRef.current?.measureInWindow((x, y, width, height) => {
      setSortMenuAnchor({ x, y, width, height });
      setSortMenuOpen(true);
    });
  }, [sortMenuOpen]);

  const countSortBar = useMemo(() => {
    if (layout === "events") return null;

    return (
      <View
        className="flex-row items-center justify-between px-4"
        style={{ height: countSortBarHeight }}
      >
        <Text
          style={{
            fontFamily: layout === "jobs" ? ListifyFonts.bold : ListifyFonts.medium,
            fontSize: layout === "jobs" ? 18 : 14,
            color: layout === "jobs" ? colors.textPrimary : colors.textSecondary,
          }}
        >
          {layout === "jobs"
            ? `${displayListings.length} Jobs Found`
            : `${displayListings.length} ${
                layout === "properties"
                  ? displayListings.length === 1
                    ? "Property"
                    : "Properties"
                  : displayListings.length === 1
                    ? "Product"
                    : "Products"
              }`}
        </Text>

        <View ref={sortAnchorRef} collapsable={false}>
          <Pressable
            onPress={toggleSortMenu}
            hitSlop={8}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text
              style={{
                fontFamily: ListifyFonts.bold,
                fontSize: 14,
                color:
                  layout === "properties" || layout === "jobs"
                    ? jobsAccent
                    : colors.textPrimary,
              }}
            >
              {SORT_OPTIONS.find((o) => o.key === activeSort)?.label ?? "Popular"}
            </Text>
            <MaterialIcons
              name={sortMenuOpen ? "keyboard-arrow-up" : "keyboard-arrow-down"}
              size={20}
              color={
                layout === "properties" || layout === "jobs"
                  ? jobsAccent
                  : colors.textPrimary
              }
            />
          </Pressable>
        </View>
      </View>
    );
  }, [
    activeSort,
    colors.textPrimary,
    colors.textSecondary,
    countSortBarHeight,
    displayListings.length,
    jobsAccent,
    layout,
    sortMenuOpen,
    toggleSortMenu,
  ]);

  const itemSeparator = useCallback(
    () => <View style={{ height: layout === "jobs" ? 16 : isGridLayout ? GRID_GUTTER : 12 }} />,
    [isGridLayout, layout],
  );

  const pageBackground =
    layout === "jobs" && !isDark ? JOBS_PAGE_BG : colors.background;

  return (
    <View className="flex-1" style={{ backgroundColor: pageBackground }}>
      <VoiceSearchModal
        visible={voiceVisible}
        onResult={handleVoiceResult}
        onClose={() => setVoiceVisible(false)}
      />
      <View
        className="absolute inset-x-0 top-0 z-50 px-4"
        style={{
          paddingTop: insets.top + 8,
          height: headerHeight,
          backgroundColor: pageBackground,
        }}
      >
        <View className="h-11 flex-row items-center gap-3">
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            className="h-10 w-10 items-center justify-center"
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          >
            <MaterialIcons name="arrow-back-ios" size={20} color={colors.icon} />
          </Pressable>
          <View
            className="h-17 flex-1 flex-row items-center rounded-full border px-4"
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.04,
              shadowRadius: 6,
              elevation: 1,
            }}
          >
            <MaterialIcons name="search" size={22} color={colors.iconMuted} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSubmitEditing={handleSubmitSearch}
              returnKeyType="search"
              placeholder="Search here"
              placeholderTextColor={colors.inputPlaceholder}
              className="ml-3 flex-1 text-[15px]"
              style={{
                fontFamily: ListifyFonts.regular,
                paddingVertical: 0,
                color: colors.textPrimary,
              }}
            />
            {searchQuery.length > 0 ? (
              <Pressable
                onPress={() => {
                  setSearchQuery("");
                  setAppliedSearch("");
                }}
                hitSlop={8}
              >
                <MaterialIcons name="close" size={20} color={colors.iconMuted} />
              </Pressable>
            ) : (
              <Pressable
                onPress={() => setVoiceVisible(true)}
                hitSlop={8}
                style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
              >
                <MaterialIcons name="mic" size={20} color={colors.iconMuted} />
              </Pressable>
            )}
          </View>
        </View>
      </View>

      {layout === "events" ? (
        <View
          className="absolute inset-x-0 z-45 px-4"
          style={{
            top: headerHeight,
            height: eventsTitleHeight,
            backgroundColor: colors.background,
            paddingVertical: 16,
          }}
        >
          <Text
            style={{
              fontFamily: ListifyFonts.bold,
              fontSize: 24,
              lineHeight: 32,
              letterSpacing: -0.02 * 24,
              fontWeight: "700",
              color: colors.textPrimary,
            }}
          >
            Upcoming Events
          </Text>
        </View>
      ) : null}

      {layout === "events" ? (
        <View
          className="absolute inset-x-0 z-44"
          style={{ top: headerHeight + eventsTitleHeight, height: datePickerHeight, backgroundColor: colors.background }}
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: GRID_SIDE_PADDING,
              gap: 8,
              paddingVertical: 12,
            }}
          >
            {calendarDates.map((d, idx) => {
              const isActiveDate = idx === selectedDateIndex;
              const monthLabel = d.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
              const dayLabel = d.getDate().toString();
              return (
                <Pressable
                  key={idx}
                  onPress={() => setSelectedDateIndex(idx)}
                  android_ripple={{ color: "rgba(255,255,255,0.3)", borderless: false, radius: 28 }}
                  className="items-center justify-center rounded-xl"
                  style={{
                    width: 56,
                    height: 72,
                    backgroundColor: isActiveDate ? colors.primary : colors.surface,
                    borderWidth: 1,
                    borderColor: isActiveDate ? colors.primary : colors.borderStrong,
                    shadowColor: colors.primary,
                    shadowOffset: { width: 0, height: isActiveDate ? 4 : 0 },
                    shadowOpacity: isActiveDate ? 0.3 : 0,
                    shadowRadius: isActiveDate ? 8 : 0,
                    elevation: isActiveDate ? 4 : 0,
                  }}
                >
                  <Text
                    className="text-[11px]"
                    style={{
                      fontFamily: ListifyFonts.medium,
                      color: isActiveDate
                        ? "rgba(255,255,255,0.85)"
                        : colors.textSecondary,
                      letterSpacing: 0.5,
                    }}
                  >
                    {monthLabel}
                  </Text>
                  <Text
                    className="text-[22px]"
                    style={{
                      fontFamily: ListifyFonts.bold,
                      color: isActiveDate
                        ? colors.textOnPrimary
                        : colors.textPrimary,
                    }}
                  >
                    {dayLabel}
                  </Text>
                </Pressable>
              );
            })}
            <Pressable
              onPress={() => setShowCalendar(true)}
              style={{ width: 48, alignItems: "center", justifyContent: "center" }}
              hitSlop={8}
            >
              <MaterialIcons name="calendar-month" size={24} color="#27BB97" />
            </Pressable>
          </ScrollView>
        </View>
      ) : null}

      <View
        className="absolute inset-x-0 z-40"
        style={{
          top: headerHeight + eventsTitleHeight + datePickerHeight,
          height: categoryTabsHeight,
          backgroundColor: pageBackground,
        }}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: GRID_SIDE_PADDING,
            paddingVertical: 10,
            gap: 20,
            alignItems: "center",
          }}
        >
          {subcategories.map((chip) => {
            const isActive = selectedSubcategory === chip;
            const activeColor =
              layout === "properties" || layout === "jobs" ? jobsAccent : colors.textPrimary;
            return (
              <Pressable
                key={chip}
                onPress={() => setSelectedSubcategory(chip)}
                style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
              >
                <Text
                  className="text-[22px] tracking-tight"
                  style={{
                    fontFamily: ListifyFonts.bold,
                    color: isActive ? activeColor : colors.textTertiary,
                  }}
                >
                  {chip}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {countSortBar ? (
        <View
          className="absolute inset-x-0 z-39"
          style={{
            top:
              headerHeight +
              eventsTitleHeight +
              datePickerHeight +
              categoryTabsHeight,
            height: countSortBarHeight,
            backgroundColor: pageBackground,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          }}
        >
          {countSortBar}
        </View>
      ) : null}

      <FlatList
        data={displayListings}
        renderItem={renderListItem}
        keyExtractor={keyExtractor}
        numColumns={isGridLayout ? 2 : 1}
        key={`${layout}-${isDark ? "dark" : "light"}`}
        showsVerticalScrollIndicator={false}
        onScrollBeginDrag={() => {
          if (sortMenuOpen) setSortMenuOpen(false);
        }}
        scrollEventThrottle={16}
        {...MARKETPLACE_LIST_PROPS}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[jobsAccent]}
            tintColor={jobsAccent}
            progressViewOffset={stickyOffset}
          />
        }
        contentContainerStyle={{
          paddingTop: stickyOffset + 8,
          paddingBottom: Math.max(insets.bottom, 16) + 24,
          paddingHorizontal: isGridLayout ? GRID_SIDE_PADDING : (layout === "events" ? 0 : 0),
          ...(isGridLayout ? {} : { paddingHorizontal: 16 }),
        }}
        columnWrapperStyle={isGridLayout ? { gap: GRID_GUTTER } : undefined}
        ItemSeparatorComponent={itemSeparator}
        ListEmptyComponent={listEmptyComponent}
      />

      <Modal
        visible={sortMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSortMenuOpen(false)}
      >
        <View style={{ flex: 1 }}>
          <Pressable
            style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
            onPress={() => setSortMenuOpen(false)}
          />
          {sortMenuAnchor ? (
            <View
              style={{
                position: "absolute",
                top: sortMenuAnchor.y + sortMenuAnchor.height + 4,
                right: SCREEN_WIDTH - sortMenuAnchor.x - sortMenuAnchor.width,
                minWidth: 148,
                backgroundColor: colors.surfaceElevated,
                borderRadius: 12,
                paddingVertical: 6,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: isDark ? 0.35 : 0.12,
                shadowRadius: 12,
                elevation: 24,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              {SORT_OPTIONS.map((opt) => {
                const isActive = opt.key === activeSort;
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() => {
                      setActiveSort(opt.key);
                      setSortMenuOpen(false);
                    }}
                    style={({ pressed }) => ({
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                      backgroundColor:
                        pressed || isActive ? colors.surfaceMuted : "transparent",
                    })}
                  >
                    <Text
                      style={{
                        fontFamily: isActive ? ListifyFonts.semiBold : ListifyFonts.regular,
                        fontSize: 13,
                        color: isActive ? jobsAccent : colors.textSecondary,
                      }}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>
      </Modal>

      {/* Calendar Month Picker Modal */}
      <Modal
        visible={showCalendar}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCalendar(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)" }}
          onPress={() => setShowCalendar(false)}
        />
        <View
          style={{
            backgroundColor: colors.surface,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingHorizontal: 20,
            paddingTop: 16,
            paddingBottom: Math.max(insets.bottom, 20),
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            borderTopWidth: 1,
            borderColor: colors.border,
          }}
        >
          {/* Handle bar */}
          <View style={{ alignItems: "center", marginBottom: 16 }}>
            <View
              style={{
                width: 40,
                height: 4,
                borderRadius: 2,
                backgroundColor: colors.borderStrong,
              }}
            />
          </View>

          {/* Month navigation */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <Pressable onPress={() => navigateCalendarMonth(-1)} hitSlop={12} style={{ padding: 4 }}>
              <MaterialIcons name="chevron-left" size={28} color={colors.textPrimary} />
            </Pressable>
            <Text
              style={{
                fontFamily: ListifyFonts.bold,
                fontSize: 18,
                color: colors.textPrimary,
              }}
            >
              {calendarMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </Text>
            <Pressable onPress={() => navigateCalendarMonth(1)} hitSlop={12} style={{ padding: 4 }}>
              <MaterialIcons name="chevron-right" size={28} color={colors.textPrimary} />
            </Pressable>
          </View>

          {/* Day-of-week headers */}
          <View style={{ flexDirection: "row", marginBottom: 8 }}>
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <View key={i} style={{ flex: 1, alignItems: "center" }}>
                <Text
                  style={{
                    fontFamily: ListifyFonts.medium,
                    fontSize: 12,
                    color: colors.textSecondary,
                  }}
                >
                  {d}
                </Text>
              </View>
            ))}
          </View>

          {/* Day grid */}
          {calendarGrid.map((week, wi) => (
            <View key={wi} style={{ flexDirection: "row", marginBottom: 4 }}>
              {week.map((day, di) => {
                const isToday = day ? isSameDay(day, new Date()) : false;
                const isPicked = day ? isSameDay(day, selectedCalendarDate) : false;
                return (
                  <Pressable
                    key={di}
                    onPress={() => day && onPickCalendarDate(day)}
                    style={{ flex: 1, alignItems: "center", paddingVertical: 6 }}
                  >
                    {day ? (
                      <View
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 18,
                          backgroundColor: isPicked
                            ? colors.primary
                            : isToday
                            ? colors.primarySoft
                            : "transparent",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Text
                          style={{
                            fontFamily: ListifyFonts.medium,
                            fontSize: 14,
                            color: isPicked
                              ? colors.textOnPrimary
                              : isToday
                                ? colors.primary
                                : colors.textPrimary,
                          }}
                        >
                          {day.getDate()}
                        </Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      </Modal>
    </View>
  );
}

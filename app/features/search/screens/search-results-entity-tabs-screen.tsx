import { MaterialIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "@/lib/safe-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ListingItemsGridCard } from "@/components/listing-items-grid-card";
import { buildLocationQueryParams } from "@/lib/location-query-params";
import { getListingDistanceLabel } from "@/lib/listing-distance";
import { getCategoryHref } from "@/lib/navigate-to-category";
import { MARKETPLACE_LIST_PROPS } from "@/lib/performance/flat-list-config";
import { TopSaveToast } from "@/components/top-save-toast";
import { VoiceSearchModal } from "@/components/voice-search-modal";
import { QueryChips, type ParsedChip } from "@/features/search/components/query-chips";
import { CATEGORIES, type CategorySlug } from "@/constants/categories";
import { ListifyFonts, ListifyTypography } from "@/constants/typography";
import {
  fetchHomeFeed,
  fetchSavedListings,
  getCachedHomeFeed,
  toggleSaveListing,
} from "@/features/listing/services/listing-api";
import {
  searchListings,
  fetchTrending,
  type SearchResultItem,
  type SearchPagination,
  type ParsedMeta,
} from "@/features/search/services/search-api";
import type { Href } from "@/lib/safe-router";
import { useAppSelector } from "@/store/hooks";
import {
  selectLocationCoords,
  selectLocationQueryState,
  selectHasActionableLocation,
  selectCanShowDistanceOnCards,
} from "@/store/slices/location-slice";
import { useLocale } from "@/providers/locale-provider";
import { useTheme } from "@/providers/theme-provider";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const GRID_GUTTER = 14;
const GRID_SIDE_PADDING = 16;
const CARD_WIDTH = (SCREEN_WIDTH - GRID_SIDE_PADDING * 2 - GRID_GUTTER) / 2;

const CATEGORY_TABS = [
  { key: "all", label: "All" },
  ...CATEGORIES.map((c) => ({ key: c.slug, label: c.name })),
];

function parseEntityParam(value: string | string[] | undefined) {
  const entity = parseQueryParam(value);
  if (entity && CATEGORY_TABS.some((tab) => tab.key === entity)) {
    return entity;
  }
  return "all";
}

const SORT_OPTIONS = [
  { key: "relevance", label: "Relevant" },
  { key: "price_asc", label: "Low to High" },
  { key: "price_desc", label: "High to Low" },
  { key: "nearest", label: "Nearby" },
  { key: "oldest", label: "Oldest" },
  { key: "views", label: "Most Viewed" },
] as const;

function parseQueryParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function sortLocalResults(items: SearchResultItem[], sortKey: string) {
  const copy = [...items];

  if (sortKey === "price_asc") {
    copy.sort(
      (a, b) =>
        Number(a.price ?? Number.MAX_SAFE_INTEGER) -
        Number(b.price ?? Number.MAX_SAFE_INTEGER),
    );
    return copy;
  }

  if (sortKey === "price_desc") {
    copy.sort((a, b) => Number(b.price ?? 0) - Number(a.price ?? 0));
    return copy;
  }

  if (sortKey === "nearest") {
    copy.sort(
      (a, b) =>
        Number(a.distance ?? Number.MAX_SAFE_INTEGER) -
        Number(b.distance ?? Number.MAX_SAFE_INTEGER),
    );
    return copy;
  }

  if (sortKey === "oldest") {
    copy.sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : Number.MAX_SAFE_INTEGER;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    });
    return copy;
  }

  if (sortKey === "views") {
    copy.sort((a, b) => Number(b.views ?? 0) - Number(a.views ?? 0));
    return copy;
  }

  return copy;
}

function mapFeedToResults(
  feedListings: Array<{
    _id: string;
    title: string;
    description?: string;
    price?: number | null;
    currency?: string;
    category?: string;
    subcategory?: string;
    condition?: string;
    location?: string;
    images?: string[];
    brand?: string;
    model?: string;
    sellerName?: string;
    seller?: unknown;
    views?: number;
    status?: string;
    createdAt?: string;
    savedBy?: string[];
    countryCode?: string;
    distance?: number | null;
    coordinates?: unknown;
  }>,
): SearchResultItem[] {
  return feedListings.map((item) => ({
    _id: item._id,
    title: item.title,
    description: item.description,
    price: item.price ?? undefined,
    currency: item.currency,
    category: item.category,
    subcategory: item.subcategory,
    condition: item.condition,
    location: item.location,
    countryCode: item.countryCode,
    distance: item.distance ?? undefined,
    coordinates: item.coordinates,
    images: item.images ?? [],
    brand: typeof item.brand === "string" ? item.brand : undefined,
    model: typeof item.model === "string" ? item.model : undefined,
    sellerName: item.sellerName,
    seller:
      item.seller &&
      typeof item.seller === "object" &&
      "_id" in item.seller &&
      typeof item.seller._id === "string"
        ? {
            _id: item.seller._id,
            name:
              "name" in item.seller && typeof item.seller.name === "string"
                ? item.seller.name
                : undefined,
            profileImage:
              "profileImage" in item.seller && typeof item.seller.profileImage === "string"
                ? item.seller.profileImage
                : undefined,
          }
        : undefined,
    views: item.views,
    status: item.status,
    createdAt: item.createdAt,
    _entity: String((item as { _source?: string })._source ?? item.category ?? "others"),
  }));
}

const FEED_FETCH_TIMEOUT_MS = 10_000;

function applyEntityAndSort(
  items: SearchResultItem[],
  entity: string,
  sortKey: string,
): SearchResultItem[] {
  const filtered =
    entity === "all" ? items : items.filter((item) => item._entity === entity);
  return sortLocalResults(filtered, sortKey);
}

async function fetchHomeFeedWithTimeout(
  limit: number,
  lat?: number | null,
  lng?: number | null,
  countryCode?: string | null,
) {
  return Promise.race([
    fetchHomeFeed({ limit, lat: lat ?? undefined, lng: lng ?? undefined, radius: (lat != null && lng != null) ? 100 : undefined, countryCode: countryCode ?? undefined }),
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("feed_timeout")), FEED_FETCH_TIMEOUT_MS);
    }),
  ]);
}

export function SearchResultsEntityTabsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    q?: string | string[];
    entity?: string | string[];
    title?: string | string[];
    hideTabs?: string | string[];
    countryCode?: string | string[];
  }>();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { isoCountryCode: localeCountryCode } = useLocale();
  const locationCoords = useAppSelector(selectLocationCoords);
  const locationQueryState = useAppSelector(selectLocationQueryState);
  const hasActionableLocation = useAppSelector(selectHasActionableLocation);
  const canShowDistanceOnCards = useAppSelector(selectCanShowDistanceOnCards);
  const paramCountryCode = parseQueryParam(params.countryCode) || null;
  const hasLocationCoords =
    locationCoords.lat != null &&
    locationCoords.lng != null;
  const geoParams = buildLocationQueryParams(locationQueryState, { radius: 100 });
  const isoCountryCode =
    hasLocationCoords
      ? (geoParams.countryCode ?? paramCountryCode ?? null)
      : paramCountryCode;
  const initialEntity = useMemo(
    () => parseEntityParam(params.entity),
    [params.entity],
  );
  /** When opening a single category (e.g. Electronics), hide All/Jobs/Vehicles tabs. */
  const lockedEntity = useMemo(() => {
    const raw = parseQueryParam(params.entity);
    return raw && raw !== "all" ? raw : null;
  }, [params.entity]);
  const hideEntityTabs =
    parseQueryParam(params.hideTabs) === "1" ||
    parseQueryParam(params.hideTabs) === "true";
  const showEntityTabs = !lockedEntity && !hideEntityTabs;
  const [activeEntity, setActiveEntity] = useState(initialEntity);
  const [activeSort, setActiveSort] = useState<string>("relevance");
  const [searchQuery, setSearchQuery] = useState(() => parseQueryParam(params.q));
  const [appliedQuery, setAppliedQuery] = useState(() => parseQueryParam(params.q));
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [pagination, setPagination] = useState<SearchPagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [saveToastVisible, setSaveToastVisible] = useState(false);
  const [saveToastKey, setSaveToastKey] = useState(0);
  const [voiceVisible, setVoiceVisible] = useState(false);
  // AI parsed chips (price, condition, brand, location extracted from query)
  const [parsedChips, setParsedChips] = useState<ParsedChip[]>([]);
  const [trendingSearches, setTrendingSearches] = useState<string[]>([]);

  const headerHeight = insets.top + 12 + 52;
  const categoryTabsHeight = showEntityTabs ? 52 : 0;
  const sortChipsHeight = 52;
  const stickyTopOffset = headerHeight + categoryTabsHeight + sortChipsHeight;

  const handleCategoryTabPress = useCallback(
    (tabKey: string) => {
      if (tabKey === "all") {
        setActiveEntity("all");
        return;
      }
      router.push(getCategoryHref(tabKey as CategorySlug));
    },
    [router],
  );

  const loadSaved = useCallback(async () => {
    try {
      const res = await fetchSavedListings();
      setSavedIds(new Set((res.listings ?? []).map((l) => l._id)));
    } catch {
      // ignore
    }
  }, []);

  const doSearch = useCallback(
    async (opts?: { isRefresh?: boolean }) => {
      const q = appliedQuery.trim();
      const isBrowse = !q;

      if (opts?.isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        if (isBrowse) {
          let mapped: SearchResultItem[] = [];

          // Show cached feed immediately for faster navigation (e.g. Fresh recommendations See all).
          if (!opts?.isRefresh) {
            try {
              const cached = await getCachedHomeFeed();
              if (cached?.data?.categories) {
                const cachedListings = Object.values(cached.data.categories).flatMap(
                  (cat) => cat.listings ?? [],
                );
                const cachedMapped = mapFeedToResults(cachedListings);
                const sortedCached = applyEntityAndSort(
                  cachedMapped,
                  activeEntity,
                  activeSort,
                );
                setResults(sortedCached);
                setParsedChips([]);
                setPagination({
                  total: sortedCached.length,
                  page: 1,
                  pages: 1,
                  limit: 50,
                });
              }
            } catch {
              // ignore cache read errors
            }
          }

          try {
            const feed = await fetchHomeFeedWithTimeout(
              60,
              geoParams.lat,
              geoParams.lng,
              isoCountryCode ?? undefined,
            );
            const feedListings = feed?.categories
              ? Object.values(feed.categories).flatMap((cat) => cat.listings ?? [])
              : [];
            mapped = mapFeedToResults(feedListings);
          } catch {
            mapped = [];
          }

          const sorted = applyEntityAndSort(mapped, activeEntity, activeSort);
          setResults(sorted);
          setParsedChips([]);
          setPagination({
            total: sorted.length,
            page: 1,
            pages: 1,
            limit: 50,
          });
          // Load trending when browsing without a query
          fetchTrending().then((t) => {
            if (t.trending.length > 0) setTrendingSearches(t.trending);
          }).catch(() => {});
          return;
        }

        const res = await searchListings({
          q,
          entity: activeEntity === "all" ? undefined : activeEntity,
          sort: activeSort as
            | "relevance"
            | "price_asc"
            | "price_desc"
            | "nearest"
            | "oldest"
            | "views",
          page: 1,
          limit: 50,
          ...geoParams,
          countryCode: isoCountryCode ?? undefined,
        });

        // Smart entity auto-detection: if server detected a single entity from
        // the query (e.g. "bike" → vehicles) and user hasn't manually picked a
        // tab yet, automatically switch to that entity tab.
        if (res.detectedEntity && activeEntity === "all" && !lockedEntity) {
          setActiveEntity(res.detectedEntity);
        }

        const effectiveEntity = (res.detectedEntity && activeEntity === "all" && !lockedEntity)
          ? res.detectedEntity
          : activeEntity;

        const items = res.results || [];
        setResults(applyEntityAndSort(items, effectiveEntity, activeSort));
        setPagination(res.pagination || null);
        // Store AI-parsed chips from server response
        const meta = (res as unknown as { parsed?: ParsedMeta }).parsed;
        if (meta?.chips && meta.chips.length > 0) {
          setParsedChips(meta.chips as ParsedChip[]);
        } else {
          setParsedChips([]);
        }
      } catch {
        setResults((prev) =>
          prev.length > 0 ? applyEntityAndSort(prev, activeEntity, activeSort) : [],
        );
        setPagination(null);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [
      appliedQuery,
      activeEntity,
      activeSort,
      hasLocationCoords,
      geoParams,
      isoCountryCode,
    ],
  );

  useEffect(() => {
    void loadSaved();
  }, [loadSaved]);

  useEffect(() => {
    if (lockedEntity) {
      setActiveEntity(lockedEntity);
      return;
    }
    setActiveEntity(initialEntity);
  }, [initialEntity, lockedEntity]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void doSearch();
    }, 350);
    return () => clearTimeout(timer);
  }, [doSearch]);

  const handleRefresh = useCallback(() => {
    void loadSaved();
    doSearch({ isRefresh: true });
  }, [doSearch, loadSaved]);

  const handleSubmitSearch = useCallback(() => {
    setAppliedQuery(searchQuery.trim());
  }, [searchQuery]);

  const handleVoiceResult = useCallback((text: string) => {
    setSearchQuery(text);
    setAppliedQuery(text);
  }, []);

  /** Stream voice partial transcripts directly into the search field. */
  const handleVoicePartial = useCallback((partial: string) => {
    setSearchQuery(partial);
  }, []);

  /** Remove a single AI chip and re-run search without that filter */
  const handleRemoveChip = useCallback((chip: ParsedChip) => {
    setParsedChips((prev) => prev.filter((c) => c.key !== chip.key));
  }, []);

  /** Tap a trending search suggestion */
  const handleTrendingTap = useCallback((term: string) => {
    setSearchQuery(term);
    setAppliedQuery(term);
  }, []);

  const openDetail = useCallback(
    (item: SearchResultItem) => {
      const cat = item._entity;
      const specialRoutes = {
        events: "/event-detail",
        properties: "/property-detail",
        jobs: "/job-detail",
        services: "/service-detail",
      } as const;
      const specialRoute = specialRoutes[cat as keyof typeof specialRoutes];
      if (specialRoute) {
        router.push({
          pathname: specialRoute,
          params: { category: cat, id: item._id },
        });
      } else {
        router.push({
          pathname: "/listing-detail-template",
          params: { category: cat, id: item._id },
        });
      }
    },
    [router],
  );

  const showSaveToast = useCallback(() => {
    setSaveToastKey((k) => k + 1);
    setSaveToastVisible(true);
  }, []);

  const handleToggleSave = useCallback(
    async (item: SearchResultItem) => {
      let wasSaved = false;

      setSavedIds((prev) => {
        wasSaved = prev.has(item._id);
        const next = new Set(prev);
        if (wasSaved) next.delete(item._id);
        else next.add(item._id);
        return next;
      });

      if (!wasSaved) {
        showSaveToast();
      }

      try {
        const res = await toggleSaveListing(item._entity as CategorySlug, item._id);
        setSavedIds((prev) => {
          const next = new Set(prev);
          if (res.saved) next.add(item._id);
          else next.delete(item._id);
          return next;
        });
      } catch {
        setSavedIds((prev) => {
          const next = new Set(prev);
          if (wasSaved) next.add(item._id);
          else next.delete(item._id);
          return next;
        });
      }
    },
    [showSaveToast],
  );

  const displayResults = useMemo(() => {
    const liveQ = searchQuery.trim().toLowerCase();
    let list = results;

    if (liveQ && !appliedQuery.trim()) {
      list = list.filter(
        (item) =>
          item.title?.toLowerCase().includes(liveQ) ||
          item.location?.toLowerCase().includes(liveQ) ||
          item.condition?.toLowerCase().includes(liveQ),
      );
    }

    return sortLocalResults(list, activeSort);
  }, [results, searchQuery, appliedQuery, activeSort]);

  const renderResultCard = useCallback(
    ({ item }: { item: SearchResultItem }) => {
      const distanceLabel = canShowDistanceOnCards ? getListingDistanceLabel(
        {
          _id: item._id,
          category: item._entity ?? item.category,
          distance: item.distance,
          coordinates: item.coordinates,
          countryCode: item.countryCode,
          currency: item.currency,
        },
        { lat: locationCoords.lat!, lng: locationCoords.lng! },
        isoCountryCode,
      ) : undefined;
      const metaSubtitle = [
        item.condition,
        item.subcategory,
        !distanceLabel ? item.location : null,
      ]
        .filter(Boolean)
        .join(" · ");

      return (
        <View style={{ width: CARD_WIDTH, marginBottom: GRID_GUTTER }}>
          <ListingItemsGridCard
            width={CARD_WIDTH}
            title={item.title}
            subtitle={metaSubtitle || undefined}
            price={item.price}
            currency={item.currency}
            isoCountryCode={item.countryCode ?? isoCountryCode}
            image={item.images?.[0]}
            createdAt={item.createdAt}
            distanceLabel={distanceLabel}
            isSaved={savedIds.has(item._id)}
            onPress={() => openDetail(item)}
            onToggleSave={() => handleToggleSave(item)}
          />
        </View>
      );
    },
    [handleToggleSave, openDetail, savedIds, canShowDistanceOnCards, locationCoords.lat, locationCoords.lng, isoCountryCode],
  );

  const resultKeyExtractor = useCallback(
    (item: SearchResultItem) => `${item._entity}_${item._id}`,
    [],
  );

  const renderEmptyState = useCallback(() => {
    if (loading) {
      return (
        <View className="items-center py-20">
          <ActivityIndicator size="large" color="#27BB97" />
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
          className="mt-4 text-center text-[18px]"
          style={{ fontFamily: ListifyFonts.bold, color: colors.textPrimary }}
        >
          No listings found
          {hasActionableLocation && locationQueryState.label
            ? ` near ${locationQueryState.label.split(",")[0]}`
            : ""}
        </Text>
        <Text
          className="mt-2 text-center text-[14px]"
          style={{ fontFamily: ListifyFonts.regular, color: colors.textSecondary }}
        >
          Try another filter or search term
        </Text>
        {trendingSearches.length > 0 ? (
          <View className="mt-6 w-full">
            <Text
              className="mb-3 text-center text-[13px]"
              style={{ fontFamily: ListifyFonts.medium, color: colors.textSecondary }}
            >
              Trending searches
            </Text>
            <View className="flex-row flex-wrap justify-center gap-2">
              {trendingSearches.slice(0, 8).map((term) => (
                <Pressable
                  key={term}
                  onPress={() => handleTrendingTap(term)}
                  className="rounded-full px-4 py-2"
                  style={{
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: colors.surface,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: ListifyFonts.regular,
                      fontSize: 13,
                      color: colors.textPrimary,
                    }}
                  >
                    {term}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
      </View>
    );
  }, [colors.iconMuted, colors.border, colors.surface, colors.textPrimary, colors.textSecondary, handleTrendingTap, hasActionableLocation, loading, locationQueryState.label, trendingSearches]);

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <VoiceSearchModal
        visible={voiceVisible}
        onResult={handleVoiceResult}
        onPartialResult={handleVoicePartial}
        onClose={() => setVoiceVisible(false)}
      />
      {saveToastVisible ? (
        <TopSaveToast
          key={saveToastKey}
          visible
          message="Item saved"
          onHidden={() => setSaveToastVisible(false)}
        />
      ) : null}

      {/* Header: Back + home-style search */}
      <View
        className="absolute inset-x-0 top-0 z-50 px-4"
        style={{
          paddingTop: insets.top + 8,
          height: headerHeight,
          backgroundColor: colors.background,
        }}
      >
        <View className="h-11 flex-row items-center gap-3">
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          >
            <Text
              className="text-[17px]"
              style={{ fontFamily: ListifyFonts.semiBold, color: colors.primary }}
            >
              Back
            </Text>
          </Pressable>

          <View
            className="h-11 flex-1 flex-row items-center rounded-full border px-4"
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: isDark ? 0.2 : 0.04,
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
                  setAppliedQuery("");
                }}
                hitSlop={8}
                style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
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

      {/* Sticky category tabs */}
      {showEntityTabs ? (
      <View
        className="absolute inset-x-0 z-40"
        style={{
          top: headerHeight,
          height: categoryTabsHeight,
          backgroundColor: colors.background,
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
          {CATEGORY_TABS.map((tab) => {
            const isActive = tab.key === activeEntity;
            return (
              <Pressable
                key={tab.key}
                onPress={() => handleCategoryTabPress(tab.key)}
                style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
              >
                <Text
                  className="text-[22px] tracking-tight"
                  style={{
                    fontFamily: ListifyFonts.bold,
                    color: isActive ? colors.textPrimary : colors.textTertiary,
                  }}
                >
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
      ) : null}

      {/* Sticky sort / filter chips */}
      <View
        className="absolute inset-x-0 z-39"
        style={{
          top: headerHeight + categoryTabsHeight,
          height: sortChipsHeight,
          backgroundColor: colors.background,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: GRID_SIDE_PADDING,
            gap: 8,
            alignItems: "center",
            paddingVertical: 8,
          }}
        >
          {SORT_OPTIONS.map((opt) => {
            const isActive = opt.key === activeSort;
            return (
              <Pressable
                key={opt.key}
                onPress={() => setActiveSort(opt.key)}
                className="rounded-full px-3.5 py-2"
                style={{
                  backgroundColor: isActive ? colors.primarySoft : colors.surface,
                  borderWidth: 1,
                  borderColor: isActive ? colors.primarySoftStrong : colors.border,
                }}
              >
                <Text
                  className="text-[12px]"
                  style={{
                    fontFamily: ListifyFonts.medium,
                    color: isActive ? colors.primary : colors.textSecondary,
                  }}
                >
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}

          <Pressable
            onPress={() =>
              router.push({
                pathname: "/nearby-map-view-bottom-sheet",
                params: { q: searchQuery },
              } as Href)
            }
            className="flex-row items-center gap-1 rounded-full px-3.5 py-2"
            style={{
              borderWidth: 1,
              borderColor: colors.primarySoftStrong,
              backgroundColor: colors.surface,
            }}
          >
            <MaterialIcons name="map" size={15} color={colors.primary} />
            <Text
              className="text-[12px]"
              style={{ fontFamily: ListifyFonts.medium, color: colors.primary }}
            >
              Map
            </Text>
          </Pressable>
        </ScrollView>
      </View>

      <FlatList
        data={displayResults}
        numColumns={2}
        keyExtractor={resultKeyExtractor}
        renderItem={renderResultCard}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        {...MARKETPLACE_LIST_PROPS}
        columnWrapperStyle={{
          paddingHorizontal: GRID_SIDE_PADDING,
          justifyContent: "space-between",
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={["#27BB97"]}
            tintColor="#27BB97"
            progressViewOffset={stickyTopOffset}
          />
        }
        contentContainerStyle={{
          paddingTop: stickyTopOffset + 8,
          paddingBottom: Math.max(insets.bottom, 16) + 24,
          flexGrow: displayResults.length === 0 ? 1 : undefined,
        }}
        ListHeaderComponent={
          <>
            {parsedChips.length > 0 ? (
              <QueryChips chips={parsedChips} onRemove={handleRemoveChip} />
            ) : null}

            {refreshing && displayResults.length > 0 ? (
              <View className="mb-3 items-center">
                <ActivityIndicator size="small" color="#27BB97" />
              </View>
            ) : null}
          </>
        }
        ListEmptyComponent={renderEmptyState}
        ListFooterComponent={
          pagination && displayResults.length > 0 ? (
            <Text
              className="mt-2 text-center text-[12px]"
              style={[ListifyTypography.label, { marginBottom: 8, color: colors.textSecondary }]}
            >
              {displayResults.length} listing{displayResults.length === 1 ? "" : "s"}
            </Text>
          ) : null
        }
      />
    </View>
  );
}

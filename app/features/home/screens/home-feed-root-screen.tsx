import { MaterialIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { type Href, useFocusEffect, useRouter } from "@/lib/safe-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    AppState,
    Dimensions,
    FlatList,
    Modal,
    Platform,
    Pressable,
    RefreshControl,
    ScrollView,
    Text,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ListingItemsGridCard, getListingGridCarouselHeight } from "@/components/listing-items-grid-card";
import { JobListingCard } from "@/features/category/components/job-listing-card";
import type { JobListingExtras } from "@/features/jobs/utils/jobs-formatters";
import { HomeServiceDetailCard } from "@/features/home/components/home-service-detail-card";
import {
  ExploreNearYouCard,
} from "@/features/home/components/explore-near-you-card";
import {
  FeaturedProfileCard,
} from "@/features/home/components/featured-profile-card";
import { HomeExploreCategoryCard } from "@/features/home/components/home-explore-category-card";
import {
  HomeSpotlightCarousel,
  type HomeSpotlightItem,
} from "@/features/home/components/home-spotlight-carousel";
import {
  type ExploreNearYouItem,
  type FeaturedArtistItem,
} from "@/features/home/data/featured-mock-data";
import { listingToExploreNearYouItem } from "@/features/home/utils/nearby-events";
import { fetchUpcomingEvents } from "@/features/events/services/events-api";
import { buildEventDetailParams } from "@/features/events/utils/event-detail-helpers";
import { HOME_EXPLORE_CATEGORIES } from "@/features/home/data/home-explore-categories";
import { ListifyFonts, ListifyTypography } from "@/constants/typography";
import { getUnreadCount as getNotificationUnreadCount } from "@/features/auth/services/auth-api";
import { subscribeNotificationUnreadAdjust } from "@/lib/notification-unread-bus";
import { getUnreadCount as getChatUnreadCount } from "@/features/messaging/services/chat-api";
import {
  fetchCategoryListings,
  fetchHomeFeed,
  fetchServiceListings,
  getCachedHomeFeed,
  getRecentlyViewed,
  toggleSaveListing,
  type FeedResponse,
  type ListingItem,
  type RecentlyViewedItem,
} from "@/features/listing/services/listing-api";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { useHomeNotificationPrompt } from "@/hooks/use-home-notification-prompt";
import { ProfileAvatarImage } from "@/components/profile-avatar-image";
import { Image } from "@/lib/nativewind-interop";
import { useLocale } from "@/providers/locale-provider";
import { useTheme } from "@/providers/theme-provider";
import { filterOutOwnListings, getListingSellerId, isOwnListing } from "@/lib/is-own-listing";
import { buildListingChatHref } from "@/lib/listing-chat";
import { showErrorToast } from "@/lib/toast";
import { useProtectedNavigation } from "@/lib/use-protected-navigation";
import { formatPrice } from "@/lib/currency";
import { resolveListingDistanceKm, getListingDistanceLabel } from "@/lib/listing-distance";
import {
  ensureDeviceLocationAccess,
  extractCityFromLocationLabel,
} from "@/lib/location-service";
import { useTabNavigation } from "@/lib/use-tab-navigation";
import { HORIZONTAL_CAROUSEL_PROPS } from "@/lib/performance/horizontal-list-config";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { selectIsAppOffline } from "@/store/selectors";
import { fetchProfile } from "@/store/slices/auth-slice";
import {
  refreshDeviceLocation,
  useCurrentDeviceLocation,
  selectLocationCoords,
  selectLocationLabel,
  selectIsoCountryCode,
  selectCanShowDistanceOnCards,
  selectLocationSource,
  setProfileFallbackLocation,
} from "@/store/slices/location-slice";
import { clearSlowRequestSignal, reportSlowRequest } from "@/store/slices/network-slice";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const GRID_CARD_WIDTH = (SCREEN_WIDTH - 16 * 2 - 14) / 2;
const RECENTLY_VIEWED_ROW_HEIGHT = getListingGridCarouselHeight(GRID_CARD_WIDTH) + 8;
const SLOW_HOME_FEED_MS = 3500;
const SELL_BANNER_CAMERA_IMAGE =
  "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=500&q=80";
const EXPLORE_GAP = 8;
const EXPLORE_ROW_GAP = 6;
const EXPLORE_H_PAD = 16;
const NEARBY_EVENTS_STALE_MS = 60_000;
const NEARBY_SERVICES_STALE_MS = 60_000;
const NEARBY_JOBS_STALE_MS = 60_000;
const HOME_SERVICES_LIMIT = 4;
const HOME_JOBS_LIMIT = 4;
const SERVICE_CARD_WIDTH = Math.round(SCREEN_WIDTH * 0.86);
const SERVICE_CARD_GAP = 14;
const JOB_CARD_WIDTH = Math.round(SCREEN_WIDTH * 0.86);
const JOB_CARD_GAP = 14;
/** Two-row horizontal Explore — marketplace categories. */
const EXPLORE_CARD_W = Math.round(SCREEN_WIDTH * 0.28);
/** Card body only — icon overflow sits above this. */
const EXPLORE_CARD_H = Math.round(EXPLORE_CARD_W * 0.78);
/** Pair categories into vertical columns for a 2-row horizontal scroller. */
function chunkExploreColumns<T>(items: T[], rows = 2): T[][] {
  const columns: T[][] = [];
  for (let i = 0; i < items.length; i += rows) {
    columns.push(items.slice(i, i + rows));
  }
  return columns;
}

function splitHomeLocationLabel(label: string) {
  const trimmed = label?.trim() || "Set location";
  if (trimmed === "Set location" || trimmed.startsWith("Detecting")) {
    return { primary: trimmed, secondary: "" };
  }
  const parts = trimmed
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length <= 1) {
    return { primary: parts[0] ?? trimmed, secondary: "" };
  }
  return {
    primary: parts[0],
    secondary: parts.slice(1).join(", "),
  };
}

type FreshRecommendationItem = {
  id: string;
  title: string;
  price: number | null;
  currency?: string;
  image: string;
  category: string;
  createdAt?: string;
  distanceLabel?: string;
};

function buildSavedIds(feedData: FeedResponse | null, userId?: string | null) {
  const ids = new Set<string>();

  if (!feedData?.categories || !userId) {
    return ids;
  }

  for (const category of Object.values(feedData.categories)) {
    for (const listing of category.listings ?? []) {
      if (listing.savedBy?.includes(userId)) {
        ids.add(listing._id);
      }
    }
  }

  return ids;
}

export function HomeFeedRootScreen() {
  const router = useRouter();
  useHomeNotificationPrompt();
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const { colors, isDark } = useTheme();
  const { isoCountryCode: localeCountryCode } = useLocale();
  const user = useAppSelector((s) => s.auth.user);
  const isAuthenticated = useAppSelector((s) => s.auth.isAuthenticated);
  const sessionHydrated = useAppSelector((s) => s.auth.sessionHydrated);
  const isOffline = useAppSelector(selectIsAppOffline);
  const displayLocation = useAppSelector(selectLocationLabel);
  const locationCoords = useAppSelector(selectLocationCoords);
  const isoCountryCode = useAppSelector(selectIsoCountryCode);
  const locationSource = useAppSelector(selectLocationSource);
  const locationHydrated = useAppSelector((s) => s.location.hydrated);
  const [feedData, setFeedData] = useState<FeedResponse | null>(null);
  const [isUsingCachedFeed, setIsUsingCachedFeed] = useState(false);
  const [recentlyViewed, setRecentlyViewed] = useState<RecentlyViewedItem[]>([]);
  const [notificationUnreadCount, setNotificationUnreadCount] = useState(0);
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [nearbyMusicEvents, setNearbyMusicEvents] = useState<ListingItem[]>([]);
  const [nearbyServices, setNearbyServices] = useState<ListingItem[]>([]);
  const [nearbyJobs, setNearbyJobs] = useState<ListingItem[]>([]);
  const [savedJobIds, setSavedJobIds] = useState<Set<string>>(new Set());
  const [showLoginSheet, setShowLoginSheet] = useState(false);
  const { navigateProtected } = useProtectedNavigation();
  const locationPromptAttempted = useRef(false);
   // Apply location filter when user has a valid location (GPS/manual) or when the user is in the US.
   const hasValidLocation = locationCoords.lat != null && locationCoords.lng != null;
   const effectiveCountryCode = (isoCountryCode ?? localeCountryCode ?? null)?.toUpperCase() ?? null;
   const shouldApplyLocationFilter = hasValidLocation || effectiveCountryCode === "US";
  const canShowDistanceOnCards = useAppSelector(selectCanShowDistanceOnCards);

  useEffect(() => {
    if (isAuthenticated) {
      setShowLoginSheet(false);
    }
  }, [isAuthenticated]);

  const applyFeedSnapshot = useCallback(
    (response: FeedResponse, options?: { source?: "cache" | "live" }) => {
      setFeedData(response);
      setSavedIds(buildSavedIds(response, user?.id));
      if (options?.source) {
        setIsUsingCachedFeed(options.source === "cache");
      }
    },
    [user?.id],
  );

  // Route to the correct detail screen based on category
  const SPECIAL_DETAIL_ROUTES: Record<string, string> = {
    events: "/event-detail",
    properties: "/property-detail",
    jobs: "/job-detail",
    services: "/service-detail",
  };
  const pushToDetail = useCallback((cat: string, id: string) => {
    const specialRoute = SPECIAL_DETAIL_ROUTES[cat];
    if (specialRoute) {
      router.push(`${specialRoute}?id=${id}&category=${cat}` as Href);
    } else {
      router.push(`/listing-detail-template?category=${cat}&id=${id}` as Href);
    }
  }, [router]);

  // Flatten feed; exclude current user's listings from recommendations
  const allListings: ListingItem[] = useMemo(() => {
    const flat = feedData?.categories
      ? Object.values(feedData.categories).flatMap((cat) => cat.listings ?? [])
      : [];
    return filterOutOwnListings(flat, user?.id);
  }, [feedData, user?.id]);

  const loadFeed = useCallback(
    async (options?: { allowCacheFallback?: boolean }) => {
      const startedAt = Date.now();
      try {
        let feedParams: any = { limit: 12 };
        if (shouldApplyLocationFilter) {
          const hasCoords = locationCoords.lat != null && locationCoords.lng != null;
          const isRealLabel =
            Boolean(locationCoords.label) &&
            locationCoords.label !== "Set location" &&
            !locationCoords.label.startsWith("Detecting");
          const locationText = !hasCoords && isRealLabel
            ? extractCityFromLocationLabel(locationCoords.label) ?? locationCoords.label
            : undefined;
          feedParams = {
            ...feedParams,
            lat: hasCoords ? locationCoords.lat : undefined,
            lng: hasCoords ? locationCoords.lng : undefined,
            radius: hasCoords ? 100 : undefined,
            location: locationText,
            countryCode: effectiveCountryCode ?? undefined,
          };
        } else {
          // No location picked � show listings from all countries (price tags only).
          feedParams = { limit: 12 };
        }
        const res = await fetchHomeFeed(feedParams);
        const duration = Date.now() - startedAt;
        if (duration >= SLOW_HOME_FEED_MS) {
          dispatch(reportSlowRequest(duration));
        } else {
          dispatch(clearSlowRequestSignal());
        }
        applyFeedSnapshot(res, { source: "live" });
      } catch {
        const duration = Date.now() - startedAt;
        if (duration >= SLOW_HOME_FEED_MS) {
          dispatch(reportSlowRequest(duration));
        } else {
          dispatch(clearSlowRequestSignal());
        }
        if (options?.allowCacheFallback === false) {
          return;
        }
        const cached = await getCachedHomeFeed();
        if (cached) {
          applyFeedSnapshot(cached.data, { source: "cache" });
        }
      }
    },
    [
      applyFeedSnapshot,
      dispatch,
      effectiveCountryCode,
      locationCoords.label,
      locationCoords.lat,
      locationCoords.lng,
      shouldApplyLocationFilter,
    ]
  );

  const loadNearbyMusicEvents = useCallback(async (opts?: { force?: boolean }) => {
    if (isOffline) return;
    try {
      const hasCoords =
        locationCoords.lat != null && locationCoords.lng != null;
      const res = await fetchUpcomingEvents(
        {
          limit: 12,
          sort: hasCoords ? "nearest" : "newest",
          countryCode: effectiveCountryCode ?? undefined,
          ...(hasCoords
            ? {
                lat: locationCoords.lat ?? undefined,
                lng: locationCoords.lng ?? undefined,
                radius: 50,
              }
            : {}),
          ...(locationCoords.label &&
          locationCoords.label !== "Set location" &&
          !locationCoords.label.startsWith("Detecting")
            ? { location: extractCityFromLocationLabel(locationCoords.label) ?? locationCoords.label }
            : {}),
        },
        { force: opts?.force },
      );
      setNearbyMusicEvents(
        filterOutOwnListings(res.listings ?? [], user?.id),
      );
    } catch {
      setNearbyMusicEvents([]);
    }
  }, [
    effectiveCountryCode,
    isOffline,
    locationCoords.label,
    locationCoords.lat,
    locationCoords.lng,
    user?.id,
  ]);

  const loadNearbyServices = useCallback(async () => {
    if (isOffline) return;
    try {
      const hasCoords =
        locationCoords.lat != null && locationCoords.lng != null;
      const locationText =
        locationCoords.label &&
        locationCoords.label !== "Set location" &&
        !locationCoords.label.startsWith("Detecting")
          ? extractCityFromLocationLabel(locationCoords.label) ??
            locationCoords.label
          : undefined;

      const pickItems = (listings: ListingItem[]) =>
        filterOutOwnListings(listings ?? [], user?.id).slice(
          0,
          HOME_SERVICES_LIMIT,
        );

      let items: ListingItem[] = [];

      if (hasCoords) {
        const geoRes = await fetchServiceListings({
          limit: HOME_SERVICES_LIMIT,
          sort: "-createdAt",
          countryCode: effectiveCountryCode ?? undefined,
          lat: locationCoords.lat ?? undefined,
          lng: locationCoords.lng ?? undefined,
          radius: 100,
          location: locationText,
        });
        items = pickItems(geoRes.listings);
      }

      if (items.length === 0) {
        const scopedRes = await fetchServiceListings({
          limit: HOME_SERVICES_LIMIT,
          sort: "-createdAt",
          countryCode: effectiveCountryCode ?? undefined,
          location: locationText,
        });
        items = pickItems(scopedRes.listings);
      }

      if (items.length === 0) {
        const latestRes = await fetchServiceListings({
          limit: HOME_SERVICES_LIMIT,
          sort: "-createdAt",
        });
        items = pickItems(latestRes.listings);
      }

      setNearbyServices(items);
    } catch {
      setNearbyServices([]);
    }
  }, [
    effectiveCountryCode,
    isOffline,
    locationCoords.label,
    locationCoords.lat,
    locationCoords.lng,
    user?.id,
  ]);

  const loadNearbyJobs = useCallback(async () => {
    if (isOffline) return;
    try {
      const hasCoords =
        locationCoords.lat != null && locationCoords.lng != null;
      const locationText =
        locationCoords.label &&
        locationCoords.label !== "Set location" &&
        !locationCoords.label.startsWith("Detecting")
          ? extractCityFromLocationLabel(locationCoords.label) ??
            locationCoords.label
          : undefined;

      const pickItems = (listings: ListingItem[]) =>
        filterOutOwnListings(listings ?? [], user?.id).slice(
          0,
          HOME_JOBS_LIMIT,
        );

      let items: ListingItem[] = [];

      if (hasCoords) {
        const geoRes = await fetchCategoryListings("jobs", {
          limit: HOME_JOBS_LIMIT,
          sort: "newest",
          countryCode: effectiveCountryCode ?? undefined,
          lat: locationCoords.lat ?? undefined,
          lng: locationCoords.lng ?? undefined,
          radius: 100,
          location: locationText,
        });
        items = pickItems(geoRes.listings);
      }

      if (items.length === 0) {
        const scopedRes = await fetchCategoryListings("jobs", {
          limit: HOME_JOBS_LIMIT,
          sort: "newest",
          countryCode: effectiveCountryCode ?? undefined,
          location: locationText,
        });
        items = pickItems(scopedRes.listings);
      }

      if (items.length === 0) {
        const latestRes = await fetchCategoryListings("jobs", {
          limit: HOME_JOBS_LIMIT,
          sort: "newest",
        });
        items = pickItems(latestRes.listings);
      }

      setNearbyJobs(items);
      if (user?.id) {
        const saved = new Set<string>();
        for (const item of items) {
          if (item.savedBy?.includes(user.id)) saved.add(item._id);
        }
        setSavedJobIds(saved);
      }
    } catch {
      setNearbyJobs([]);
    }
  }, [
    effectiveCountryCode,
    isOffline,
    locationCoords.label,
    locationCoords.lat,
    locationCoords.lng,
    user?.id,
  ]);

  useEffect(() => {
    if (!sessionHydrated || isOffline) return;
    void loadNearbyMusicEvents();
    void loadNearbyServices();
    void loadNearbyJobs();
  }, [isOffline, loadNearbyJobs, loadNearbyMusicEvents, loadNearbyServices, sessionHydrated]);

  const lastNearbyFetchAtRef = useRef(0);
  const lastNearbyServicesFetchAtRef = useRef(0);
  const lastNearbyJobsFetchAtRef = useRef(0);

  useFocusEffect(
    useCallback(() => {
      if (isOffline) return;
      const now = Date.now();
      if (now - lastNearbyFetchAtRef.current >= NEARBY_EVENTS_STALE_MS) {
        lastNearbyFetchAtRef.current = now;
        void loadNearbyMusicEvents();
      }
      if (now - lastNearbyServicesFetchAtRef.current >= NEARBY_SERVICES_STALE_MS) {
        lastNearbyServicesFetchAtRef.current = now;
        void loadNearbyServices();
      }
      if (now - lastNearbyJobsFetchAtRef.current >= NEARBY_JOBS_STALE_MS) {
        lastNearbyJobsFetchAtRef.current = now;
        void loadNearbyJobs();
      }
    }, [isOffline, loadNearbyJobs, loadNearbyMusicEvents, loadNearbyServices]),
  );

  useEffect(() => {
    if (user?.address?.trim()) {
      dispatch(setProfileFallbackLocation(user.address.trim()));
    }
  }, [dispatch, user?.address]);

  // Ask for location only after the user reaches the home feed — not on install.
  // Instant-first strategy: useCurrentDeviceLocation dispatches applyInstantCoords
  // from last-known (< 50 ms) before geocoding completes, so the UI updates immediately.
  useEffect(() => {
    if (!sessionHydrated || !locationHydrated || locationPromptAttempted.current) return;

    locationPromptAttempted.current = true;

    const askAndRefreshLocation = async () => {
      // Run permission/services check and location fetch concurrently where possible.
      // ensureDeviceLocationAccess shows the system dialog; once the user taps
      // "Turn on", we immediately dispatch useCurrentDeviceLocation which will
      // return last-known coords in < 50 ms via applyInstantCoords.
      const access = await ensureDeviceLocationAccess();
      if (!access.ok) {
        if (access.reason === "permission_denied") {
          void dispatch(refreshDeviceLocation({ force: true }));
        }
        return;
      }

      // useCurrentDeviceLocation calls detectDeviceLocation which fires
      // onInstantCoords as soon as last-known is available — UI updates then,
      // not after the full GPS + geocoding chain finishes.
      void dispatch(useCurrentDeviceLocation());
      // Do NOT await — let it run in background. Feed refresh is driven by
      // the locationCoords useEffect which triggers when coords change.
    };

    void askAndRefreshLocation().catch(() => {});
  }, [dispatch, locationHydrated, sessionHydrated]);

  useEffect(() => {
    if (!sessionHydrated) return;

    (async () => {
      const cached = await getCachedHomeFeed().catch(() => null);
      if (cached) {
        applyFeedSnapshot(cached.data, { source: "cache" });
      }

      await loadFeed({ allowCacheFallback: !cached });
    })().catch(() => {});

    getRecentlyViewed(shouldApplyLocationFilter ? effectiveCountryCode : null).then(setRecentlyViewed).catch(() => {});
    if (isAuthenticated) {
      getNotificationUnreadCount()
        .then((r) => setNotificationUnreadCount(r.unreadCount ?? 0))
        .catch(() => {});
      getChatUnreadCount()
        .then((r) => setChatUnreadCount(r.unreadCount ?? 0))
        .catch(() => {});
    }
  }, [
    applyFeedSnapshot,
    effectiveCountryCode,
    isAuthenticated,
    loadFeed,
    sessionHydrated,
  ]);

  // Cooldown so the multiple triggers below (location change, app foreground,
  // focus, online recovery) collapse into at most one real fetch every 30s.
  const lastFeedFetchAtRef = useRef(0);
  const FEED_REFETCH_COOLDOWN_MS = 30_000;
  const maybeRefetchFeed = useCallback(() => {
    const now = Date.now();
    if (now - lastFeedFetchAtRef.current < FEED_REFETCH_COOLDOWN_MS) return;
    lastFeedFetchAtRef.current = now;
    loadFeed({ allowCacheFallback: false }).catch(() => {});
  }, [loadFeed]);

  useEffect(() => {
    if (!locationHydrated) return;
    const timer = setTimeout(() => {
      lastFeedFetchAtRef.current = Date.now();
      loadFeed({ allowCacheFallback: false }).catch(() => {});
      void loadNearbyMusicEvents();
      void loadNearbyServices();
      void loadNearbyJobs();
    }, 400);
    return () => clearTimeout(timer);
  }, [locationHydrated, locationCoords.lat, locationCoords.lng, loadFeed, loadNearbyJobs, loadNearbyMusicEvents, loadNearbyServices]);

  useEffect(() => {
    if (!sessionHydrated) return;
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") maybeRefetchFeed();
    });
    return () => sub.remove();
  }, [maybeRefetchFeed, sessionHydrated]);

  useEffect(() => {
    if (!isOffline && isUsingCachedFeed) {
      // Online recovery — bypass cooldown.
      lastFeedFetchAtRef.current = Date.now();
      loadFeed({ allowCacheFallback: false }).catch(() => {});
    }
  }, [isOffline, isUsingCachedFeed, loadFeed]);

  // On focus we ALWAYS refresh side data (recently viewed, unread counts)
  // but the feed itself respects the cooldown.
  useFocusEffect(
    useCallback(() => {
      maybeRefetchFeed();
      getRecentlyViewed(shouldApplyLocationFilter ? effectiveCountryCode : null).then(setRecentlyViewed).catch(() => {});
      getNotificationUnreadCount()
        .then((r) => setNotificationUnreadCount(r.unreadCount ?? 0))
        .catch(() => {});
      getChatUnreadCount()
        .then((r) => setChatUnreadCount(r.unreadCount ?? 0))
        .catch(() => {});
    }, [effectiveCountryCode, maybeRefetchFeed, shouldApplyLocationFilter]),
  );

  const handleRefresh = useCallback(async () => {
    await Promise.all([
      dispatch(fetchProfile()).unwrap().catch(() => {}),
      loadFeed(),
      loadNearbyMusicEvents({ force: true }),
      loadNearbyServices(),
      loadNearbyJobs(),
      getRecentlyViewed(shouldApplyLocationFilter ? effectiveCountryCode : null).then(setRecentlyViewed).catch(() => {}),
      getNotificationUnreadCount()
        .then((r) => setNotificationUnreadCount(r.unreadCount ?? 0))
        .catch(() => {}),
      getChatUnreadCount()
        .then((r) => setChatUnreadCount(r.unreadCount ?? 0))
        .catch(() => {}),
    ]);
  }, [dispatch, effectiveCountryCode, loadFeed, loadNearbyJobs, loadNearbyMusicEvents, loadNearbyServices, shouldApplyLocationFilter]);

  const { refreshing, onRefresh } = usePullToRefresh(handleRefresh);

  useEffect(() => {
    const unsub = subscribeNotificationUnreadAdjust((delta) => {
      setNotificationUnreadCount((count) => Math.max(0, count + delta));
    });
    return () => { unsub(); };
  }, []);

  const handleBottomTabPress = useTabNavigation(() => setShowLoginSheet(true));

  const displayName = user?.name?.trim() || "Guest";

  // Pre-filter recently viewed once instead of inside renderItem
  const filteredRecentlyViewed = useMemo(
    () => filterOutOwnListings(recentlyViewed, user?.id).slice(0, 12),
    [recentlyViewed, user?.id],
  );


  const handleToggleSave = useCallback(async (item: ListingItem) => {
    if (isOffline) {
      return;
    }

    try {
      const category = (item as any)._source ?? item.category ?? "electronics";
      const res = await toggleSaveListing(category, item._id);
      setSavedIds((prev) => {
        const next = new Set(prev);
        if (res.saved) next.add(item._id);
        else next.delete(item._id);
        return next;
      });
    } catch {
      // silently fail
    }
  }, [isOffline]);

  const recentKeyExtractor = useCallback(
    (item: RecentlyViewedItem) => item._id,
    [],
  );

  const handleSpotlightPress = useCallback(
    (item: HomeSpotlightItem) => {
      pushToDetail(item.category, item.id);
    },
    [pushToDetail],
  );

  const handleSpotlightSave = useCallback(
    (item: HomeSpotlightItem) => {
      const listing = allListings.find((l) => l._id === item.id);
      if (listing) void handleToggleSave(listing);
    },
    [allListings, handleToggleSave],
  );

  // Stable renderItem for recently viewed
  const renderRecentItem = useCallback(
    ({ item }: { item: RecentlyViewedItem }) => {
      const feedListing = allListings.find((l) => l._id === item._id);
      const userLatLng =
        canShowDistanceOnCards &&
        locationCoords.lat != null &&
        locationCoords.lng != null
          ? { lat: locationCoords.lat, lng: locationCoords.lng }
          : null;

      const distanceKm = userLatLng
        ? resolveListingDistanceKm(
            {
              _id: item._id,
              category: item.category,
              coordinates: item.coordinates ?? feedListing?.coordinates,
              distance: (feedListing as { distance?: number } | undefined)?.distance,
            },
            userLatLng,
          )
        : null;

      const distanceLabel =
        distanceKm != null
          ? getListingDistanceLabel(
              {
                _id: item._id,
                category: item.category,
                distance: distanceKm,
                coordinates: item.coordinates ?? feedListing?.coordinates,
                countryCode: item.countryCode ?? item.isoCountryCode,
                currency: item.currency,
              },
              userLatLng,
              isoCountryCode || item.countryCode || item.isoCountryCode,
            )
          : undefined;

      return (
        <ListingItemsGridCard
          layout="carousel"
          width={GRID_CARD_WIDTH}
          title={item.title}
          price={item.price}
          currency={item.currency}
          image={item.images?.[0]}
          createdAt={item.createdAt}
          distanceLabel={distanceLabel}
          isSaved={savedIds.has(item._id)}
          onPress={() => pushToDetail(item.category, item._id)}
          onToggleSave={() => {
            const listing = allListings.find((l) => l._id === item._id);
            if (listing) void handleToggleSave(listing);
          }}
        />
      );
    },
    [allListings, canShowDistanceOnCards, handleToggleSave, isoCountryCode, locationCoords.lat, locationCoords.lng, pushToDetail, savedIds],
  );

  // ============================================================
  // Local UI state for the "Featured Artists" & "Explore Near You"
  // demo sections (visual-only, no API/business-logic changes).
  // ============================================================
  const [savedArtistIds, setSavedArtistIds] = useState<Set<string>>(new Set());
  const [savedExploreIds, setSavedExploreIds] = useState<Set<string>>(new Set());

  const featuredCardWidth = SCREEN_WIDTH * 0.48;
  const exploreCardWidth = SCREEN_WIDTH * 0.5;
  const serviceCardWidth = SERVICE_CARD_WIDTH;
  const jobCardWidth = JOB_CARD_WIDTH;

  const handleToggleArtistSave = useCallback((id: string) => {
    setSavedArtistIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleToggleExploreSave = useCallback(async (eventId: string) => {
    if (isOffline) return;
    try {
      const res = await toggleSaveListing("events", eventId);
      setSavedExploreIds((prev) => {
        const next = new Set(prev);
        if (res.saved) next.add(eventId);
        else next.delete(eventId);
        return next;
      });
    } catch {
      // silently fail
    }
  }, [isOffline]);

  const nearbyMusicExploreItems = useMemo(
    () => nearbyMusicEvents.map(listingToExploreNearYouItem),
    [nearbyMusicEvents],
  );

  const homeServiceItems = useMemo(() => {
    if (nearbyServices.length > 0) return nearbyServices;

    const feedServices = feedData?.categories?.services?.listings ?? [];
    let items = filterOutOwnListings(feedServices, user?.id);

    if (items.length === 0) {
      items = filterOutOwnListings(
        allListings.filter((item) => {
          const cat =
            (item as ListingItem & { _source?: string })._source ??
            item.category ??
            "";
          return cat === "services";
        }),
        user?.id,
      );
    }

    return items.slice(0, HOME_SERVICES_LIMIT);
  }, [
    allListings,
    feedData?.categories?.services?.listings,
    nearbyServices,
    user?.id,
  ]);

  const homeJobItems = useMemo(() => {
    if (nearbyJobs.length > 0) return nearbyJobs;

    const feedJobs = feedData?.categories?.jobs?.listings ?? [];
    let items = filterOutOwnListings(feedJobs, user?.id);

    if (items.length === 0) {
      items = filterOutOwnListings(
        allListings.filter((item) => {
          const cat =
            (item as ListingItem & { _source?: string })._source ??
            item.category ??
            "";
          return cat === "jobs";
        }),
        user?.id,
      );
    }

    return items.slice(0, HOME_JOBS_LIMIT);
  }, [
    allListings,
    feedData?.categories?.jobs?.listings,
    nearbyJobs,
    user?.id,
  ]);

  const openNearbyMusicEvent = useCallback(
    (eventId: string, index: number) => {
      const ids = nearbyMusicEvents.map((e) => e._id);
      router.push({
        pathname: "/event-detail",
        params: buildEventDetailParams(eventId, ids, index),
      } as Href);
    },
    [nearbyMusicEvents, router],
  );

  const openServiceDetail = useCallback(
    (serviceId: string) => {
      router.push(`/service-detail?id=${serviceId}&category=services` as Href);
    },
    [router],
  );

  const openJobDetail = useCallback(
    (jobId: string) => {
      router.push(`/job-detail?id=${jobId}&category=jobs` as Href);
    },
    [router],
  );

  const handleToggleJobSave = useCallback(async (jobId: string) => {
    if (isOffline) return;
    try {
      const res = await toggleSaveListing("jobs", jobId);
      setSavedJobIds((prev) => {
        const next = new Set(prev);
        if (res.saved) next.add(jobId);
        else next.delete(jobId);
        return next;
      });
    } catch {
      // silently fail
    }
  }, [isOffline]);

  const handleServiceMessage = useCallback(
    (item: ListingItem) => {
      const sellerId = getListingSellerId(item);
      if (!sellerId) {
        showErrorToast("Unavailable", "Provider information is missing for this service.");
        return;
      }
      if (isOwnListing(item, user?.id)) {
        showErrorToast("Not Allowed", "You cannot message yourself on your own service.");
        return;
      }

      const pricing = (item as { pricing?: { basePrice?: number } }).pricing;
      const providerUser =
        typeof item.userId === "object" ? item.userId : null;
      const providerName =
        providerUser?.name ?? item.sellerName ?? "Provider";
      const contactImage =
        providerUser?.profileImage ??
        providerUser?.googleProfileImage ??
        providerUser?.avatar ??
        item.seller?.profileImage ??
        null;

      navigateProtected(
        buildListingChatHref({
          recipientId: sellerId,
          sellerId,
          name: providerName,
          contactImage,
          productId: item._id,
          productType: "services",
          productTitle: item.title ?? item.subcategory ?? "Service",
          productPrice: pricing?.basePrice ?? item.price,
          productImage: item.images?.[0] ?? null,
          currency: item.currency ?? "₹",
        }),
        "messages",
      );
    },
    [navigateProtected, user?.id],
  );

  const exploreColumns = useMemo(
    () => chunkExploreColumns(HOME_EXPLORE_CATEGORIES, 2),
    [],
  );

  const renderExploreColumn = useCallback(
    ({ item: column, index: colIndex }: { item: typeof HOME_EXPLORE_CATEGORIES; index: number }) => (
      <View
        style={{
          width: EXPLORE_CARD_W,
          gap: EXPLORE_ROW_GAP,
        }}
      >
        {column.map((cat) => (
          <HomeExploreCategoryCard
            key={cat.id}
            category={cat}
            width={EXPLORE_CARD_W}
            height={EXPLORE_CARD_H}
            onPress={() => router.push(cat.href)}
          />
        ))}
      </View>
    ),
    [router],
  );

  const exploreColumnKeyExtractor = useCallback(
    (_: typeof HOME_EXPLORE_CATEGORIES, index: number) => `explore-col-${index}`,
    [],
  );

  const featuredArtistKeyExtractor = useCallback(
    (item: FeaturedArtistItem) => item.id,
    [],
  );
  const exploreKeyExtractor = useCallback(
    (item: ExploreNearYouItem) => item.id,
    [],
  );

  const serviceKeyExtractor = useCallback(
    (item: ListingItem) => item._id,
    [],
  );

  const renderServiceItem = useCallback(
    ({ item }: { item: ListingItem }) => (
      <HomeServiceDetailCard
        item={item}
        cardWidth={serviceCardWidth}
        isoCountryCode={effectiveCountryCode}
        onPress={() => openServiceDetail(item._id)}
        onMessage={() => handleServiceMessage(item)}
      />
    ),
    [
      effectiveCountryCode,
      handleServiceMessage,
      openServiceDetail,
      serviceCardWidth,
    ],
  );

  const jobKeyExtractor = useCallback((item: ListingItem) => item._id, []);

  const renderJobItem = useCallback(
    ({ item }: { item: ListingItem }) => (
      <View style={{ width: jobCardWidth }}>
        <JobListingCard
          job={item as JobListingExtras}
          isoCountryCode={effectiveCountryCode}
          isSaved={savedJobIds.has(item._id) || savedIds.has(item._id)}
          onPress={() => openJobDetail(item._id)}
          onToggleSave={() => {
            void handleToggleJobSave(item._id);
          }}
        />
      </View>
    ),
    [
      effectiveCountryCode,
      handleToggleJobSave,
      jobCardWidth,
      openJobDetail,
      savedIds,
      savedJobIds,
    ],
  );

  const renderFeaturedArtistItem = useCallback(
    ({ item }: { item: FeaturedArtistItem }) => (
      <FeaturedProfileCard
        id={item.id}
        name={item.name}
        subtitle={item.subtitle}
        avatar={item.avatar}
        stats={item.stats}
        eventDate={item.eventDate}
        cardWidth={featuredCardWidth}
        isSaved={savedArtistIds.has(item.id)}
        onPress={() => {}}
        onToggleSave={() => handleToggleArtistSave(item.id)}
      />
    ),
    [featuredCardWidth, handleToggleArtistSave, savedArtistIds],
  );

  const renderExploreItem = useCallback(
    ({ item, index }: { item: ExploreNearYouItem; index: number }) => {
      const listing = nearbyMusicEvents[index];
      const isSaved =
        savedExploreIds.has(item.id) ||
        Boolean(user?.id && listing?.savedBy?.includes(user.id));

      return (
        <ExploreNearYouCard
          id={item.id}
          image={item.image}
          location={item.location}
          title={item.title}
          dateTime={item.dateTime}
          cardWidth={exploreCardWidth}
          isSaved={isSaved}
          onPress={() => openNearbyMusicEvent(item.id, index)}
          onToggleSave={() => handleToggleExploreSave(item.id)}
        />
      );
    },
    [
      exploreCardWidth,
      handleToggleExploreSave,
      nearbyMusicEvents,
      openNearbyMusicEvent,
      savedExploreIds,
      user?.id,
    ],
  );

  const topBarHeight = insets.top + 64;
  const locationParts = useMemo(
    () => splitHomeLocationLabel(displayLocation),
    [displayLocation],
  );

  const freshRecommendations = useMemo((): FreshRecommendationItem[] => {
    const userLatLng = canShowDistanceOnCards
      ? { lat: locationCoords.lat as number, lng: locationCoords.lng as number }
      : null;

    const withDistance = allListings.map((item) => {
      const category = (item as ListingItem & { _source?: string })._source ?? item.category ?? "electronics";
      let distanceLabel: string | undefined;

      if (userLatLng) {
        const distanceKm = resolveListingDistanceKm(
          {
            _id: item._id,
            category,
            distance: (item as { distance?: number }).distance,
            coordinates: item.coordinates,
          },
          userLatLng,
        ) ?? undefined;

        distanceLabel = getListingDistanceLabel(
          {
            _id: item._id,
            category,
            distance: distanceKm,
            coordinates: item.coordinates,
            countryCode: item.countryCode,
            currency: item.currency,
          },
          userLatLng,
          isoCountryCode,
        );
      }

      return { item, category, distanceLabel };
    });

    withDistance.sort((a, b) => {
      const aTime = a.item.createdAt ? new Date(a.item.createdAt).getTime() : 0;
      const bTime = b.item.createdAt ? new Date(b.item.createdAt).getTime() : 0;
      return bTime - aTime;
    });

    return withDistance.slice(0, 12).map(({ item, category, distanceLabel }) => ({
      id: item._id,
      title: item.title,
      price: item.price ?? null,
      currency: item.currency,
      image: item.images?.[0] ?? "",
      createdAt: item.createdAt,
      category,
      distanceLabel,
    }));
  }, [allListings, canShowDistanceOnCards, isoCountryCode, locationCoords.lat, locationCoords.lng]);

  const spotlightItems = useMemo((): HomeSpotlightItem[] => {
    return freshRecommendations.map((item) => ({
      id: item.id,
      title: item.title,
      image: item.image,
      category: item.category,
      isSaved: savedIds.has(item.id),
      distanceLabel: item.distanceLabel,
      priceLabel:
        item.price != null
          ? formatPrice(item.price, item.currency, isoCountryCode)
          : undefined,
    }));
  }, [freshRecommendations, isoCountryCode, savedIds]);

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      {/* ===== TOP APP BAR — location + profile (reference layout) ===== */}
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          zIndex: 50,
          paddingTop: insets.top + 8,
          paddingHorizontal: 16,
          paddingBottom: 10,
          height: topBarHeight,
          backgroundColor: colors.background,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Pressable
          onPress={() => router.push("/location-picker" as Href)}
          style={({ pressed }) => ({
            flex: 1,
            flexDirection: "row",
            alignItems: "flex-start",
            marginRight: 12,
            opacity: pressed ? 0.75 : 1,
          })}
        >
          <MaterialIcons
            name="location-on"
            size={22}
            color={colors.textPrimary}
            style={{ marginTop: 1, marginRight: 4 }}
          />
          <View style={{ flex: 1, minWidth: 0 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 2,
              }}
            >
              <Text
                numberOfLines={1}
                style={{
                  flexShrink: 1,
                  fontFamily: ListifyFonts.bold,
                  fontSize: 17,
                  color: colors.textPrimary,
                  ...(Platform.OS === "android"
                    ? { includeFontPadding: false }
                    : {}),
                }}
              >
                {locationParts.primary}
              </Text>
              <MaterialIcons
                name="keyboard-arrow-down"
                size={20}
                color={colors.textPrimary}
              />
            </View>
            {locationParts.secondary ? (
              <Text
                numberOfLines={1}
                style={{
                  marginTop: 1,
                  fontFamily: ListifyFonts.regular,
                  fontSize: 13,
                  color: colors.textSecondary,
                  ...(Platform.OS === "android"
                    ? { includeFontPadding: false }
                    : {}),
                }}
              >
                {locationParts.secondary}
              </Text>
            ) : null}
          </View>
        </Pressable>

        <Pressable
          onPress={() => handleBottomTabPress("profile")}
          style={({ pressed }) => ({
            width: 42,
            height: 42,
            borderRadius: 21,
            overflow: "hidden",
            opacity: pressed ? 0.88 : 1,
            borderWidth: 2,
            borderColor: isDark ? "rgba(167,139,250,0.55)" : "#5B4B8A",
            backgroundColor: colors.surface,
          })}
        >
          <ProfileAvatarImage
            user={user}
            fallbackName={displayName}
            className="h-full w-full"
            iconSize={22}
          />
        </Pressable>
      </View>

      {/* ===== SCROLLABLE CONTENT ===== */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
            progressViewOffset={topBarHeight}
          />
        }
        scrollEventThrottle={16}
        contentContainerStyle={{
          paddingTop: topBarHeight + 12,
          paddingBottom: 80 + Math.max(insets.bottom, 16),
        }}
      >
        <View className="mb-5 px-4">
          <Text
            style={{
              fontFamily: ListifyFonts.bold,
              fontSize: 22,
              color: colors.textPrimary,
              marginBottom: 6,
              ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
            }}
          >
            Explore
          </Text>

          <FlatList
            horizontal
            data={exploreColumns}
            keyExtractor={exploreColumnKeyExtractor}
            renderItem={renderExploreColumn}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{
              paddingRight: EXPLORE_H_PAD,
              paddingTop: 6,
              paddingBottom: 4,
              gap: EXPLORE_GAP,
            }}
            {...HORIZONTAL_CAROUSEL_PROPS}
          />
        </View>

        {/* Sell Banner */}
        {/* <View className="mx-4 mb-6">
          <View
            className="h-36 overflow-hidden rounded-2xl"
            style={{
              shadowColor: "#27BB97",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.24,
              shadowRadius: 14,
              elevation: 8,
            }}
          >
            <LinearGradient
              colors={["#24B08F", "#1D9477"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ flex: 1 }}
            >
              <View className="absolute -top-8 -right-6 h-24 w-24 rounded-full bg-white/10" />
              <View className="absolute -bottom-10 -left-6 h-24 w-24 rounded-full bg-white/10" />

              <View className="flex-1 flex-row items-center justify-between px-4 py-4">
                <View className="max-w-44">
                  <Text className="mb-2 text-[17px] font-semibold leading-6 text-white">
                    Sell what you don&apos;t use and earn today
                  </Text>
                  <Text className="mb-3 text-[12px] leading-4 text-white/85">
                    Snap a photo, add details, and publish in minutes.
                  </Text>
                  <Pressable
                    onPress={() => router.push("/sell-entry")}
                    className="self-start flex-row items-center gap-1 rounded-full bg-white px-4 py-2"
                  >
                    <MaterialIcons
                      name="camera-alt"
                      size={15}
                      color="#1D9477"
                    />
                    <Text className="text-[12px] font-semibold text-[#1D9477]">
                      Sell Now
                    </Text>
                  </Pressable>
                </View>

                <View className="relative h-28 w-24 items-center justify-center">
                  <View className="h-28 w-24 overflow-hidden rounded-2xl border border-white/35 bg-white/20">
                    <Image
                      source={SELL_BANNER_CAMERA_IMAGE}
                      contentFit="cover"
                      transition={200}
                      className="h-full w-full"
                    />
                  </View>
                  <View className="absolute -bottom-2 -right-2 h-8 w-8 items-center justify-center rounded-full bg-white shadow-sm">
                    <MaterialIcons
                      name="add-a-photo"
                      size={16}
                      color="#1D9477"
                    />
                  </View>
                </View>
              </View>
            </LinearGradient>
          </View>
        </View> */}

        {/* Fresh recommendation carousel */}
        {!isOffline ? (
          spotlightItems.length > 0 ? (
            <View className="mb-6 mt-5">
              <HomeSpotlightCarousel
                items={spotlightItems}
                onPressItem={handleSpotlightPress}
                onToggleSave={handleSpotlightSave}
                onSeeAll={() =>
                  router.push({
                    pathname: "/search-results-entity-tabs",
                    params: {
                      q: "",
                      title: "Fresh recommendation",
                      countryCode: effectiveCountryCode ?? "",
                    },
                  } as Href)
                }
              />
            </View>
          ) : (
            <View className="mb-6 mt-5 mx-4 items-center rounded-2xl px-6 py-10" style={{ backgroundColor: colors.surface }}>
              <MaterialIcons name="location-on" size={36} color={colors.iconMuted} />
              <Text
                className="mt-3 text-center text-[14px]"
                style={{ ...ListifyTypography.label, color: colors.textSecondary }}
              >
                {displayLocation && displayLocation !== "Set location"
                  ? `No listings found near ${displayLocation}`
                  : "Set your location to see nearby listings"}
              </Text>
            </View>
          )
        ) : null}

        {/* ===== Featured Profiles — "Artists in your City" (hidden) ===== */}
        {/* {!isOffline ? (
          <View className="mb-6">
            <View className=" flex-row items-center justify-between px-4">
              <Text
                className="text-[22px] font-bold"
                style={{
                  color: colors.textPrimary,
                  ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
                }}
              >
                Artists in your City
              </Text>
              <Pressable hitSlop={8}>
                <Text
                  className="text-[12px] font-medium"
                  style={{ color: colors.primary }}
                >
                  See all
                </Text>
              </Pressable>
            </View>

            <FlatList
              horizontal
              data={FEATURED_ARTISTS}
              keyExtractor={featuredArtistKeyExtractor}
              renderItem={renderFeaturedArtistItem}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{
                paddingHorizontal: 16,
                paddingTop: featuredCardWidth * 0.24,
                paddingBottom: 8,
                gap: 14,
              }}
              decelerationRate="fast"
              snapToInterval={featuredCardWidth + 14}
              snapToAlignment="start"
              removeClippedSubviews
              initialNumToRender={3}
              maxToRenderPerBatch={3}
              windowSize={5}
              scrollEventThrottle={16}
            />
          </View>
        ) : null} */}

        {/* ===== Explore Near You — image cards ===== */}
        {!isOffline && nearbyMusicExploreItems.length > 0 ? (
          <View className="mb-8">
            <View className="mb-4 flex-row items-center justify-between px-4">
              <Text
                className="text-[22px] font-bold"
                style={{
                  color: colors.textPrimary,
                  ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
                }}
              >
                Explore Events near you
              </Text>
              <Pressable
                hitSlop={8}
                onPress={() => router.push("/events-listing" as Href)}
              >
                <MaterialIcons name="chevron-right" size={22} color={colors.icon} />
              </Pressable>
            </View>

            <FlatList
              horizontal
              data={nearbyMusicExploreItems}
              keyExtractor={exploreKeyExtractor}
              renderItem={renderExploreItem}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{
                paddingHorizontal: 16,
                paddingBottom: 6,
                gap: 14,
              }}
              decelerationRate="fast"
              snapToInterval={exploreCardWidth + 14}
              snapToAlignment="start"
              {...HORIZONTAL_CAROUSEL_PROPS}
            />
          </View>
        ) : null}

        {/* ===== Service details — professional marketplace cards ===== */}
        {!isOffline && homeServiceItems.length > 0 ? (
          <View className="mb-8">
            <View className="mb-4 flex-row items-center justify-between px-4">
              <Text
                className="text-[22px] font-bold"
                style={{
                  color: colors.textPrimary,
                  ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
                }}
              >
                Service details near you
              </Text>
              <Pressable
                hitSlop={8}
                onPress={() => router.push("/services-category-hub" as Href)}
              >
                <MaterialIcons name="chevron-right" size={22} color={colors.icon} />
              </Pressable>
            </View>

            <FlatList
              horizontal
              data={homeServiceItems}
              keyExtractor={serviceKeyExtractor}
              renderItem={renderServiceItem}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{
                paddingHorizontal: 16,
                paddingBottom: 6,
                gap: SERVICE_CARD_GAP,
              }}
              decelerationRate="fast"
              snapToInterval={serviceCardWidth + SERVICE_CARD_GAP}
              snapToAlignment="start"
              {...HORIZONTAL_CAROUSEL_PROPS}
            />
          </View>
        ) : null}

        {/* ===== Jobs near you — horizontal job cards ===== */}
        {!isOffline && homeJobItems.length > 0 ? (
          <View className="mb-8">
            <View className="mb-4 flex-row items-center justify-between px-4">
              <Text
                className="text-[22px] font-bold"
                style={{
                  color: colors.textPrimary,
                  ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
                }}
              >
                Jobs near you
              </Text>
              <Pressable
                hitSlop={8}
                onPress={() => router.push("/jobs-listing" as Href)}
              >
                <MaterialIcons name="chevron-right" size={22} color={colors.icon} />
              </Pressable>
            </View>

            <FlatList
              horizontal
              data={homeJobItems}
              keyExtractor={jobKeyExtractor}
              renderItem={renderJobItem}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{
                paddingHorizontal: 16,
                paddingBottom: 6,
                gap: JOB_CARD_GAP,
              }}
              decelerationRate="fast"
              snapToInterval={jobCardWidth + JOB_CARD_GAP}
              snapToAlignment="start"
              {...HORIZONTAL_CAROUSEL_PROPS}
            />
          </View>
        ) : null}

        {/* Offline notice � shown instead of fresh/recent sections */}
        {isOffline ? (
          <View className="mx-4 mb-6 mt-5 flex-row items-center gap-3 rounded-2xl border border-[#1E3A34] bg-[#10231D] px-4 py-4">
            <MaterialIcons name="cloud-off" size={22} color="#6EE7C7" />
            <View className="flex-1">
              <Text className="text-[14px] font-semibold text-white">You&apos;re offline</Text>
              <Text className="mt-0.5 text-[12px] text-[#9DCDC1]">Browse categories. Fresh recommendations and recently viewed are unavailable offline.</Text>
            </View>
          </View>
        ) : null}

        {/* Recently viewed � hidden when offline */}
        {!isOffline ? (
        <View className="mb-8">
          <View className="mb-4 px-4">
            <Text
              className="text-[22px] font-bold"
              style={{ color: colors.textPrimary }}
            >
              Recently viewed
            </Text>
          </View>

          {recentlyViewed.length > 0 ? (
            <FlatList
              horizontal
              data={filteredRecentlyViewed}
              keyExtractor={recentKeyExtractor}
              renderItem={renderRecentItem}
              showsHorizontalScrollIndicator={false}
              nestedScrollEnabled
              style={{ minHeight: RECENTLY_VIEWED_ROW_HEIGHT, overflow: "visible" }}
              contentContainerStyle={{
                paddingHorizontal: 16,
                gap: 14,
                paddingBottom: 8,
              }}
              decelerationRate="fast"
              {...HORIZONTAL_CAROUSEL_PROPS}
            />
          ) : (
            <View
              className="mx-4 items-center rounded-2xl px-6 py-10"
              style={{ backgroundColor: colors.surface }}
            >
              <MaterialIcons name="history" size={36} color={colors.iconMuted} />
              <Text
                className="mt-3 text-center text-[14px]"
                style={{ ...ListifyTypography.label, color: colors.textSecondary }}
              >
                Items you view will appear here
              </Text>
            </View>
          )}
        </View>
        ) : null}
      </ScrollView>

      {/* Login Required Bottom Sheet */}
      <Modal
        visible={showLoginSheet}
        transparent
        animationType="slide"
        onRequestClose={() => setShowLoginSheet(false)}
      >
        <Pressable
          className="flex-1 bg-black/40"
          onPress={() => setShowLoginSheet(false)}
        />
        <View
          className="absolute inset-x-0 bottom-0 rounded-t-3xl px-6 pt-6"
          style={{
            paddingBottom: Math.max(insets.bottom, 24),
            backgroundColor: colors.surface,
          }}
        >
          <View
            className="mb-4 self-center h-1 w-10 rounded-full"
            style={{ backgroundColor: colors.border }}
          />
          <View className="items-center mb-4">
            <View
              className="mb-3 h-16 w-16 items-center justify-center rounded-full"
              style={{ backgroundColor: colors.primarySoft }}
            >
              <MaterialIcons name="lock-outline" size={32} color={colors.primary} />
            </View>
            <Text
              className="text-[20px] font-bold mb-1"
              style={{ color: colors.textPrimary }}
            >
              Login Required
            </Text>
            <Text
              className="text-[14px] text-center leading-5"
              style={{ color: colors.textSecondary }}
            >
              Please sign in to post your products and start selling on Listifys.
            </Text>
          </View>
          <Pressable
            onPress={() => { setShowLoginSheet(false); router.push("/sign-in" as Href); }}
            className="mb-3 h-14 items-center justify-center rounded-2xl"
            style={{ backgroundColor: colors.primary }}
          >
            <Text
              className="text-[16px] font-semibold"
              style={{ color: colors.textOnPrimary }}
            >
              Sign In
            </Text>
          </Pressable>
          <Pressable
            onPress={() => { setShowLoginSheet(false); router.push("/sign-up" as Href); }}
            className="mb-2 h-14 items-center justify-center rounded-2xl border"
            style={{ borderColor: colors.primary }}
          >
            <Text
              className="text-[16px] font-semibold"
              style={{ color: colors.primary }}
            >
              Create Account
            </Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

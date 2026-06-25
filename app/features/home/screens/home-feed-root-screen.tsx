import { MaterialIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { type Href, useFocusEffect, useRouter } from "@/lib/safe-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    AppState,
    Dimensions,
    Modal,
    Pressable,
    RefreshControl,
    ScrollView,
    Text,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  HomeCategoryMoreTile,
  HomeCategoryTile,
} from "@/components/home-category-tile";
import { ListingItemsGridCard, getListingGridCarouselHeight } from "@/components/listing-items-grid-card";
import { TrendingListingCard } from "@/components/trending-listing-card";
import { CATEGORIES, type CategorySlug } from "@/constants/categories";
import { ListifyFonts, ListifyTypography } from "@/constants/typography";
import { getUnreadCount as getNotificationUnreadCount } from "@/features/auth/services/auth-api";
import { subscribeNotificationUnreadAdjust } from "@/lib/notification-unread-bus";
import { getUnreadCount as getChatUnreadCount } from "@/features/messaging/services/chat-api";
import {
  fetchHomeFeed,
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
import { filterOutOwnListings } from "@/lib/is-own-listing";
import { resolveListingDistanceKm, getListingDistanceLabel } from "@/lib/listing-distance";
import {
  ensureDeviceLocationAccess,
  extractCityFromLocationLabel,
} from "@/lib/location-service";
import { getCategoryHref } from "@/lib/navigate-to-category";
import { useTabNavigation } from "@/lib/use-tab-navigation";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { fetchProfile } from "@/store/slices/auth-slice";
import { showAuthGate } from "@/store/slices/auth-gate-slice";
import {
  hydrateAppLocation,
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
const GRID_GAP = 10;
const GRID_H_PADDING = 16;
const HOME_GRID_COLS = 4;
const HOME_PREVIEW_COUNT = 7;
const CATEGORY_CARD_SIZE =
  (SCREEN_WIDTH - GRID_H_PADDING * 2 - GRID_GAP * (HOME_GRID_COLS - 1)) /
  HOME_GRID_COLS;

const gridCategories = CATEGORIES.map((c) => ({
  id: c.slug,
  label: c.name,
  icon: c.icon,
}));

const homePreviewCategories = gridCategories.slice(0, HOME_PREVIEW_COUNT);

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
  const { isoCountryCode: localeCountryCode } = useLocale();
  const user = useAppSelector((s) => s.auth.user);
  const isAuthenticated = useAppSelector((s) => s.auth.isAuthenticated);
  const sessionHydrated = useAppSelector((s) => s.auth.sessionHydrated);
  const network = useAppSelector((s) => s.network);
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
  const [showLoginSheet, setShowLoginSheet] = useState(false);
  const locationPromptAttempted = useRef(false);
  const isOffline = !network.isConnected || network.isInternetReachable === false;
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

  useEffect(() => {
    if (!sessionHydrated) return;
    void dispatch(hydrateAppLocation());
  }, [dispatch, sessionHydrated]);

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
    // Coord changes are an explicit signal — always honor immediately and
    // reset the cooldown.
    lastFeedFetchAtRef.current = Date.now();
    loadFeed({ allowCacheFallback: false }).catch(() => {});
  }, [locationHydrated, locationCoords.lat, locationCoords.lng, loadFeed]);

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
      getRecentlyViewed(shouldApplyLocationFilter ? effectiveCountryCode : null).then(setRecentlyViewed).catch(() => {}),
      getNotificationUnreadCount()
        .then((r) => setNotificationUnreadCount(r.unreadCount ?? 0))
        .catch(() => {}),
      getChatUnreadCount()
        .then((r) => setChatUnreadCount(r.unreadCount ?? 0))
        .catch(() => {}),
    ]);
  }, [dispatch, effectiveCountryCode, loadFeed, shouldApplyLocationFilter]);

  const { refreshing, onRefresh } = usePullToRefresh(handleRefresh);

  useEffect(() => {
    return subscribeNotificationUnreadAdjust((delta) => {
      setNotificationUnreadCount((count) => Math.max(0, count + delta));
    });
  }, []);

  const handleBottomTabPress = useTabNavigation(() => setShowLoginSheet(true));

  const displayName = user?.name?.trim() || "Guest";

  const topBarHeight = insets.top + 80;

  const trendingCardWidth = SCREEN_WIDTH * 0.58;

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

  const navigateToCategory = useCallback(
    (catId: CategorySlug) => {
      router.push(getCategoryHref(catId));
    },
    [router],
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

  return (
    <View className="flex-1 bg-[#F6F7F8]">
      {/* ===== TOP APP BAR ===== */}
      <View
        className="absolute inset-x-0 top-0 z-50 flex-row items-start justify-between bg-[#F6F7F8] px-4"
        style={{
          paddingTop: insets.top + 6,
          height: topBarHeight,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.05,
          shadowRadius: 2,
          elevation: 2,
        }}
      >
  <View>
<View className="flex flex-row items-center justify-between w-full" >
<View className="flex flex-row items-center gap-3">
          <View className="relative">
            <Pressable
              onPress={() => handleBottomTabPress("profile")}
              className="h-15 w-15 overflow-hidden rounded-full border-2 border-white"
              style={({ pressed }) => ({
                opacity: pressed ? 0.85 : 1,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.1,
                shadowRadius: 4,
                elevation: 3,
              })}
            >
              <ProfileAvatarImage
                user={user}
                fallbackName={displayName}
                className="h-full w-full"
                iconSize={24}
              />
            </Pressable>
          </View>

          <View className="pt-0.5 leading-tight">
            <Text className="text-[18px]" style={ListifyTypography.label}>
              Welcome
            </Text>
            <Text
              className=" text-[13px]"
              style={ListifyTypography.name}
              numberOfLines={1}
            >
              {displayName}
            </Text>
          </View>

        </View>

        <View className="flex-row items-center gap-4">
          <Pressable
            onPress={() => {
              if (isAuthenticated) {
                router.push("/messages-inbox" as Href);
                return;
              }
              dispatch(showAuthGate({ action: "messages", redirectTo: "/messages-inbox" }));
            }}
            className="h-10 w-10 items-center justify-center rounded-full bg-white shadow-xl"
            style={({ pressed }) => ({
              opacity: pressed ? 0.7 : 1,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.08,
              shadowRadius: 4,
              elevation: 2,
            })}
          >
            <MaterialIcons name="chat-bubble-outline" size={24} color="#161D1A" />
            {chatUnreadCount > 0 && (
              <View className="absolute -right-0.5 -top-0.5 min-w-4.5 items-center justify-center rounded-full bg-red-500 px-1 py-0.5">
                <Text className="text-[10px] font-bold text-white">
                  {chatUnreadCount > 99 ? "99+" : chatUnreadCount}
                </Text>
              </View>
            )}
          </Pressable>

          <Pressable
            onPress={() => {
              if (isAuthenticated) {
                router.push("/notifications-center" as Href);
                return;
              }
              dispatch(showAuthGate({ action: "notifications", redirectTo: "/notifications-center" }));
            }}
            className="h-10 w-10 items-center justify-center rounded-full bg-white shadow-xl"
            style={({ pressed }) => ({
              opacity: pressed ? 0.7 : 1,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.08,
              shadowRadius: 4,
              elevation: 2,
            })}
          >
            <MaterialIcons name="notifications-none" size={24} color="#161D1A" />
            {notificationUnreadCount > 0 && (
              <View className="absolute -right-0.5 -top-0.5 min-w-4.5 items-center justify-center rounded-full bg-red-500 px-1 py-0.5">
                <Text className="text-[10px] font-bold text-white">
                  {notificationUnreadCount > 99 ? "99+" : notificationUnreadCount}
                </Text>
              </View>
            )}
          </Pressable>
        </View>
</View>

        <Pressable
              onPress={() => router.push("/location-picker" as Href)}
              className="my-1 flex-row items-center gap-1"
              style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
            >
              <MaterialIcons name="location-on" size={14} color="#27BB97" />
              <Text
                className="flex-1 text-[12px]"
                style={ListifyTypography.label}
                numberOfLines={1}
              >
                {displayLocation}
              </Text>
              <MaterialIcons name="keyboard-arrow-down" size={18} color="#9CA3AF" />
            </Pressable>
  </View>

        


      </View>

      {/* ===== SCROLLABLE CONTENT ===== */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={["#27BB97"]}
            tintColor="#27BB97"
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
            className="mb-4 text-[26px] leading-8"
            style={ListifyTypography.heading}
          >
            What are you looking for?
          </Text>

          <Pressable
            onPress={() => router.push("/search-home" as Href)}
            className="mb-5 h-18 flex-row items-center rounded-full border border-[#E8E8E8] bg-white px-4"
            style={{
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.04,
              shadowRadius: 6,
              elevation: 1,
            }}
          >
            <MaterialIcons name="search" size={22} color="#B8B8B8" />
            <Text className="ml-3 flex-1 text-[15px]" style={ListifyTypography.label}>
              Search here
            </Text>
          </Pressable>

          <View className="flex-row flex-wrap" style={{ gap: GRID_GAP }}>
            {homePreviewCategories.map((cat) => (
              <HomeCategoryTile
                key={cat.id}
                slug={cat.id}
                label={cat.label}
                icon={cat.icon}
                size={CATEGORY_CARD_SIZE}
                onPress={() => navigateToCategory(cat.id)}
              />
            ))}
            <HomeCategoryMoreTile
              size={CATEGORY_CARD_SIZE}
              onPress={() => handleBottomTabPress("search")}
            />
          </View>
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

        {/* Fresh recommendations � hidden when offline (cached content only) */}
        {!isOffline ? (
        <View className="mb-6 mt-5">
          <View className="mb-4 flex-row items-center justify-between px-4">
            <Text className="text-[22px] text-gray-600 font-bold" >
              Fresh recommendations
            </Text>
            <Pressable
              onPress={() =>
                router.push({
                  pathname: "/search-results-entity-tabs",
                  params: {
                    q: "",
                    title: "Fresh recommendations",
                    countryCode: effectiveCountryCode ?? "",
                  },
                } as Href)
              }
            >
              <Text className="text-[12px] font-medium text-[#27BB97]">See all</Text>
            </Pressable>
          </View>

          {freshRecommendations.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, gap: 16 }}
              decelerationRate="fast"
              snapToInterval={trendingCardWidth + 16}
            >
              {freshRecommendations.map((item) => (
                <TrendingListingCard
                  key={item.id}
                  id={item.id}
                  title={item.title}
                  price={item.price}
                  currency={item.currency}
                  image={item.image}
                  cardWidth={trendingCardWidth}
                  createdAt={item.createdAt}
                  distanceLabel={item.distanceLabel}
                  isSaved={savedIds.has(item.id)}
                  isOffline={isOffline}
                  onPress={() => pushToDetail(item.category, item.id)}
                  onToggleSave={() => {
                    const listing = allListings.find((l) => l._id === item.id);
                    if (listing) void handleToggleSave(listing);
                  }}
                />
              ))}
            </ScrollView>
          ) : (
            <View className="mx-4 items-center rounded-2xl bg-white px-6 py-10">
              <MaterialIcons name="location-on" size={36} color="#D1D5DB" />
              <Text
                className="mt-3 text-center text-[14px] text-[#6B7280]"
                style={ListifyTypography.label}
              >
                {displayLocation && displayLocation !== "Set location"
                  ? `No listings found near ${displayLocation}`
                  : "Set your location to see nearby listings"}
              </Text>
            </View>
          )}
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
            <Text className="text-[22px] text-gray-600 font-bold">
              Recently viewed
            </Text>
          </View>

          {recentlyViewed.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              removeClippedSubviews={false}
              nestedScrollEnabled
              style={{ minHeight: RECENTLY_VIEWED_ROW_HEIGHT, overflow: "visible" }}
              contentContainerStyle={{
                paddingHorizontal: 16,
                gap: 14,
                paddingBottom: 8,
              }}
              decelerationRate="fast"
            >
              {filterOutOwnListings(recentlyViewed, user?.id)
                .slice(0, 12)
                .map((item) => {
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
                    key={item._id}
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
              })}
            </ScrollView>
          ) : (
            <View className="mx-4 items-center rounded-2xl bg-white px-6 py-10">
              <MaterialIcons name="history" size={36} color="#D1D5DB" />
              <Text
                className="mt-3 text-center text-[14px] text-[#6B7280]"
                style={ListifyTypography.label}
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
          className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-white px-6 pt-6"
          style={{ paddingBottom: Math.max(insets.bottom, 24) }}
        >
          <View className="mb-4 self-center h-1 w-10 rounded-full bg-slate-200" />
          <View className="items-center mb-4">
            <View className="mb-3 h-16 w-16 items-center justify-center rounded-full bg-[rgba(39,187,151,0.1)]">
              <MaterialIcons name="lock-outline" size={32} color="#27BB97" />
            </View>
            <Text className="text-[20px] font-bold text-[#161D1A] mb-1">
              Login Required
            </Text>
            <Text className="text-[14px] text-center text-[#6C7A74] leading-5">
              Please sign in to post your products and start selling on Listifys.
            </Text>
          </View>
          <Pressable
            onPress={() => { setShowLoginSheet(false); router.push("/sign-in" as Href); }}
            className="mb-3 h-14 items-center justify-center rounded-2xl bg-[#27BB97]"
          >
            <Text className="text-[16px] font-semibold text-white">
              Sign In
            </Text>
          </Pressable>
          <Pressable
            onPress={() => { setShowLoginSheet(false); router.push("/sign-up" as Href); }}
            className="mb-2 h-14 items-center justify-center rounded-2xl border border-[#27BB97]"
          >
            <Text className="text-[16px] font-semibold text-[#27BB97]">
              Create Account
            </Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

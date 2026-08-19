import { MaterialIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { type Href, useFocusEffect, useRouter } from "@/lib/safe-router";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  Dimensions,
  Platform,
  Pressable,
  ScrollView,
  Share,
  Text,
  View,
} from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ListifyFonts } from "@/constants/typography";
import { AUTH_API_BASE_URL, requestJson, toggleFollowUser } from "@/features/auth/services/auth-api";
import { AuthGateBottomSheet } from "@/features/auth/components/auth-gate-bottom-sheet";
import { EventBookedTicketCard } from "@/features/events/components/event-booked-ticket-card";
import { EventCategoryDetailSections } from "@/features/events/components/event-category-detail-sections";
import { FeaturedEventCard } from "@/features/events/components/featured-event-card";
import { EventListingMedia } from "@/features/events/components/event-listing-media";
import {
  getComedyCategoryLabel,
  getEventDurationLabel,
} from "@/features/events/data/comedy-event-meta";
import {
  fetchMyEventTicket,
  fetchEventAvailability,
  type EventAvailability,
  type TicketDetail,
} from "@/features/events/services/event-ticketing-api";
import {
  fetchSimilarEvents,
  prefetchSimilarEvents,
} from "@/features/events/services/events-api";
import {
  buildEventDateAccent,
  buildEventDetailTheme,
  buildEventDistanceLabel,
  buildEventScheduleSubtitle,
  buildEventScheduleTitle,
  buildEventTags,
  buildEventTicketPriceLine,
  buildOrganizerName,
  buildThingsToKnow,
  dummyToListingItem,
  findDummyFeaturedEvent,
  formatSpotsRemaining,
  getEventBookCtaLabel,
  isEventSoldOut,
  type EventOrganizerStats,
} from "@/features/events/utils/event-detail-helpers";
import {
  addToRecentlyViewed,
  mergeListingItems,
  normalizeListingItem,
  toggleSaveListing,
  type ListingItem,
} from "@/features/listing/services/listing-api";
import {
  connectSocket,
  getSocket,
  joinEventRoom,
  leaveEventRoom,
} from "@/features/messaging/services/socket-service";
import { getListingSellerId, isOwnListing } from "@/lib/is-own-listing";
import { buildListingMediaGallery } from "@/lib/listing-media";
import { cacheKeys, getCachedStale, seedListingDetail } from "@/lib/cache";
import { Image } from "@/lib/nativewind-interop";
import { useSwrListing } from "@/lib/use-swr-listing";
import { useEventsTheme } from "@/features/events/theme/events-theme";
import { useTheme } from "@/providers/theme-provider";
import { useAppSelector } from "@/store/hooks";
import {
  selectIsoCountryCode,
  selectLocationCoords,
  selectLocationLabel,
} from "@/store/slices/location-slice";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const HERO_HEIGHT = Math.round(SCREEN_HEIGHT * 0.58);
const SHEET_OVERLAP = 36;
const SCROLL_TOP_PADDING = HERO_HEIGHT - SHEET_OVERLAP;

export type EventDetailPageProps = {
  eventId: string;
  pageWidth: number;
  isActive: boolean;
  onScrollDepthChange?: (depth: number) => void;
};

function CircleIconButton({
  name,
  onPress,
  bg,
  iconColor,
}: {
  name: keyof typeof MaterialIcons.glyphMap;
  onPress: () => void;
  bg: string;
  iconColor: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => ({
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: bg,
        opacity: pressed ? 0.75 : 1,
      })}
    >
      <MaterialIcons name={name} size={22} color={iconColor} />
    </Pressable>
  );
}

function EventDetailPageImpl({
  eventId,
  pageWidth,
  isActive,
}: EventDetailPageProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const et = useEventsTheme();
  const user = useAppSelector((s) => s.auth.user);
  const locationLabel = useAppSelector(selectLocationLabel);
  const isoCountryCode = useAppSelector(selectIsoCountryCode);
  const userCoords = useAppSelector(selectLocationCoords);

  const detailTheme = useMemo(
    () => buildEventDetailTheme(isDark, colors),
    [colors, isDark],
  );

  const dummy = findDummyFeaturedEvent(eventId);
  const isDummy = Boolean(dummy);

  const cachedListing = useMemo((): ListingItem | null => {
    if (isDummy && dummy) return dummyToListingItem(dummy);
    const cached = getCachedStale<{ listing?: ListingItem }>(
      cacheKeys.listingDetail("events", eventId),
    );
    return cached?.data.listing
      ? normalizeListingItem(cached.data.listing)
      : null;
  }, [dummy, eventId, isDummy]);

  const { listing: swrListing, refresh: refreshListing } = useSwrListing(
    "events",
    isDummy ? null : eventId,
  );

  const [listing, setListing] = useState<ListingItem | null>(
    cachedListing ?? (isDummy ? dummyToListingItem(dummy!) : swrListing ?? null),
  );
  const [similarEvents, setSimilarEvents] = useState<ListingItem[]>([]);
  const [isSaved, setIsSaved] = useState(false);
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);
  const [aboutExpanded, setAboutExpanded] = useState(false);
  const [thingsExpanded, setThingsExpanded] = useState(false);
  const [authGateVisible, setAuthGateVisible] = useState(false);
  const [authGateAction, setAuthGateAction] = useState<"save" | "message">("save");
  const [bookedTicket, setBookedTicket] = useState<TicketDetail | null>(null);
  const [bookedTicketLoading, setBookedTicketLoading] = useState(false);
  const [ticketAvailability, setTicketAvailability] = useState<EventAvailability | null>(null);
  const [ticketQuantity, setTicketQuantity] = useState(1);
  const [followingOrganizer, setFollowingOrganizer] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [organizerFollowersCount, setOrganizerFollowersCount] = useState(0);

  const loadBookedTicket = useCallback(async () => {
    if (!user?.id || isDummy || !eventId) {
      setBookedTicket(null);
      return;
    }
    setBookedTicketLoading(true);
    try {
      const data = await fetchMyEventTicket(eventId);
      if (data.booked && data.ticket) {
        setBookedTicket({
          ticket: data.ticket,
          order: data.order ?? undefined,
          event: data.event ?? undefined,
          cancellationPolicy: data.cancellationPolicy ?? undefined,
        });
      } else {
        setBookedTicket(null);
      }
    } catch {
      setBookedTicket(null);
    } finally {
      setBookedTicketLoading(false);
    }
  }, [eventId, isDummy, user?.id]);

  const loadTicketAvailability = useCallback(async () => {
    if (isDummy || !eventId) return;
    try {
      const data = await fetchEventAvailability(eventId);
      setTicketAvailability(data);
    } catch {
      /* keep last known availability */
    }
  }, [eventId, isDummy]);

  useFocusEffect(
    useCallback(() => {
      if (!isActive || isDummy) return;
      void refreshListing();
      void loadBookedTicket();
      void loadTicketAvailability();
    }, [isActive, isDummy, loadBookedTicket, loadTicketAvailability, refreshListing]),
  );

  useEffect(() => {
    if (!isActive || isDummy || !eventId) return;
    const interval = setInterval(() => {
      void loadTicketAvailability();
    }, 30_000);
    return () => clearInterval(interval);
  }, [eventId, isActive, isDummy, loadTicketAvailability]);

  useEffect(() => {
    if (!isActive || isDummy || !eventId || !user?.id) return;
    let cancelled = false;

    const setupRealtime = async () => {
      try {
        await connectSocket();
        joinEventRoom(eventId);
        const socket = getSocket();
        if (!socket) return;

        const onAvailability = (payload: {
          eventId?: string;
          ticketTypes?: EventAvailability["ticketTypes"];
        }) => {
          if (payload.eventId && payload.eventId !== eventId) return;
          if (!payload.ticketTypes) return;
          setTicketAvailability((prev) =>
            prev
              ? { ...prev, ticketTypes: payload.ticketTypes! }
              : prev,
          );
        };

        socket.on("event:availability", onAvailability);
        return () => {
          socket.off("event:availability", onAvailability);
          leaveEventRoom(eventId);
        };
      } catch {
        return undefined;
      }
    };

    let cleanup: (() => void) | undefined;
    void setupRealtime().then((fn) => {
      if (cancelled) fn?.();
      else cleanup = fn;
    });

    return () => {
      cancelled = true;
      cleanup?.();
      leaveEventRoom(eventId);
    };
  }, [eventId, isActive, isDummy, user?.id]);

  useEffect(() => {
    setTicketQuantity(1);
    setTicketAvailability(null);
  }, [eventId]);

  useEffect(() => {
    if (!isActive || !user?.id) {
      if (!user?.id) setBookedTicket(null);
      return;
    }
    void loadBookedTicket();
  }, [isActive, loadBookedTicket, user?.id]);

  useEffect(() => {
    if (isDummy) {
      setListing(dummyToListingItem(dummy!));
      return;
    }
    if (cachedListing) {
      setListing((prev) => mergeListingItems(prev, cachedListing));
    }
  }, [cachedListing, dummy, isDummy]);

  useEffect(() => {
    if (isDummy) return;
    if (swrListing) {
      setListing((prev) => mergeListingItems(prev, swrListing));
    }
  }, [isDummy, swrListing]);

  useEffect(() => {
    setActiveMediaIndex(0);
  }, [eventId]);

  useEffect(() => {
    if (!listing || isDummy) return;
    addToRecentlyViewed(listing, locationLabel, isoCountryCode).catch(() => {});
    if (user?.id && listing.savedBy?.includes(user.id)) setIsSaved(true);
  }, [isDummy, listing, locationLabel, isoCountryCode, user?.id]);

  useEffect(() => {
    if (!isActive || isDummy || !eventId || !listing) return;

    const coords = listing.coordinates?.coordinates;
    const similarParams = {
      lat: coords?.[1] ?? userCoords?.lat ?? undefined,
      lng: coords?.[0] ?? userCoords?.lng ?? undefined,
      countryCode: listing.countryCode ?? isoCountryCode ?? undefined,
      location: listing.location ?? undefined,
      limit: 8,
    };

    prefetchSimilarEvents(eventId, similarParams);
    void fetchSimilarEvents(eventId, similarParams)
      .then((res) => setSimilarEvents(res.listings ?? []))
      .catch(() => setSimilarEvents([]));
  }, [
    eventId,
    isActive,
    isDummy,
    listing,
    listing?.coordinates,
    listing?.countryCode,
    listing?.location,
    isoCountryCode,
    userCoords?.lat,
    userCoords?.lng,
  ]);

  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
    },
  });

  const heroAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(
          scrollY.value,
          [0, HERO_HEIGHT],
          [0, -HERO_HEIGHT * 0.22],
          Extrapolation.CLAMP,
        ),
      },
      {
        scale: interpolate(
          scrollY.value,
          [0, HERO_HEIGHT],
          [1, 1.12],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  const heroOverlayStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollY.value,
      [0, HERO_HEIGHT * 0.45, HERO_HEIGHT],
      [0.12, 0.45, 0.72],
      Extrapolation.CLAMP,
    ),
  }));

  const collapsedHeaderStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollY.value,
      [HERO_HEIGHT * 0.28, HERO_HEIGHT * 0.5],
      [0, 1],
      Extrapolation.CLAMP,
    ),
    transform: [
      {
        translateY: interpolate(
          scrollY.value,
          [HERO_HEIGHT * 0.28, HERO_HEIGHT * 0.5],
          [-8, 0],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  const floatingHeaderStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollY.value,
      [HERO_HEIGHT * 0.18, HERO_HEIGHT * 0.38],
      [1, 0],
      Extrapolation.CLAMP,
    ),
  }));

  const requireAuth = useCallback(
    (action: "save" | "message", callback: () => void) => {
      if (!user) {
        setAuthGateAction(action);
        setAuthGateVisible(true);
        return;
      }
      callback();
    },
    [user],
  );

  const openSimilarEvent = useCallback(
    (id: string, ids: string[], index: number) => {
      const match = similarEvents.find((item) => item._id === id);
      if (match) {
        seedListingDetail("events", match._id, normalizeListingItem(match), 120_000, {
          force: true,
        });
      }
      router.push({
        pathname: "/event-detail",
        params: {
          id,
          eventIds: ids.join(","),
          index: String(index),
          category: "events",
        },
      } as Href);
    },
    [router, similarEvents],
  );

  const handleToggleSave = useCallback(async () => {
    if (!listing?._id || isDummy) return;
    requireAuth("save", async () => {
      try {
        const res = await toggleSaveListing("events", listing._id);
        setIsSaved(res.saved);
        if (typeof res.likedCount === "number") {
          setListing((prev) => {
            if (!prev) return prev;
            const currentStats = (prev as ListingItem & { organizerStats?: EventOrganizerStats })
              .organizerStats;
            return mergeListingItems(prev, {
              ...prev,
              organizerStats: {
                ...currentStats,
                likedCount: res.likedCount,
              },
            } as ListingItem);
          });
        }
      } catch {
        /* ignore */
      }
    });
  }, [isDummy, listing?._id, requireAuth]);

  const handleShare = useCallback(async () => {
    if (!listing) return;
    try {
      await Share.share({
        message: `${listing.title}\n${listing.venue ?? listing.location ?? ""}`,
      });
    } catch {
      /* ignore */
    }
  }, [listing]);

  const handleBook = useCallback(() => {
    if (!listing) return;
    const primaryType = ticketAvailability?.ticketTypes[0];
    const availableNow = primaryType?.available ?? null;
    if (isEventSoldOut(listing, availableNow)) return;
    if (bookedTicket?.ticket.id) {
      router.push(`/event-ticket?ticketId=${bookedTicket.ticket.id}` as Href);
      return;
    }
    const maxQty = Math.min(
      primaryType?.maxPerOrder ?? 10,
      availableNow ?? primaryType?.maxPerOrder ?? 10,
    );
    const qty = Math.min(Math.max(1, ticketQuantity), Math.max(1, maxQty));
    requireAuth("message", () => {
      router.push(`/event-checkout?eventId=${listing._id}&quantity=${qty}` as Href);
    });
  }, [
    bookedTicket?.ticket.id,
    listing,
    requireAuth,
    router,
    ticketAvailability?.ticketTypes,
    ticketQuantity,
  ]);

  const handleViewTicket = useCallback(() => {
    if (!bookedTicket?.ticket.id) return;
    router.push(`/event-ticket?ticketId=${bookedTicket.ticket.id}` as Href);
  }, [bookedTicket?.ticket.id, router]);

  const galleryMedia = useMemo(
    () => buildListingMediaGallery(listing ?? undefined),
    [listing],
  );
  const activeMedia = galleryMedia[activeMediaIndex] ?? galleryMedia[0];
  const heroListing = useMemo((): Pick<ListingItem, "images" | "videos"> | null => {
    if (!listing || !activeMedia) return listing;
    if (activeMedia.type === "video") {
      return {
        images: listing.images ?? [],
        videos: [
          {
            url: activeMedia.url,
            thumbnailUrl: activeMedia.thumbnailUrl,
            duration: activeMedia.duration,
            mimeType: activeMedia.mimeType,
            order: 0,
          },
        ],
      };
    }
    return {
      images: [activeMedia.url],
      videos: [],
    };
  }, [activeMedia, listing]);

  const sellerIdForFollow = listing ? getListingSellerId(listing) : null;
  const isOwnEventListing = listing ? isOwnListing(listing, user?.id) : false;

  useEffect(() => {
    if (!sellerIdForFollow || !user?.id || isOwnEventListing) {
      setFollowingOrganizer(false);
      return;
    }
    let cancelled = false;
    void requestJson<{ seller: { isFollowedByCurrentUser?: boolean; followersCount?: number } }>(
      `/api/auth/seller/${sellerIdForFollow}`,
    )
      .then((res) => {
        if (cancelled) return;
        setFollowingOrganizer(Boolean(res.seller?.isFollowedByCurrentUser));
        if (res.seller?.followersCount != null) {
          setOrganizerFollowersCount(res.seller.followersCount);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [sellerIdForFollow, user?.id, isOwnEventListing]);

  const handleToggleFollowOrganizer = useCallback(async () => {
    if (!sellerIdForFollow || followLoading || isOwnEventListing) return;
    if (!user?.id) {
      setAuthGateAction("save");
      setAuthGateVisible(true);
      return;
    }
    const prevFollowing = followingOrganizer;
    setFollowLoading(true);
    setFollowingOrganizer(!prevFollowing);
    try {
      const res = await toggleFollowUser(sellerIdForFollow);
      setFollowingOrganizer(res.isFollowing);
      if (res.followersCount != null) {
        setOrganizerFollowersCount(res.followersCount);
      }
    } catch {
      setFollowingOrganizer(prevFollowing);
    } finally {
      setFollowLoading(false);
    }
  }, [followLoading, followingOrganizer, isOwnEventListing, sellerIdForFollow, user?.id]);

  if (!listing) {
    return (
      <View
        style={{
          width: pageWidth,
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: detailTheme.sheetBg,
        }}
      >
        <MaterialIcons name="hourglass-empty" size={36} color={colors.iconMuted} />
      </View>
    );
  }

  const tags = buildEventTags(listing);
  const dateLabel = buildEventDateAccent(listing);
  const scheduleTitle = buildEventScheduleTitle(listing);
  const scheduleSubtitle = buildEventScheduleSubtitle(listing);
  const comedyCategory = getComedyCategoryLabel(listing);
  const comedyDuration = getEventDurationLabel(listing);
  const venue =
    (listing.venue as string | undefined)?.trim() ||
    listing.location?.trim() ||
    "";
  const distanceLabel = buildEventDistanceLabel(
    listing,
    userCoords,
    isoCountryCode,
  );
  const primaryTicketType = ticketAvailability?.ticketTypes[0] ?? null;
  const liveAvailable = primaryTicketType?.available ?? null;
  const livePrice = primaryTicketType?.price ?? null;
  const isFreeEvent =
    primaryTicketType != null
      ? primaryTicketType.price <= 0
      : listing.price == null || Number(listing.price) === 0;
  const maxTicketQty = Math.min(
    primaryTicketType?.maxPerOrder ?? 10,
    liveAvailable ?? primaryTicketType?.maxPerOrder ?? 10,
  );
  const safeTicketQuantity = Math.min(
    Math.max(1, ticketQuantity),
    Math.max(1, maxTicketQty),
  );

  const ticketPriceLine = buildEventTicketPriceLine(listing, isoCountryCode, livePrice);
  const spotsLine =
    liveAvailable != null ? formatSpotsRemaining(liveAvailable) : null;
  const things = buildThingsToKnow(listing);
  const visibleThings = thingsExpanded ? things : things.slice(0, 3);
  const description = listing.description?.trim() ?? "";
  const aboutPreview =
    description.length > 180 && !aboutExpanded
      ? `${description.slice(0, 180).trim()}…`
      : description;
  const organizerStats = (listing as ListingItem & { organizerStats?: EventOrganizerStats })
    .organizerStats;
  const likedCount =
    organizerStats?.likedCount ??
    (Array.isArray(listing.savedBy) ? listing.savedBy.length : 0);
  const hostedEventsCount = organizerStats?.hostedEvents ?? 0;
  const hostingCount = organizerStats?.hostingCount ?? 0;
  const organizerName = buildOrganizerName(listing);
  const sellerId = getListingSellerId(listing);
  const isOwn = isOwnListing(listing, user?.id);
  const isSoldOut = isEventSoldOut(listing, liveAvailable);
  const isBooked = Boolean(bookedTicket?.ticket.id);
  const ctaLabel = getEventBookCtaLabel(listing, isBooked, {
    quantity: safeTicketQuantity,
    isFree: isFreeEvent,
    liveAvailable,
  });

  const sellerProfileImage = listing.seller?.profileImage
    ? listing.seller.profileImage.startsWith("http")
      ? listing.seller.profileImage
      : `${AUTH_API_BASE_URL}${listing.seller.profileImage}`
    : null;

  const bottomBarHeight = Math.max(insets.bottom, 12) + 132;
  const similarIds = similarEvents.map((e) => e._id);

  return (
    <View style={{ width: pageWidth, flex: 1, backgroundColor: et.detailHeroBg }}>
      <Animated.View
        pointerEvents="box-none"
        style={[
          {
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: HERO_HEIGHT + 40,
            overflow: "hidden",
            zIndex: 1,
          },
          heroAnimatedStyle,
        ]}
      >
        <Pressable
          style={{ flex: 1 }}
          onPress={() => {
            if (galleryMedia.length <= 1) return;
            setActiveMediaIndex((prev) => (prev + 1) % galleryMedia.length);
          }}
        >
          {galleryMedia.length > 0 && heroListing ? (
            <EventListingMedia
              listing={heroListing}
              recyclingKey={`detail-hero-${listing._id}-${activeMediaIndex}`}
              isActive={isActive}
              autoPlay={isActive}
              loop
              muted
              showControls={false}
              style={{ width: "100%", height: "100%" }}
              placeholderIconSize={56}
            />
          ) : (
            <View
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: colors.surfaceMuted,
              }}
            >
              <MaterialIcons name="event" size={56} color={colors.iconMuted} />
            </View>
          )}
        </Pressable>

        {galleryMedia.length > 1 ? (
          <View
            style={{
              position: "absolute",
              bottom: SHEET_OVERLAP + 18,
              left: 0,
              right: 0,
              flexDirection: "row",
              justifyContent: "center",
              gap: 6,
            }}
          >
            {galleryMedia.map((_, idx) => (
              <View
                key={idx.toString()}
                style={{
                  width: idx === activeMediaIndex ? 8 : 6,
                  height: idx === activeMediaIndex ? 8 : 6,
                  borderRadius: 4,
                  backgroundColor:
                    idx === activeMediaIndex
                      ? (isDark ? "#FFFFFF" : et.textPrimary)
                      : isDark
                        ? "rgba(255,255,255,0.45)"
                        : "rgba(0,0,0,0.25)",
                }}
              />
            ))}
          </View>
        ) : null}

        {galleryMedia.some((entry) => entry.type === "video") ? (
          <View style={{ position: "absolute", left: 16, bottom: SHEET_OVERLAP + 14 }}>
            <MaterialIcons name="volume-off" size={18} color="#FFFFFF" />
          </View>
        ) : null}

        <Animated.View
          style={[
            {
              ...Platform.select({
                ios: { backdropFilter: "blur(8px)" },
                default: {},
              }),
              position: "absolute",
              inset: 0,
              backgroundColor: et.detailHeroBg,
            },
            heroOverlayStyle,
          ]}
        />

        <LinearGradient
          colors={
            isDark
              ? ["rgba(0,0,0,0.05)", "rgba(0,0,0,0.55)"]
              : ["rgba(0,0,0,0.02)", "rgba(0,0,0,0.35)"]
          }
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: 120,
          }}
        />
      </Animated.View>

      <Animated.View
        pointerEvents="box-none"
        style={[
          {
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 30,
            paddingTop: insets.top + 6,
            paddingHorizontal: 14,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          },
          floatingHeaderStyle,
        ]}
      >
        <CircleIconButton
          name="arrow-back"
          onPress={() => router.back()}
          bg={et.detailOverlayIconBg}
          iconColor={isDark ? "#FFFFFF" : et.icon}
        />
        <View style={{ flexDirection: "row", gap: 10 }}>
          <CircleIconButton
            name={isSaved ? "bookmark" : "bookmark-border"}
            onPress={handleToggleSave}
            bg={et.detailOverlayIconBg}
            iconColor={isDark ? "#FFFFFF" : et.icon}
          />
          <CircleIconButton
            name="share"
            onPress={handleShare}
            bg={et.detailOverlayIconBg}
            iconColor={isDark ? "#FFFFFF" : et.icon}
          />
        </View>
      </Animated.View>

      <Animated.View
        pointerEvents="box-none"
        style={[
          {
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 35,
            paddingTop: insets.top + 4,
            paddingHorizontal: 10,
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: et.detailCollapsedHeaderBg,
            borderBottomWidth: 1,
            borderBottomColor: detailTheme.divider,
            height: insets.top + 52,
          },
          collapsedHeaderStyle,
        ]}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}
        >
          <MaterialIcons name="arrow-back" size={22} color={detailTheme.titleText} />
        </Pressable>
        <Text
          numberOfLines={1}
          style={{
            flex: 1,
            marginHorizontal: 6,
            fontFamily: ListifyFonts.semiBold,
            fontSize: 16,
            color: detailTheme.titleText,
          }}
        >
          {listing.title}
        </Text>
        <Pressable onPress={handleToggleSave} hitSlop={8} style={{ padding: 8 }}>
          <MaterialIcons
            name={isSaved ? "bookmark" : "bookmark-border"}
            size={22}
            color={detailTheme.titleText}
          />
        </Pressable>
        <Pressable onPress={handleShare} hitSlop={8} style={{ padding: 8 }}>
          <MaterialIcons name="share" size={22} color={detailTheme.titleText} />
        </Pressable>
      </Animated.View>

      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
        bounces
        contentContainerStyle={{
          paddingTop: SCROLL_TOP_PADDING,
          paddingBottom: bottomBarHeight + 24,
        }}
        style={{ flex: 1, zIndex: 10 }}
      >
        <View
          style={{
            backgroundColor: detailTheme.sheetBg,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            borderWidth: 1,
            borderColor: detailTheme.sheetBorder,
            paddingHorizontal: 18,
            paddingTop: 10,
            minHeight: SCREEN_HEIGHT * 0.55,
          }}
        >
          <View
            style={{
              alignSelf: "center",
              width: 42,
              height: 4,
              borderRadius: 2,
              backgroundColor: detailTheme.handleBar,
              marginBottom: 16,
            }}
          />

          {tags.length > 0 ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
              {tags.map((tag) => (
                <View
                  key={tag}
                  style={{
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: detailTheme.chipBorder,
                    paddingHorizontal: 12,
                    paddingVertical: 5,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: ListifyFonts.medium,
                      fontSize: 12,
                      color: detailTheme.chipText,
                    }}
                  >
                    {tag}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          <Text
            style={{
              fontFamily: ListifyFonts.bold,
              fontSize: 28,
              lineHeight: 34,
              color: detailTheme.titleText,
              marginBottom: 8,
            }}
          >
            {listing.title}
          </Text>

          {dateLabel ? (
            <Text
              style={{
                fontFamily: ListifyFonts.medium,
                fontSize: 14,
                color: detailTheme.dateAccent,
                marginBottom: 18,
              }}
            >
              {dateLabel}
            </Text>
          ) : null}

          <Pressable
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              paddingVertical: 14,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                backgroundColor: detailTheme.rowIconBg,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <MaterialIcons name="location-on" size={20} color={detailTheme.titleText} />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontFamily: ListifyFonts.semiBold,
                  fontSize: 14,
                  color: detailTheme.titleText,
                }}
              >
                {venue}
              </Text>
              {distanceLabel ? (
                <Text
                  style={{
                    marginTop: 3,
                    fontFamily: ListifyFonts.regular,
                    fontSize: 12,
                    color: detailTheme.secondaryText,
                  }}
                >
                  {distanceLabel} away
                </Text>
              ) : null}
            </View>
            <MaterialIcons name="chevron-right" size={22} color={detailTheme.secondaryText} />
          </Pressable>

          <View style={{ height: 1, backgroundColor: detailTheme.divider }} />

          <Pressable
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              paddingVertical: 14,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                backgroundColor: detailTheme.rowIconBg,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <MaterialIcons name="event" size={20} color={detailTheme.titleText} />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontFamily: ListifyFonts.semiBold,
                  fontSize: 14,
                  color: detailTheme.titleText,
                }}
              >
                {scheduleTitle}
              </Text>
              <Text
                style={{
                  marginTop: 3,
                  fontFamily: ListifyFonts.regular,
                  fontSize: 12,
                  color: detailTheme.secondaryText,
                }}
              >
                {scheduleSubtitle}
              </Text>
            </View>
            <MaterialIcons name="chevron-right" size={22} color={detailTheme.secondaryText} />
          </Pressable>

          {isBooked && bookedTicket ? (
            <EventBookedTicketCard
              detail={bookedTicket}
              theme={detailTheme}
              isDark={isDark}
              onViewTicket={handleViewTicket}
            />
          ) : bookedTicketLoading && user?.id ? (
            <View style={{ marginTop: 22, paddingVertical: 8 }}>
              <Text
                style={{
                  fontFamily: ListifyFonts.regular,
                  fontSize: 13,
                  color: detailTheme.secondaryText,
                }}
              >
                Checking your booking…
              </Text>
            </View>
          ) : null}

          {comedyCategory ? (
            <>
              <View style={{ height: 1, backgroundColor: detailTheme.divider }} />
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  paddingVertical: 14,
                }}
              >
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    backgroundColor: detailTheme.rowIconBg,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <MaterialIcons name="category" size={20} color={detailTheme.titleText} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontFamily: ListifyFonts.semiBold,
                      fontSize: 14,
                      color: detailTheme.titleText,
                    }}
                  >
                    Category
                  </Text>
                  <Text
                    style={{
                      marginTop: 3,
                      fontFamily: ListifyFonts.regular,
                      fontSize: 12,
                      color: detailTheme.secondaryText,
                    }}
                  >
                    {comedyCategory}
                  </Text>
                </View>
              </View>
            </>
          ) : null}

          {comedyDuration ? (
            <>
              <View style={{ height: 1, backgroundColor: detailTheme.divider }} />
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  paddingVertical: 14,
                }}
              >
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    backgroundColor: detailTheme.rowIconBg,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <MaterialIcons name="schedule" size={20} color={detailTheme.titleText} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontFamily: ListifyFonts.semiBold,
                      fontSize: 14,
                      color: detailTheme.titleText,
                    }}
                  >
                    Duration
                  </Text>
                  <Text
                    style={{
                      marginTop: 3,
                      fontFamily: ListifyFonts.regular,
                      fontSize: 12,
                      color: detailTheme.secondaryText,
                    }}
                  >
                    {comedyDuration}
                  </Text>
                </View>
              </View>
            </>
          ) : null}

          {description ? (
            <View style={{ marginTop: 22 }}>
              <Text
                style={{
                  fontFamily: ListifyFonts.bold,
                  fontSize: 18,
                  color: detailTheme.titleText,
                  marginBottom: 10,
                }}
              >
                About the event
              </Text>
              <Text
                style={{
                  fontFamily: ListifyFonts.regular,
                  fontSize: 14,
                  lineHeight: 22,
                  color: detailTheme.secondaryText,
                }}
              >
                {aboutPreview}
              </Text>
              {description.length > 180 ? (
                <Pressable
                  onPress={() => setAboutExpanded((v) => !v)}
                  style={{ marginTop: 8, alignSelf: "flex-start" }}
                >
                  <Text
                    style={{
                      fontFamily: ListifyFonts.semiBold,
                      fontSize: 13,
                      color: detailTheme.titleText,
                    }}
                  >
                    {aboutExpanded ? "Show less" : "Read more >"}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          <EventCategoryDetailSections listing={listing} />

          {things.length > 0 ? (
            <View style={{ marginTop: 26 }}>
              <Text
                style={{
                  fontFamily: ListifyFonts.bold,
                  fontSize: 18,
                  color: detailTheme.titleText,
                  marginBottom: 8,
                }}
              >
                Things to Know
              </Text>
              {visibleThings.map((item, idx) => (
                <View key={item.id}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 12,
                      paddingVertical: 14,
                    }}
                  >
                    <MaterialIcons
                      name={item.icon}
                      size={20}
                      color={detailTheme.secondaryText}
                    />
                    <Text
                      style={{
                        flex: 1,
                        fontFamily: ListifyFonts.regular,
                        fontSize: 14,
                        color: detailTheme.titleText,
                      }}
                    >
                      {item.text}
                    </Text>
                  </View>
                  {idx < visibleThings.length - 1 ? (
                    <View style={{ height: 1, backgroundColor: detailTheme.divider }} />
                  ) : null}
                </View>
              ))}
              {things.length > 3 ? (
                <Pressable
                  onPress={() => setThingsExpanded((v) => !v)}
                  style={{ marginTop: 4, alignSelf: "flex-start" }}
                >
                  <Text
                    style={{
                      fontFamily: ListifyFonts.semiBold,
                      fontSize: 13,
                      color: detailTheme.titleText,
                    }}
                  >
                    {thingsExpanded ? "Show less" : "See all >"}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          <View style={{ marginTop: 26 }}>
            <Text
              style={{
                fontFamily: ListifyFonts.bold,
                fontSize: 18,
                color: detailTheme.titleText,
                marginBottom: 12,
              }}
            >
              Organised By
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              {organizerFollowersCount > 0 ? (
                <Text
                  style={{
                    fontFamily: ListifyFonts.regular,
                    fontSize: 12,
                    color: detailTheme.secondaryText,
                  }}
                >
                  {organizerFollowersCount >= 1000
                    ? `${(organizerFollowersCount / 1000).toFixed(1)}K followers`
                    : `${organizerFollowersCount} followers`}
                </Text>
              ) : (
                <View />
              )}
              {!isOwn && sellerId ? (
                <Pressable
                  onPress={() => void handleToggleFollowOrganizer()}
                  disabled={followLoading}
                  style={({ pressed }) => ({
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderRadius: 20,
                    backgroundColor: followingOrganizer ? detailTheme.rowBg : et.accent,
                    borderWidth: followingOrganizer ? 1 : 0,
                    borderColor: detailTheme.divider,
                    opacity: pressed || followLoading ? 0.85 : 1,
                  })}
                >
                  <Text
                    style={{
                      fontFamily: ListifyFonts.semiBold,
                      fontSize: 13,
                      color: followingOrganizer ? detailTheme.titleText : "#FFFFFF",
                    }}
                  >
                    {followingOrganizer ? "Following ✓" : "+ Follow"}
                  </Text>
                </Pressable>
              ) : null}
            </View>
            <Pressable
              onPress={() => {
                if (sellerId) {
                  router.push(`/seller-public-profile?sellerId=${sellerId}` as Href);
                }
              }}
              style={{
                borderRadius: 18,
                backgroundColor: detailTheme.rowBg,
                padding: 14,
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
              }}
            >
              <View style={{ alignItems: "center", width: 92 }}>
                <View
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 32,
                    overflow: "hidden",
                    backgroundColor: colors.surfaceMuted,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {sellerProfileImage ? (
                    <Image
                      source={sellerProfileImage}
                      contentFit="cover"
                      style={{ width: "100%", height: "100%" }}
                    />
                  ) : (
                    <Text
                      style={{
                        fontFamily: ListifyFonts.bold,
                        fontSize: 22,
                        color: colors.primary,
                      }}
                    >
                      {organizerName.charAt(0).toUpperCase()}
                    </Text>
                  )}
                </View>
                <Text
                  numberOfLines={2}
                  style={{
                    marginTop: 8,
                    textAlign: "center",
                    fontFamily: ListifyFonts.semiBold,
                    fontSize: 12,
                    color: detailTheme.titleText,
                  }}
                >
                  {organizerName}
                </Text>
              </View>

              <View style={{ flex: 1, flexDirection: "row" }}>
                {[
                  {
                    value: String(likedCount),
                    label: "Liked",
                  },
                  {
                    value: String(hostedEventsCount),
                    label: "Hosted events",
                  },
                  {
                    value: String(hostingCount),
                    label: "Hosting",
                  },
                ].map((stat, idx, arr) => (
                  <View
                    key={stat.label}
                    style={{
                      flex: 1,
                      alignItems: "center",
                      borderRightWidth: idx < arr.length - 1 ? 1 : 0,
                      borderRightColor: detailTheme.divider,
                      paddingHorizontal: 4,
                    }}
                  >
                    <Text
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.75}
                      style={{
                        fontFamily: ListifyFonts.bold,
                        fontSize: 16,
                        color: detailTheme.titleText,
                      }}
                    >
                      {stat.value}
                    </Text>
                    <Text
                      numberOfLines={2}
                      style={{
                        marginTop: 4,
                        textAlign: "center",
                        fontFamily: ListifyFonts.regular,
                        fontSize: 10,
                        color: detailTheme.secondaryText,
                      }}
                    >
                      {stat.label}
                    </Text>
                  </View>
                ))}
              </View>
            </Pressable>
          </View>

          <View style={{ marginTop: 26 }}>
            <Text
              style={{
                fontFamily: ListifyFonts.bold,
                fontSize: 18,
                color: detailTheme.titleText,
                marginBottom: 10,
              }}
            >
              More
            </Text>
            <Pressable
              onPress={() => router.push("/terms-of-service" as Href)}
              style={({ pressed }) => ({
                borderRadius: 14,
                borderWidth: 1,
                borderColor: detailTheme.divider,
                backgroundColor: detailTheme.rowBg,
                paddingHorizontal: 14,
                paddingVertical: 14,
                flexDirection: "row",
                alignItems: "center",
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <MaterialIcons name="description" size={20} color={detailTheme.secondaryText} />
              <Text
                style={{
                  flex: 1,
                  marginLeft: 12,
                  fontFamily: ListifyFonts.medium,
                  fontSize: 14,
                  color: detailTheme.titleText,
                }}
              >
                Terms and conditions
              </Text>
              <MaterialIcons name="chevron-right" size={22} color={detailTheme.secondaryText} />
            </Pressable>
          </View>

          {similarEvents.length > 0 ? (
            <View style={{ marginTop: 28, marginBottom: 8 }}>
              <Text
                style={{
                  fontFamily: ListifyFonts.bold,
                  fontSize: 18,
                  color: detailTheme.titleText,
                  marginBottom: 12,
                }}
              >
                Similar events
              </Text>
              <ScrollView
                horizontal
                nestedScrollEnabled
                directionalLockEnabled
                showsHorizontalScrollIndicator={false}
                decelerationRate="fast"
                snapToInterval={pageWidth * 0.52 + 12}
                snapToAlignment="start"
                scrollEventThrottle={16}
                contentContainerStyle={{ gap: 12, paddingRight: 18 }}
              >
                {similarEvents.map((event, idx) => (
                  <FeaturedEventCard
                    key={event._id}
                    event={event}
                    cardWidth={pageWidth * 0.52}
                    isSaved={Boolean(user?.id && event.savedBy?.includes(user.id))}
                    onPress={() => openSimilarEvent(event._id, similarIds, idx)}
                    onToggleSave={() => {}}
                  />
                ))}
              </ScrollView>
            </View>
          ) : null}
        </View>
      </Animated.ScrollView>

      {!isOwn ? (
        <View
          style={{
            position: "absolute",
            left: 14,
            right: 14,
            bottom: Math.max(insets.bottom, 10),
            zIndex: 40,
            borderRadius: 20,
            backgroundColor: detailTheme.bottomBarBg,
            paddingHorizontal: 16,
            paddingVertical: 14,
            shadowColor: et.isDark ? "#000" : "rgba(0,0,0,0.18)",
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.25,
            shadowRadius: 12,
            elevation: 10,
          }}
        >
          {isBooked ? (
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <MaterialIcons name="check-circle" size={18} color="#059669" />
                  <Text style={{ fontFamily: ListifyFonts.bold, fontSize: 16, color: "#059669" }}>
                    Ticket booked
                  </Text>
                </View>
                {bookedTicket?.ticket.bookingId ? (
                  <Text
                    style={{
                      marginTop: 2,
                      fontFamily: ListifyFonts.regular,
                      fontSize: 12,
                      color: detailTheme.secondaryText,
                    }}
                  >
                    {bookedTicket.ticket.bookingId}
                  </Text>
                ) : null}
              </View>
              <Pressable
                onPress={handleBook}
                style={({ pressed }) => ({
                  borderRadius: 999,
                  backgroundColor: isDark ? "rgba(5,150,105,0.22)" : "rgba(5,150,105,0.14)",
                  paddingHorizontal: 22,
                  paddingVertical: 12,
                  opacity: pressed ? 0.88 : 1,
                })}
              >
                <Text style={{ fontFamily: ListifyFonts.bold, fontSize: 15, color: "#059669" }}>
                  {ctaLabel}
                </Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View style={{ marginBottom: isSoldOut ? 12 : 10 }}>
                <Text
                  style={{
                    fontFamily: ListifyFonts.bold,
                    fontSize: 17,
                    color: isFreeEvent ? "#059669" : detailTheme.titleText,
                    letterSpacing: isFreeEvent ? 0.6 : 0,
                  }}
                >
                  {ticketPriceLine}
                </Text>
                {spotsLine ? (
                  <Text
                    style={{
                      marginTop: 4,
                      fontFamily: ListifyFonts.regular,
                      fontSize: 13,
                      color: detailTheme.secondaryText,
                    }}
                  >
                    {spotsLine}
                  </Text>
                ) : null}
              </View>

              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                {!isSoldOut ? (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: isDark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.08)",
                      backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.03)",
                    }}
                  >
                    <Pressable
                      onPress={() => setTicketQuantity((q) => Math.max(1, q - 1))}
                      disabled={safeTicketQuantity <= 1}
                      style={({ pressed }) => ({
                        width: 38,
                        height: 38,
                        alignItems: "center",
                        justifyContent: "center",
                        opacity: safeTicketQuantity <= 1 ? 0.35 : pressed ? 0.7 : 1,
                      })}
                    >
                      <MaterialIcons name="remove" size={20} color={detailTheme.titleText} />
                    </Pressable>
                    <Text
                      style={{
                        minWidth: 28,
                        textAlign: "center",
                        fontFamily: ListifyFonts.bold,
                        fontSize: 16,
                        color: detailTheme.titleText,
                      }}
                    >
                      {safeTicketQuantity}
                    </Text>
                    <Pressable
                      onPress={() =>
                        setTicketQuantity((q) => Math.min(maxTicketQty, q + 1))
                      }
                      disabled={safeTicketQuantity >= maxTicketQty}
                      style={({ pressed }) => ({
                        width: 38,
                        height: 38,
                        alignItems: "center",
                        justifyContent: "center",
                        opacity: safeTicketQuantity >= maxTicketQty ? 0.35 : pressed ? 0.7 : 1,
                      })}
                    >
                      <MaterialIcons name="add" size={20} color={detailTheme.titleText} />
                    </Pressable>
                  </View>
                ) : (
                  <View style={{ flex: 1 }} />
                )}

                <Pressable
                  onPress={handleBook}
                  disabled={isSoldOut}
                  style={({ pressed }) => ({
                    flex: 1,
                    borderRadius: 999,
                    backgroundColor: isSoldOut
                      ? isDark
                        ? "rgba(255,255,255,0.12)"
                        : "rgba(0,0,0,0.08)"
                      : detailTheme.ctaBg,
                    paddingHorizontal: 18,
                    paddingVertical: 13,
                    alignItems: "center",
                    opacity: isSoldOut ? 1 : pressed ? 0.88 : 1,
                  })}
                >
                  <Text
                    style={{
                      fontFamily: ListifyFonts.bold,
                      fontSize: 15,
                      color: isSoldOut ? detailTheme.secondaryText : detailTheme.ctaText,
                    }}
                  >
                    {ctaLabel}
                  </Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      ) : null}

      <AuthGateBottomSheet
        visible={authGateVisible}
        onClose={() => setAuthGateVisible(false)}
        action={authGateAction}
      />
    </View>
  );
}

export const EventDetailPage = memo(EventDetailPageImpl);

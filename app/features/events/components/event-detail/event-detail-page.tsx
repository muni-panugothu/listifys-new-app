import { MaterialIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { type Href, useRouter } from "@/lib/safe-router";
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
import { AUTH_API_BASE_URL } from "@/features/auth/services/auth-api";
import { AuthGateBottomSheet } from "@/features/auth/components/auth-gate-bottom-sheet";
import { FeaturedEventCard } from "@/features/events/components/featured-event-card";
import { EventListingMedia } from "@/features/events/components/event-listing-media";
import {
  getComedyCategoryLabel,
  getEventDurationLabel,
} from "@/features/events/data/comedy-event-meta";
import {
  fetchSimilarEvents,
  prefetchSimilarEvents,
} from "@/features/events/services/events-api";
import {
  buildEventDateAccent,
  buildEventDetailTheme,
  buildEventDistanceLabel,
  buildEventPriceLabel,
  buildEventScheduleLabel,
  buildEventTags,
  buildOrganizerName,
  buildThingsToKnow,
  dummyToListingItem,
  findDummyFeaturedEvent,
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

  const { listing: swrListing } = useSwrListing(
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
    if (!isActive || isDummy || !eventId) return;
    prefetchSimilarEvents(eventId, {
      lat: userCoords?.lat ?? undefined,
      lng: userCoords?.lng ?? undefined,
      countryCode: isoCountryCode ?? undefined,
    });
    void fetchSimilarEvents(eventId, {
      lat: userCoords?.lat ?? undefined,
      lng: userCoords?.lng ?? undefined,
      countryCode: isoCountryCode ?? undefined,
      limit: 8,
    })
      .then((res) => setSimilarEvents(res.listings ?? []))
      .catch(() => {});
  }, [eventId, isActive, isDummy, isoCountryCode, userCoords?.lat, userCoords?.lng]);

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
    if (!listing || isEventSoldOut(listing)) return;
    requireAuth("message", () => {
      router.push(`/event-checkout?eventId=${listing._id}` as Href);
    });
  }, [listing, requireAuth, router]);

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
  const scheduleLabel = buildEventScheduleLabel(listing);
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
  const priceLabel = buildEventPriceLabel(listing, isoCountryCode);
  const things = buildThingsToKnow(listing);
  const visibleThings = thingsExpanded ? things : things.slice(0, 3);
  const description = listing.description?.trim() ?? "";
  const aboutPreview =
    description.length > 180 && !aboutExpanded
      ? `${description.slice(0, 180).trim()}…`
      : description;
  const organizerStats = (listing as { organizerStats?: EventOrganizerStats })
    .organizerStats;
  const organizerName = buildOrganizerName(listing);
  const sellerId = getListingSellerId(listing);
  const isOwn = isOwnListing(listing, user?.id);
  const isSoldOut = isEventSoldOut(listing);
  const ctaLabel = getEventBookCtaLabel(listing);

  const sellerProfileImage = listing.seller?.profileImage
    ? listing.seller.profileImage.startsWith("http")
      ? listing.seller.profileImage
      : `${AUTH_API_BASE_URL}${listing.seller.profileImage}`
    : null;

  const bottomBarHeight = Math.max(insets.bottom, 12) + 72;
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
                {scheduleLabel}
              </Text>
              <Text
                style={{
                  marginTop: 3,
                  fontFamily: ListifyFonts.regular,
                  fontSize: 12,
                  color: detailTheme.secondaryText,
                }}
              >
                View full schedule & timeline
              </Text>
            </View>
            <MaterialIcons name="chevron-right" size={22} color={detailTheme.secondaryText} />
          </Pressable>

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
                    value:
                      organizerStats?.likedPercent != null
                        ? `${organizerStats.likedPercent}%`
                        : "—",
                    label:
                      organizerStats?.ratingsCount != null && organizerStats.ratingsCount < 100
                        ? "Liked (<100 ratings)"
                        : "Liked",
                  },
                  {
                    value: String(organizerStats?.hostedEvents ?? 0),
                    label: "Hosted events",
                  },
                  {
                    value: organizerStats?.hostingDuration ?? "—",
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
            borderRadius: 999,
            backgroundColor: detailTheme.bottomBarBg,
            paddingHorizontal: 16,
            paddingVertical: 12,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            shadowColor: et.isDark ? "#000" : "rgba(0,0,0,0.18)",
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.25,
            shadowRadius: 12,
            elevation: 10,
          }}
        >
          <View>
            <Text
              style={{
                fontFamily: ListifyFonts.bold,
                fontSize: 18,
                color: detailTheme.titleText,
              }}
            >
              {priceLabel}
            </Text>
          </View>
          <Pressable
            onPress={handleBook}
            disabled={isSoldOut}
            style={({ pressed }) => ({
              borderRadius: 999,
              backgroundColor: isSoldOut
                ? isDark
                  ? "rgba(255,255,255,0.12)"
                  : "rgba(0,0,0,0.08)"
                : detailTheme.ctaBg,
              paddingHorizontal: 22,
              paddingVertical: 12,
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

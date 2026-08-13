import { MaterialIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { type Href, useLocalSearchParams, useRouter } from "@/lib/safe-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Keyboard,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { fetchSellerReviews, getAuthErrorMessage } from "@/features/auth/services/auth-api";
import { buildListingChatHref, sendListingOffer } from "@/lib/listing-chat";
import { AuthGateBottomSheet } from "@/features/auth/components/auth-gate-bottom-sheet";
import {
  addToRecentlyViewed,
  toggleSaveListing,
  type ListingItem,
} from "@/features/listing/services/listing-api";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { useSwrListing } from "@/lib/use-swr-listing";
import { getListingDistanceLabel } from "@/lib/listing-distance";
import { Image } from "@/lib/nativewind-interop";
import { ListifyFonts } from "@/constants/typography";
import { useAppSelector } from "@/store/hooks";
import {
  selectCanShowDistanceOnCards,
  selectIsoCountryCode,
  selectLocationCoords,
  selectLocationLabel,
} from "@/store/slices/location-slice";
import type { CategorySlug } from "@/constants/categories";
import { formatPrice, getCurrencySymbol } from "@/lib/currency";
import { getListingSellerId, isOwnListing } from "@/lib/is-own-listing";
import {
  openListingPhoneDialer,
  resolveListingContactPhone,
} from "@/lib/listing-contact-phone";
import { showErrorToast } from "@/lib/toast";
import { ProfileAvatarImage } from "@/components/profile-avatar-image";
import { ListingLocationSection } from "@/components/listing-location-section";
import { useTheme } from "@/providers/theme-provider";

type SellerPopulated = {
  name?: string;
  username?: string;
  profileImage?: string;
  profileImageUrl?: string;
  googleProfileImage?: string;
  avatar?: string;
  joinedDate?: string;
  createdAt?: string;
  location?: string;
  isVerified?: boolean;
};

function SellerStars({ rating }: { rating: number }) {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 1 }}>
      {Array.from({ length: 5 }).map((_, i) => {
        const name =
          i < full ? "star" : i === full && half ? "star-half" : "star-border";
        return <MaterialIcons key={i} name={name} size={14} color="#F59E0B" />;
      })}
      <Text
        style={{
          marginLeft: 4,
          fontFamily: ListifyFonts.medium,
          fontSize: 12,
          color: "#6B7280",
        }}
      >
        {rating.toFixed(1)}
      </Text>
    </View>
  );
}

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const HERO_HEIGHT = Math.round(SCREEN_WIDTH * 0.68);
const GALLERY_SIDE = 20;
const GALLERY_INNER_PAD = 10;
const GALLERY_GAP = 8;
const GALLERY_SLOTS = 5;
const THUMB_SIZE = Math.floor(
  (SCREEN_WIDTH -
    GALLERY_SIDE * 2 -
    GALLERY_INNER_PAD * 2 -
    GALLERY_GAP * (GALLERY_SLOTS - 1)) /
    GALLERY_SLOTS,
);
const THUMB_OVERLAP = Math.round(THUMB_SIZE / 2) + 6;
const DESCRIPTION_FALLBACK =
  "Experience refined living in this thoughtfully designed property. Spacious interiors, modern finishes, and a prime location come together to create a comfortable home you'll love returning to every day.";

export function PropertyDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const params = useLocalSearchParams<{ id?: string; category?: string }>();
  const user = useAppSelector((s) => s.auth.user);
  const userCoords = useAppSelector(selectLocationCoords);
  const locationLabel = useAppSelector(selectLocationLabel);
  const isoCountryCode = useAppSelector(selectIsoCountryCode);
  const canShowDistanceOnCards = useAppSelector(selectCanShowDistanceOnCards);

  const categorySlug = (params.category ?? "properties") as CategorySlug;
  const listingId = params.id;

  const {
    listing: swrListing,
    isLoading: swrLoading,
    refresh: refreshListing,
  } = useSwrListing(categorySlug, listingId);
  const listing = swrListing ?? null;
  const loading = !listing && swrLoading;
  const [isSaved, setIsSaved] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [sellerRating, setSellerRating] = useState(0);
  const heroScrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!listing) return;
    addToRecentlyViewed(listing, locationLabel, isoCountryCode).catch(() => {});
    if (user?.id && listing.savedBy?.includes(user.id)) {
      setIsSaved(true);
    }
  }, [listing, locationLabel, isoCountryCode, user?.id]);

  useEffect(() => {
    if (!listing) return;
    const sid = getListingSellerId(listing);
    if (!sid) return;

    fetchSellerReviews(sid)
      .then((res) => {
        setSellerRating(res.averageRating ?? 0);
      })
      .catch(() => {
        setSellerRating(0);
      });
  }, [listing?._id]);

  const loadListing = useCallback(async () => {
    if (!listingId) return;
    await refreshListing();
  }, [listingId, refreshListing]);

  const { refreshing, onRefresh } = usePullToRefresh(loadListing);

  const handleToggleSave = useCallback(async () => {
    if (!listingId) return;
    try {
      const res = await toggleSaveListing(categorySlug, listingId);
      setIsSaved(res.saved);
    } catch {}
  }, [categorySlug, listingId]);

  const images = listing?.images?.length ? listing.images : [];
  const title = listing?.title ?? "";
  const price = listing?.price
    ? formatPrice(listing.price, listing.currency, listing.countryCode ?? isoCountryCode)
    : "";
  const description = listing?.description ?? "";
  const distanceLabel =
    listing && canShowDistanceOnCards
      ? getListingDistanceLabel(
          {
            _id: listing._id,
            category: categorySlug,
            distance: listing.distance as number | undefined,
            coordinates: listing.coordinates,
            countryCode: listing.countryCode,
            currency: listing.currency,
          },
          userCoords.lat != null && userCoords.lng != null
            ? { lat: userCoords.lat, lng: userCoords.lng }
            : null,
          isoCountryCode,
        )
      : undefined;
  const bedrooms = listing?.bedrooms ?? 0;
  const bathrooms = listing?.bathrooms ?? 0;
  const squareFeet = (listing as any)?.squareFeet ?? 0;

  const sellerPopulated = listing?.seller as SellerPopulated | undefined;
  const sellerName =
    sellerPopulated?.name ??
    (typeof listing?.userId === "object"
      ? (listing.userId as SellerPopulated).name
      : undefined) ??
    listing?.sellerName ??
    "Seller";
  const sellerProfileUser: SellerPopulated | null = listing
    ? typeof listing.userId === "object" && listing.userId
      ? (listing.userId as SellerPopulated)
      : sellerPopulated ?? { name: sellerName }
    : null;
  const isSellerVerified = Boolean(sellerPopulated?.isVerified);
  const sellerId = listing ? getListingSellerId(listing) : null;

  const openSellerProfile = useCallback(() => {
    if (!sellerId) return;
    router.push({
      pathname: "/seller-public-profile",
      params: {
        sellerId,
        sellerName,
        sellerRating: String(sellerRating),
      },
    } as Href);
  }, [router, sellerId, sellerName, sellerRating]);

  const footerBottomPadding = Math.max(insets.bottom, 10);
  const isOwn = isOwnListing(listing, user?.id);

  // ── Auth Gate ─────────────────────────────────────────────────────────
  const [authGateVisible, setAuthGateVisible] = useState(false);
  const [authGateAction, setAuthGateAction] = useState<"save" | "message" | "offer">("message");
  const pendingActionRef = useRef<(() => void) | null>(null);

  const requireAuth = useCallback(
    (action: "save" | "message" | "offer", callback: () => void) => {
      if (!user) {
        pendingActionRef.current = callback;
        setAuthGateAction(action);
        setAuthGateVisible(true);
        return;
      }
      callback();
    },
    [user],
  );

  const handleAuthSuccess = useCallback(() => {
    const pending = pendingActionRef.current;
    pendingActionRef.current = null;
    pending?.();
  }, []);

  // ── Make Offer Bottom Sheet ───────────────────────────────────────────
  const [offerVisible, setOfferVisible] = useState(false);
  const [offerAmount, setOfferAmount] = useState("");
  const [selectedChip, setSelectedChip] = useState("");
  const [sendingOffer, setSendingOffer] = useState(false);
  const [offerSent, setOfferSent] = useState(false);
  const slideAnim = useRef(new Animated.Value(0)).current;

  const recommendedOffers = useMemo(() => {
    if (!listing?.price) return [];
    const p = Number(listing.price);
    return [
      Math.round((p * 0.85) / 100) * 100,
      Math.round((p * 0.90) / 100) * 100,
      Math.round((p * 0.95) / 100) * 100,
    ];
  }, [listing?.price]);

  const openOfferSheet = useCallback(() => {
    if (listing?.price) {
      const defaultOffer = Math.round((Number(listing.price) * 0.90) / 100) * 100;
      setOfferAmount(String(defaultOffer));
      setSelectedChip(String(defaultOffer));
    } else {
      setOfferAmount("");
      setSelectedChip("");
    }
    setOfferSent(false);
    setOfferVisible(true);
    Animated.spring(slideAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
  }, [listing?.price, slideAnim]);

  const closeOfferSheet = useCallback(() => {
    Keyboard.dismiss();
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => setOfferVisible(false));
  }, [slideAnim]);

  const handleSendOffer = useCallback(async () => {
    if (!listing || !offerAmount || sendingOffer) return;
    const sid = getListingSellerId(listing);
    if (!sid) {
      showErrorToast("Unavailable", "Seller information is missing for this listing.");
      return;
    }
    setSendingOffer(true);
    try {
      await sendListingOffer(
        {
          recipientId: sid,
          sellerId: sid,
          productId: listing._id,
          productType: categorySlug,
          productTitle: listing.title,
          productPrice: listing.price,
          productImage: listing.images?.[0] ?? null,
          currency: listing.currency ?? "₹",
        },
        Number(offerAmount),
        listing.currency ?? "₹",
      );
      setOfferSent(true);
      setTimeout(() => {
        closeOfferSheet();
        router.push(
          buildListingChatHref({
            recipientId: sid,
            sellerId: sid,
            name: sellerName,
            productId: listing._id,
            productType: categorySlug,
            productTitle: title,
            productPrice: listing.price,
            productImage: listing.images?.[0] ?? null,
            currency: listing.currency ?? "₹",
          }),
        );
      }, 1200);
    } catch (e) {
      showErrorToast("Offer Failed", getAuthErrorMessage(e));
    } finally {
      setSendingOffer(false);
    }
  }, [listing, offerAmount, sendingOffer, categorySlug, closeOfferSheet]);

  const [descExpanded, setDescExpanded] = useState(false);

  // Screen-first: never block the screen on a spinner. SWR returns cached data
  // synchronously when available; otherwise the shell renders with skeletons
  // that disappear as the listing resolves.

  if (!listing && swrLoading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.background,
        }}
      >
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!listing) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.background,
        }}
      >
        <MaterialIcons name="error-outline" size={48} color={colors.iconMuted} />
        <Text
          style={{
            marginTop: 8,
            fontSize: 14,
            fontFamily: ListifyFonts.regular,
            color: colors.textSecondary,
          }}
        >
          Property not found
        </Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ fontFamily: ListifyFonts.semiBold, color: colors.primary }}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const badgeLabel = listing.subcategory || "Home";
  const isRental =
    (listing.subcategory ?? "").toLowerCase().includes("rent") ||
    (listing.subcategory ?? "").toLowerCase().includes("room") ||
    (listing.subcategory ?? "").toLowerCase().includes("paying guest");
  const locationText = listing.location?.trim() || "Location not set";
  const hasGallery = images.length > 0;
  const showThumbStrip = hasGallery;
  const galleryThumbs = (() => {
    if (!images.length) return [];
    if (images.length <= GALLERY_SLOTS) {
      return images.map((uri, index) => ({ uri, index, overflowLabel: null as string | null }));
    }
    const remaining = images.length - 4;
    const overflowLabel = remaining >= 10 ? "10+" : `${remaining}+`;
    return [
      ...images.slice(0, 4).map((uri, index) => ({ uri, index, overflowLabel: null as string | null })),
      { uri: images[4], index: 4, overflowLabel },
    ];
  })();
  const descriptionBody = description.trim() || DESCRIPTION_FALLBACK;
  const descPreview =
    descriptionBody.length > 180 && !descExpanded
      ? `${descriptionBody.slice(0, 180).trim()}… `
      : descriptionBody;
  const showReadMore = descriptionBody.length > 180;
  const brokerContact = resolveListingContactPhone(listing);

  const handleCallBroker = async () => {
    if (!brokerContact) {
      showErrorToast("No Number", "Broker has not provided a contact number.");
      return;
    }
    if (!sellerId) {
      showErrorToast("Unavailable", "Seller information is missing for this listing.");
      return;
    }
    await openListingPhoneDialer({
      contact: brokerContact,
      listingId: listing._id,
      sellerId,
      listingModel: "Property",
    });
  };

  const scrollHeroTo = (index: number) => {
    const safe = Math.max(0, Math.min(index, images.length - 1));
    setActiveImageIndex(safe);
    heroScrollRef.current?.scrollTo({ x: safe * SCREEN_WIDTH, animated: true });
  };

  const circleBtn = {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: isDark ? "rgba(30,35,42,0.88)" : "rgba(255,255,255,0.94)",
    alignItems: "center" as const,
    justifyContent: "center" as const,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: isDark ? 0.35 : 0.12,
    shadowRadius: 6,
    elevation: 4,
  };

  const brokerActionBtn = {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  };

  const cardSurface = isDark ? colors.surfaceElevated : colors.card;
  const specsSurface = isDark ? colors.surfaceElevated : colors.surface;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        removeClippedSubviews={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
        contentContainerStyle={{
          paddingBottom: isOwn ? 24 + footerBottomPadding : 100 + footerBottomPadding,
        }}
      >
        {/* Hero + floating thumbnail strip (matches reference) */}
        <View
          style={{
            marginBottom: showThumbStrip ? THUMB_OVERLAP : 0,
            overflow: "visible",
            zIndex: 2,
          }}
        >
          <View
            style={{
              height: HERO_HEIGHT,
              width: SCREEN_WIDTH,
              backgroundColor: colors.surfaceMuted,
              borderBottomLeftRadius: 24,
              borderBottomRightRadius: 24,
              overflow: "hidden",
            }}
          >
            {hasGallery ? (
              <ScrollView
                ref={heroScrollRef}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={(e) => {
                  const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
                  setActiveImageIndex(index);
                }}
              >
                {images.map((img, idx) => (
                  <Image
                    key={`${img}-${idx}`}
                    source={img}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    transition={180}
                    style={{ width: SCREEN_WIDTH, height: HERO_HEIGHT }}
                  />
                ))}
              </ScrollView>
            ) : (
              <View className="h-full w-full items-center justify-center">
                <MaterialIcons name="apartment" size={48} color={colors.iconMuted} />
              </View>
            )}

            <View
              pointerEvents="box-none"
              style={{
                position: "absolute",
                top: insets.top + 8,
                left: 16,
                right: 16,
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Pressable
                onPress={() => router.back()}
                style={({ pressed }) => [{ ...circleBtn, opacity: pressed ? 0.85 : 1 }]}
              >
                <MaterialIcons name="arrow-back-ios" size={18} color={colors.icon} style={{ marginLeft: 4 }} />
              </Pressable>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <Pressable
                  onPress={() => {
                    void Share.share({
                      message: `${title}${price ? ` — ${price}` : ""}${locationText ? `\n${locationText}` : ""}`,
                      title,
                    }).catch(() => {});
                  }}
                  style={({ pressed }) => [{ ...circleBtn, opacity: pressed ? 0.85 : 1 }]}
                >
                  <MaterialIcons name="share" size={20} color={colors.icon} />
                </Pressable>
                <Pressable
                  onPress={() => requireAuth("save", () => void handleToggleSave())}
                  style={({ pressed }) => [{ ...circleBtn, opacity: pressed ? 0.85 : 1 }]}
                >
                  <MaterialIcons
                    name={isSaved ? "favorite" : "favorite-border"}
                    size={20}
                    color={isSaved ? colors.primary : colors.icon}
                  />
                </Pressable>
              </View>
            </View>
          </View>

          {showThumbStrip ? (
            <View
              pointerEvents="box-none"
              style={{
                position: "absolute",
                left: GALLERY_SIDE,
                right: GALLERY_SIDE,
                bottom: -THUMB_OVERLAP,
                zIndex: 10,
                elevation: 10,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: GALLERY_GAP,
                  backgroundColor: cardSurface,
                  borderRadius: 16,
                  paddingHorizontal: GALLERY_INNER_PAD,
                  paddingVertical: 8,
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 8 },
                  shadowOpacity: isDark ? 0.35 : 0.16,
                  shadowRadius: 18,
                  elevation: 10,
                  borderWidth: isDark ? 1 : 0,
                  borderColor: colors.border,
                }}
              >
                {galleryThumbs.map((slot) => {
                  const active = slot.overflowLabel
                    ? activeImageIndex >= 4
                    : activeImageIndex === slot.index;

                  return (
                    <Pressable
                      key={`${slot.uri}-thumb-${slot.index}`}
                      onPress={() => scrollHeroTo(slot.overflowLabel ? 4 : slot.index)}
                      style={{
                        width: THUMB_SIZE + (active ? 4 : 0),
                        height: THUMB_SIZE + (active ? 4 : 0),
                        borderRadius: 12,
                        padding: active ? 2 : 0,
                        backgroundColor: active ? cardSurface : "transparent",
                        shadowColor: "#000",
                        shadowOffset: { width: 0, height: active ? 2 : 0 },
                        shadowOpacity: active ? 0.2 : 0,
                        shadowRadius: active ? 4 : 0,
                        elevation: active ? 4 : 0,
                      }}
                    >
                      <View
                        style={{
                          width: THUMB_SIZE,
                          height: THUMB_SIZE,
                          borderRadius: 10,
                          overflow: "hidden",
                          backgroundColor: colors.surfaceMuted,
                        }}
                      >
                        <Image
                          source={slot.uri}
                          contentFit="cover"
                          cachePolicy="memory-disk"
                          style={{ width: THUMB_SIZE, height: THUMB_SIZE }}
                        />
                        {slot.overflowLabel ? (
                          <View
                            style={[
                              StyleSheet.absoluteFillObject,
                              {
                                backgroundColor: "rgba(0,0,0,0.58)",
                                alignItems: "center",
                                justifyContent: "center",
                              },
                            ]}
                          >
                            <Text
                              style={{
                                fontFamily: ListifyFonts.bold,
                                color: colors.textOnPrimary,
                                fontSize: 14,
                              }}
                            >
                              {slot.overflowLabel}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}
        </View>

        <View
          style={{
            paddingHorizontal: GALLERY_SIDE,
            paddingTop: showThumbStrip ? THUMB_OVERLAP + 14 : 20,
            backgroundColor: colors.background,
          }}
        >
          {/* Category + Price */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <Text
              style={{
                fontFamily: ListifyFonts.regular,
                fontSize: 14,
                color: colors.textSecondary,
              }}
            >
              {badgeLabel}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "baseline" }}>
                <Text style={{ fontFamily: ListifyFonts.bold, fontSize: 20, color: colors.textPrimary }}>
                  {price || "On request"}
                </Text>
                {price && isRental ? (
                  <Text style={{ fontFamily: ListifyFonts.regular, fontSize: 14, color: colors.textSecondary }}>
                    /Month
                  </Text>
                ) : null}
              </View>
              {distanceLabel ? (
                <Text
                  style={{
                    fontFamily: ListifyFonts.medium,
                    fontSize: 13,
                    color: colors.textSecondary,
                    paddingBottom: 1,
                  }}
                >
                  {distanceLabel}
                </Text>
              ) : null}
            </View>
          </View>

          <Text
            style={{
              marginTop: 8,
              fontFamily: ListifyFonts.bold,
              fontSize: 22,
              lineHeight: 28,
              color: colors.textPrimary,
            }}
          >
            {title}
          </Text>

          <View style={{ marginTop: 10, flexDirection: "row", alignItems: "flex-start", gap: 4 }}>
            <MaterialIcons name="location-on" size={15} color={colors.textSecondary} style={{ marginTop: 2 }} />
            <Text
              style={{
                flex: 1,
                fontFamily: ListifyFonts.regular,
                fontSize: 13,
                lineHeight: 18,
                color: colors.textSecondary,
              }}
            >
              {locationText}
            </Text>
          </View>

          {/* Specs */}
          <View
            style={{
              marginTop: 22,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 18,
              paddingVertical: 16,
              paddingHorizontal: 4,
              flexDirection: "row",
              backgroundColor: specsSurface,
            }}
          >
            {[
              { icon: "king-bed" as const, label: `${bedrooms || 0} Bed` },
              { icon: "bathtub" as const, label: `${bathrooms || 0} Bath` },
              {
                icon: "square-foot" as const,
                label: squareFeet
                  ? `${Number(squareFeet).toLocaleString()} Sqrt`
                  : "— Sqrt",
              },
            ].map((spec, i) => (
              <View
                key={spec.label}
                style={{
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  borderRightWidth: i < 2 ? 1 : 0,
                  borderRightColor: colors.border,
                }}
              >
                <MaterialIcons name={spec.icon} size={20} color={colors.icon} />
                <Text style={{ fontFamily: ListifyFonts.semiBold, fontSize: 13, color: colors.textPrimary }}>
                  {spec.label}
                </Text>
              </View>
            ))}
          </View>

          {listing ? (
            <ListingLocationSection
              listing={listing}
              category={categorySlug}
              embedded
            />
          ) : null}

          {/* Description — always visible like reference */}
          <View style={{ marginTop: 26 }}>
            <Text style={{ fontFamily: ListifyFonts.bold, fontSize: 17, color: colors.textPrimary }}>
              Description
            </Text>
            <Text
              style={{
                marginTop: 10,
                fontFamily: ListifyFonts.regular,
                fontSize: 14,
                lineHeight: 23,
                color: colors.textSecondary,
              }}
            >
              {descPreview}
              {showReadMore ? (
                <Text
                  onPress={() => setDescExpanded((v) => !v)}
                  style={{ fontFamily: ListifyFonts.bold, color: colors.textPrimary }}
                >
                  {descExpanded ? " Read Less" : "Read More..."}
                </Text>
              ) : null}
            </Text>
          </View>

          {/* Listing Broker */}
          <View style={{ marginTop: 26, marginBottom: 8 }}>
            <Text style={{ fontFamily: ListifyFonts.bold, fontSize: 17, color: colors.textPrimary }}>
              Listing Broker
            </Text>
            <View
              style={{
                marginTop: 16,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: cardSurface,
                padding: 14,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <Pressable
                  onPress={openSellerProfile}
                  style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}
                >
                  <View style={{ position: "relative" }}>
                    <View
                      style={{
                        width: 52,
                        height: 52,
                        borderRadius: 26,
                        overflow: "hidden",
                        backgroundColor: colors.surfaceMuted,
                      }}
                    >
                      <ProfileAvatarImage
                        user={sellerProfileUser}
                        fallbackName={sellerName}
                        style={{ width: 52, height: 52 }}
                        iconSize={26}
                      />
                    </View>
                    {isSellerVerified ? (
                      <View
                        style={{
                          position: "absolute",
                          bottom: -1,
                          right: -1,
                          width: 18,
                          height: 18,
                          borderRadius: 9,
                          borderWidth: 2,
                          borderColor: cardSurface,
                          backgroundColor: colors.primary,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <MaterialIcons name="verified" size={11} color={colors.textOnPrimary} />
                      </View>
                    ) : null}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Text
                        numberOfLines={1}
                        style={{
                          flexShrink: 1,
                          fontFamily: ListifyFonts.bold,
                          fontSize: 15,
                          color: colors.textPrimary,
                        }}
                      >
                        {sellerName}
                      </Text>
                      {isSellerVerified ? (
                        <MaterialIcons name="verified" size={16} color={colors.primary} />
                      ) : null}
                    </View>
                    {sellerRating > 0 ? (
                      <View style={{ marginTop: 4 }}>
                        <SellerStars rating={sellerRating} />
                      </View>
                    ) : null}
                    {brokerContact ? (
                      <Pressable onPress={() => void handleCallBroker()} hitSlop={6}>
                        <Text
                          style={{
                            marginTop: 4,
                            fontFamily: ListifyFonts.semiBold,
                            fontSize: 14,
                            color: colors.primary,
                          }}
                        >
                          {brokerContact.display}
                        </Text>
                      </Pressable>
                    ) : (
                      <Text
                        style={{
                          marginTop: 4,
                          fontFamily: ListifyFonts.regular,
                          fontSize: 13,
                          color: colors.textSecondary,
                        }}
                      >
                        Contact number not available
                      </Text>
                    )}
                  </View>
                </Pressable>

                <Pressable
                  onPress={() => {
                    if (!sellerId) {
                      showErrorToast("Unavailable", "Seller information is missing for this listing.");
                      return;
                    }
                    requireAuth("message", () => {
                      router.push(
                        buildListingChatHref({
                          recipientId: sellerId,
                          sellerId,
                          name: sellerName,
                          productId: listing._id,
                          productType: categorySlug,
                          productTitle: title,
                          productPrice: listing.price,
                          productImage: listing.images?.[0] ?? null,
                          currency: listing.currency ?? "₹",
                        }),
                      );
                    });
                  }}
                  style={({ pressed }) => [{
                    ...brokerActionBtn,
                    opacity: pressed ? 0.85 : 1,
                  }]}
                >
                  <MaterialIcons name="chat-bubble-outline" size={20} color={colors.textOnPrimary} />
                </Pressable>

                <Pressable
                  onPress={() => void handleCallBroker()}
                  style={({ pressed }) => [{
                    ...brokerActionBtn,
                    opacity: pressed ? 0.85 : 1,
                  }]}
                >
                  <MaterialIcons name="phone" size={20} color={colors.textOnPrimary} />
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>

      {!isOwn ? (
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            paddingHorizontal: 20,
            paddingTop: 10,
            paddingBottom: footerBottomPadding,
            backgroundColor: colors.background,
            borderTopWidth: isDark ? 1 : 0,
            borderTopColor: colors.border,
          }}
        >
          <Pressable
            onPress={() => {
              if (!sellerId) {
                showErrorToast("Unavailable", "Seller information is missing for this listing.");
                return;
              }
              requireAuth("offer", openOfferSheet);
            }}
            style={({ pressed }) => ({
              height: 56,
              borderRadius: 999,
              backgroundColor: colors.primary,
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.92 : 1,
            })}
          >
            <Text style={{ fontFamily: ListifyFonts.bold, fontSize: 16, color: colors.textOnPrimary }}>
              Book Now
            </Text>
          </Pressable>
        </View>
      ) : null}

      {/* Make Offer Bottom Sheet */}
      <Modal
        visible={offerVisible}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={closeOfferSheet}
      >
        <Pressable onPress={closeOfferSheet} className="flex-1 bg-black/40">
          <View style={{ flex: 1, minHeight: 80 }} />
        </Pressable>
        <Animated.View
          style={{
            transform: [{
              translateY: slideAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [600, 0],
              }),
            }],
          }}
        >
          <View
            style={{
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              borderTopWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
              paddingBottom: Math.max(insets.bottom, 16),
              shadowColor: "#000",
              shadowOffset: { width: 0, height: -12 },
              shadowOpacity: isDark ? 0.4 : 0.15,
              shadowRadius: 40,
              elevation: 24,
            }}
          >
            <View style={{ alignItems: "center", paddingVertical: 12 }}>
              <View
                style={{
                  height: 6,
                  width: 48,
                  borderRadius: 999,
                  backgroundColor: colors.borderStrong,
                }}
              />
            </View>

            <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
              {offerSent ? (
                <View style={{ alignItems: "center", paddingVertical: 32 }}>
                  <View
                    style={{
                      marginBottom: 16,
                      height: 64,
                      width: 64,
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: 32,
                      backgroundColor: colors.primarySoft,
                    }}
                  >
                    <MaterialIcons name="check-circle" size={40} color={colors.primary} />
                  </View>
                  <Text
                    style={{
                      fontFamily: ListifyFonts.bold,
                      fontSize: 20,
                      color: colors.textPrimary,
                    }}
                  >
                    Offer Sent!
                  </Text>
                  <Text
                    style={{
                      marginTop: 4,
                      textAlign: "center",
                      fontFamily: ListifyFonts.regular,
                      fontSize: 14,
                      color: colors.textSecondary,
                    }}
                  >
                    The seller will be notified and can accept or counter.
                  </Text>
                </View>
              ) : (
                <>
                  <View
                    style={{
                      marginBottom: 20,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: ListifyFonts.bold,
                        fontSize: 24,
                        color: colors.textPrimary,
                      }}
                    >
                      Make an Offer
                    </Text>
                    <Pressable
                      onPress={closeOfferSheet}
                      style={({ pressed }) => ({
                        borderRadius: 999,
                        padding: 8,
                        backgroundColor: pressed ? colors.surfaceMuted : "transparent",
                      })}
                    >
                      <MaterialIcons name="close" size={24} color={colors.iconMuted} />
                    </Pressable>
                  </View>

                  <View
                    style={{
                      marginBottom: 20,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 12,
                      borderRadius: 12,
                      backgroundColor: colors.surfaceMuted,
                      padding: 12,
                    }}
                  >
                    {images[0] ? (
                      <Image
                        source={images[0]}
                        contentFit="cover"
                        style={{ height: 56, width: 56, borderRadius: 8 }}
                      />
                    ) : (
                      <View
                        style={{
                          height: 56,
                          width: 56,
                          alignItems: "center",
                          justifyContent: "center",
                          borderRadius: 8,
                          backgroundColor: colors.border,
                        }}
                      >
                        <MaterialIcons name="image" size={24} color={colors.iconMuted} />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text
                        numberOfLines={1}
                        style={{
                          fontFamily: ListifyFonts.medium,
                          fontSize: 13,
                          color: colors.textPrimary,
                        }}
                      >
                        {title}
                      </Text>
                      <Text
                        style={{
                          marginTop: 2,
                          fontFamily: ListifyFonts.medium,
                          fontSize: 12,
                          textTransform: "uppercase",
                          color: colors.textSecondary,
                        }}
                      >
                        Listed Price
                      </Text>
                      <Text
                        style={{
                          fontFamily: ListifyFonts.bold,
                          fontSize: 16,
                          color: colors.textPrimary,
                        }}
                      >
                        {price}
                      </Text>
                    </View>
                  </View>

                  {recommendedOffers.length > 0 && (
                    <View style={{ marginBottom: 24 }}>
                      <Text
                        style={{
                          marginBottom: 12,
                          fontFamily: ListifyFonts.medium,
                          fontSize: 12,
                          textTransform: "uppercase",
                          letterSpacing: 0.5,
                          color: colors.textSecondary,
                        }}
                      >
                        Recommended Offers
                      </Text>
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                        {recommendedOffers.map((amt) => {
                          const label = formatPrice(amt, listing?.currency, listing?.countryCode ?? isoCountryCode);
                          const isSelected = selectedChip === String(amt);
                          return (
                            <Pressable
                              key={amt}
                              onPress={() => {
                                setSelectedChip(String(amt));
                                setOfferAmount(String(amt));
                              }}
                              style={{
                                borderRadius: 999,
                                paddingHorizontal: 16,
                                paddingVertical: 10,
                                borderWidth: 1.5,
                                borderColor: isSelected ? colors.primary : colors.border,
                                backgroundColor: isSelected ? colors.primarySoft : colors.surface,
                              }}
                            >
                              <Text
                                style={{
                                  fontFamily: ListifyFonts.medium,
                                  fontSize: 14,
                                  color: isSelected ? colors.primary : colors.textPrimary,
                                }}
                              >
                                {label}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  )}

                  <View style={{ marginBottom: 24 }}>
                    <Text
                      style={{
                        marginBottom: 8,
                        fontFamily: ListifyFonts.medium,
                        fontSize: 12,
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                        color: colors.textPrimary,
                      }}
                    >
                      Your Offer
                    </Text>
                    <View
                      style={{
                        height: 56,
                        flexDirection: "row",
                        alignItems: "center",
                        borderRadius: 12,
                        borderWidth: 2,
                        borderColor: colors.border,
                        backgroundColor: colors.inputBackground,
                        paddingHorizontal: 16,
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: ListifyFonts.bold,
                          fontSize: 20,
                          color: colors.textTertiary,
                        }}
                      >
                        {getCurrencySymbol(listing?.currency)}
                      </Text>
                      <TextInput
                        value={offerAmount}
                        onChangeText={(val) => {
                          setOfferAmount(val.replace(/[^0-9]/g, ""));
                          setSelectedChip("");
                        }}
                        keyboardType="numeric"
                        placeholder="Enter amount"
                        placeholderTextColor={colors.inputPlaceholder}
                        style={{
                          marginLeft: 8,
                          flex: 1,
                          fontFamily: ListifyFonts.bold,
                          fontSize: 20,
                          color: colors.textPrimary,
                          paddingVertical: 0,
                        }}
                      />
                    </View>
                    <View style={{ marginTop: 8, flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <MaterialIcons name="info-outline" size={14} color={colors.textSecondary} />
                      <Text
                        style={{
                          fontFamily: ListifyFonts.regular,
                          fontSize: 12,
                          color: colors.textSecondary,
                        }}
                      >
                        Offers are usually 5-15% below listed price
                      </Text>
                    </View>
                  </View>

                  <Pressable
                    onPress={handleSendOffer}
                    disabled={sendingOffer || !offerAmount}
                    style={({ pressed }) => ({
                      overflow: "hidden",
                      borderRadius: 12,
                      transform: [{ scale: pressed ? 0.98 : 1 }],
                      opacity: !offerAmount ? 0.5 : 1,
                    })}
                  >
                    <LinearGradient
                      colors={[colors.primary, colors.primaryDeep]}
                      start={{ x: 0, y: 0.5 }}
                      end={{ x: 1, y: 0.5 }}
                      style={{
                        height: 56,
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 8,
                      }}
                    >
                      {sendingOffer ? (
                        <ActivityIndicator size="small" color={colors.textOnPrimary} />
                      ) : (
                        <>
                          <Text
                            style={{
                              fontFamily: ListifyFonts.semiBold,
                              fontSize: 18,
                              color: colors.textOnPrimary,
                            }}
                          >
                            Send Offer
                          </Text>
                          <MaterialIcons name="send" size={20} color={colors.textOnPrimary} />
                        </>
                      )}
                    </LinearGradient>
                  </Pressable>
                </>
              )}
            </View>
          </View>
        </Animated.View>
      </Modal>

      <AuthGateBottomSheet
        visible={authGateVisible}
        onClose={() => setAuthGateVisible(false)}
        action={authGateAction}
        onAuthenticated={handleAuthSuccess}
      />
    </View>
  );
}

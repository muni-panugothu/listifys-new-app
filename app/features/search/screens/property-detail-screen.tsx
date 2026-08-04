import { MaterialIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { type Href, useLocalSearchParams, useRouter } from "@/lib/safe-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Keyboard,
  Linking,
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

import { AUTH_API_BASE_URL, getAuthErrorMessage } from "@/features/auth/services/auth-api";
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
import { showErrorToast } from "@/lib/toast";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const HERO_HEIGHT = Math.round(SCREEN_WIDTH * 0.78);
const THUMB = 52;
const THUMB_GAP = 8;
const BRAND = "#27BB97";
const MUTED = "#808080";

export function PropertyDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
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
  const [listing, setListing] = useState<ListingItem | null>(swrListing ?? null);
  const loading = !listing && swrLoading;
  const [isSaved, setIsSaved] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const heroScrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (swrListing && swrListing !== listing) {
      setListing(swrListing);
    }
  }, [swrListing]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!listing) return;
    addToRecentlyViewed(listing, locationLabel, isoCountryCode).catch(() => {});
    if (user?.id && listing.savedBy?.includes(user.id)) {
      setIsSaved(true);
    }
  }, [listing, locationLabel, isoCountryCode, user?.id]);

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
  const features: string[] = (listing as any)?.features ?? [];

  const sellerName = listing?.seller?.name ?? listing?.sellerName ?? "Seller";
  const sellerProfileImage = listing?.seller?.profileImage
    ? listing.seller.profileImage.startsWith("http")
      ? listing.seller.profileImage
      : `${AUTH_API_BASE_URL}${listing.seller.profileImage}`
    : null;
  const sellerJoined = listing?.seller?.createdAt
    ? `Member since ${new Date(listing.seller.createdAt).getFullYear()}`
    : "";
  const sellerId = listing ? getListingSellerId(listing) : null;

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
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color={BRAND} size="large" />
      </View>
    );
  }

  if (!listing) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <MaterialIcons name="error-outline" size={48} color="#CBD5E1" />
        <Text className="mt-2 text-[14px] text-[#808080]">Property not found</Text>
        <Pressable onPress={() => router.back()} className="mt-4">
          <Text style={{ fontFamily: ListifyFonts.semiBold, color: BRAND }}>Go Back</Text>
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
  const showThumbStrip = images.length > 1;
  // Up to 5 thumb slots; last slot becomes "N+" when there are more than 5 images.
  const thumbSlots = images.slice(0, Math.min(5, images.length));
  const overflowCount = images.length > 5 ? images.length - 4 : 0;
  const descPreview =
    description.length > 140 && !descExpanded
      ? `${description.slice(0, 140).trim()}… `
      : description;
  const sellerPhone = listing.phone?.trim() || "";

  const scrollHeroTo = (index: number) => {
    const safe = Math.max(0, Math.min(index, images.length - 1));
    setActiveImageIndex(safe);
    heroScrollRef.current?.scrollTo({ x: safe * SCREEN_WIDTH, animated: true });
  };

  const circleBtn = {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    alignItems: "center" as const,
    justifyContent: "center" as const,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  };

  return (
    <View className="flex-1 bg-white">
      <ScrollView
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        removeClippedSubviews
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[BRAND]}
            tintColor={BRAND}
          />
        }
        contentContainerStyle={{
          paddingBottom: isOwn ? 24 + footerBottomPadding : 100 + footerBottomPadding,
        }}
      >
        {/* Hero + floating thumbnail strip (matches reference) */}
        <View style={{ marginBottom: showThumbStrip ? THUMB / 2 + 12 : 0 }}>
          <View
            style={{
              height: HERO_HEIGHT,
              width: SCREEN_WIDTH,
              backgroundColor: "#E5E7EB",
              borderBottomLeftRadius: 28,
              borderBottomRightRadius: 28,
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
                <MaterialIcons name="apartment" size={48} color="#CBD5E1" />
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
                <MaterialIcons name="chevron-left" size={26} color="#111111" />
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
                  <MaterialIcons name="share" size={18} color="#111111" />
                </Pressable>
                <Pressable
                  onPress={() => requireAuth("save", () => void handleToggleSave())}
                  style={({ pressed }) => [{ ...circleBtn, opacity: pressed ? 0.85 : 1 }]}
                >
                  <MaterialIcons
                    name={isSaved ? "favorite" : "favorite-border"}
                    size={18}
                    color={isSaved ? BRAND : "#111111"}
                  />
                </Pressable>
              </View>
            </View>
          </View>

          {showThumbStrip ? (
            <View
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: -(THUMB / 2 + 6),
                alignItems: "center",
                zIndex: 5,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: THUMB_GAP,
                  backgroundColor: "#FFFFFF",
                  borderRadius: 18,
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.12,
                  shadowRadius: 12,
                  elevation: 6,
                }}
              >
                {thumbSlots.map((img, idx) => {
                  const isOverflowSlot = idx === 4 && overflowCount > 0;
                  const active = isOverflowSlot
                    ? activeImageIndex >= 4
                    : activeImageIndex === idx;

                  return (
                    <Pressable
                      key={`${img}-thumb-${idx}`}
                      onPress={() => scrollHeroTo(isOverflowSlot ? 4 : idx)}
                      style={{
                        width: THUMB + 6,
                        height: THUMB + 6,
                        borderRadius: 14,
                        padding: 3,
                        backgroundColor: active ? "#FFFFFF" : "transparent",
                        // Soft shadow only when selected so the white frame reads clearly
                        shadowColor: "#000",
                        shadowOffset: { width: 0, height: 0 },
                        shadowOpacity: active ? 0.22 : 0,
                        shadowRadius: active ? 2 : 0,
                        elevation: active ? 2 : 0,
                      }}
                    >
                      <View
                        style={{
                          width: THUMB,
                          height: THUMB,
                          borderRadius: 12,
                          overflow: "hidden",
                          backgroundColor: "#F3F4F6",
                        }}
                      >
                        <Image
                          source={img}
                          contentFit="cover"
                          cachePolicy="memory-disk"
                          style={{ width: THUMB, height: THUMB }}
                        />
                        {isOverflowSlot ? (
                          <View
                            style={[
                              StyleSheet.absoluteFillObject,
                              {
                                backgroundColor: "rgba(0,0,0,0.55)",
                                alignItems: "center",
                                justifyContent: "center",
                              },
                            ]}
                          >
                            <Text
                              style={{
                                fontFamily: ListifyFonts.bold,
                                color: "#FFFFFF",
                                fontSize: 13,
                              }}
                            >
                              {overflowCount}+
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
            paddingHorizontal: 20,
            paddingTop: showThumbStrip ? THUMB / 2 + 20 : 20,
          }}
        >
          {/* Category + Price */}
          <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <Text
              style={{
                fontFamily: ListifyFonts.regular,
                fontSize: 13,
                color: MUTED,
                marginTop: 4,
              }}
            >
              {badgeLabel}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4 }}>
              <Text style={{ fontFamily: ListifyFonts.bold, fontSize: 22, color: "#111111" }}>
                {price || "On request"}
              </Text>
              {price && isRental ? (
                <Text style={{ fontFamily: ListifyFonts.regular, fontSize: 13, color: MUTED }}>
                  /Month
                </Text>
              ) : null}
            </View>
          </View>

          <Text
            style={{
              marginTop: 6,
              fontFamily: ListifyFonts.bold,
              fontSize: 24,
              lineHeight: 30,
              color: "#111111",
            }}
          >
            {title}
          </Text>

          <View style={{ marginTop: 8, flexDirection: "row", alignItems: "flex-start", gap: 6 }}>
            <MaterialIcons name="location-on" size={16} color={MUTED} style={{ marginTop: 1 }} />
            <Text
              style={{
                flex: 1,
                fontFamily: ListifyFonts.regular,
                fontSize: 13,
                lineHeight: 18,
                color: MUTED,
              }}
            >
              {locationText}
              {distanceLabel ? ` · ${distanceLabel}` : ""}
            </Text>
          </View>

          {/* Specs */}
          <View
            style={{
              marginTop: 20,
              borderWidth: 1,
              borderColor: "#E8E8E8",
              borderRadius: 16,
              paddingVertical: 14,
              paddingHorizontal: 8,
              flexDirection: "row",
            }}
          >
            {[
              { icon: "bed" as const, label: `${bedrooms || 0} Bed` },
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
                  gap: 6,
                  borderRightWidth: i < 2 ? 1 : 0,
                  borderRightColor: "#EEEEEE",
                }}
              >
                <MaterialIcons name={spec.icon} size={18} color="#111111" />
                <Text style={{ fontFamily: ListifyFonts.medium, fontSize: 13, color: "#111111" }}>
                  {spec.label}
                </Text>
              </View>
            ))}
          </View>

          {/* Description */}
          {description ? (
            <View style={{ marginTop: 24 }}>
              <Text style={{ fontFamily: ListifyFonts.bold, fontSize: 18, color: "#111111" }}>
                Description
              </Text>
              <Text
                style={{
                  marginTop: 8,
                  fontFamily: ListifyFonts.regular,
                  fontSize: 14,
                  lineHeight: 22,
                  color: MUTED,
                }}
              >
                {descPreview}
                {description.length > 140 ? (
                  <Text
                    onPress={() => setDescExpanded((v) => !v)}
                    style={{ fontFamily: ListifyFonts.bold, color: "#111111" }}
                  >
                    {descExpanded ? " Read Less" : "Read More..."}
                  </Text>
                ) : null}
              </Text>
            </View>
          ) : null}

          {/* Amenities */}
          {features.length > 0 ? (
            <View style={{ marginTop: 24 }}>
              <Text style={{ fontFamily: ListifyFonts.bold, fontSize: 18, color: "#111111" }}>
                Amenities
              </Text>
              <View
                style={{
                  marginTop: 12,
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: 8,
                }}
              >
                {features.map((feat) => (
                  <View
                    key={feat}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 12,
                      backgroundColor: "#F5F5F5",
                    }}
                  >
                    <MaterialIcons name="check-circle" size={16} color={BRAND} />
                    <Text style={{ fontFamily: ListifyFonts.medium, fontSize: 13, color: "#111111" }}>
                      {feat}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {/* Listing Broker */}
          <View style={{ marginTop: 28 }}>
            <Text style={{ fontFamily: ListifyFonts.bold, fontSize: 18, color: "#111111" }}>
              Listing Broker
            </Text>
            <View
              style={{
                marginTop: 14,
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
              }}
            >
              <Pressable
                onPress={() => {
                  if (sellerId) router.push(`/seller-public-profile?userId=${sellerId}` as Href);
                }}
                style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1 }}
              >
                {sellerProfileImage ? (
                  <Image
                    source={sellerProfileImage}
                    contentFit="cover"
                    style={{ width: 52, height: 52, borderRadius: 26 }}
                  />
                ) : (
                  <View
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: 26,
                      backgroundColor: "#F3F4F6",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <MaterialIcons name="person" size={26} color="#9CA3AF" />
                  </View>
                )}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    numberOfLines={1}
                    style={{ fontFamily: ListifyFonts.bold, fontSize: 15, color: "#111111" }}
                  >
                    {sellerName}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={{
                      marginTop: 2,
                      fontFamily: ListifyFonts.regular,
                      fontSize: 12,
                      color: MUTED,
                    }}
                  >
                    {sellerPhone || sellerId || sellerJoined || "Seller"}
                  </Text>
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
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: BRAND,
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: pressed ? 0.85 : 1,
                }]}
              >
                <MaterialIcons name="chat-bubble" size={18} color="#FFFFFF" />
              </Pressable>

              <Pressable
                onPress={() => {
                  if (sellerPhone) {
                    void Linking.openURL(`tel:${sellerPhone}`);
                    return;
                  }
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
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: BRAND,
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: pressed ? 0.85 : 1,
                }]}
              >
                <MaterialIcons name="phone" size={18} color="#FFFFFF" />
              </Pressable>
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
            paddingTop: 12,
            paddingBottom: footerBottomPadding,
            backgroundColor: "#FFFFFF",
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
              height: 54,
              borderRadius: 999,
              backgroundColor: BRAND,
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.9 : 1,
            })}
          >
            <Text style={{ fontFamily: ListifyFonts.bold, fontSize: 16, color: "#FFFFFF" }}>
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
            className="rounded-t-3xl border-t border-slate-100 bg-white"
            style={{
              paddingBottom: Math.max(insets.bottom, 16),
              shadowColor: "#000",
              shadowOffset: { width: 0, height: -12 },
              shadowOpacity: 0.15,
              shadowRadius: 40,
              elevation: 24,
            }}
          >
            <View className="items-center py-3">
              <View className="h-1.5 w-12 rounded-full bg-slate-200" />
            </View>

            <View className="px-4 pb-4">
              {offerSent ? (
                <View className="items-center py-8">
                  <View className="mb-4 h-16 w-16 items-center justify-center rounded-full bg-[#27BB97]/15">
                    <MaterialIcons name="check-circle" size={40} color="#27BB97" />
                  </View>
                  <Text className="text-[20px] font-bold text-[#161D1A]">Offer Sent!</Text>
                  <Text className="mt-1 text-center text-[14px] text-[#6C7A74]">
                    The seller will be notified and can accept or counter.
                  </Text>
                </View>
              ) : (
                <>
                  <View className="mb-5 flex-row items-center justify-between">
                    <Text className="text-[24px] font-bold tracking-tight text-[#161D1A]">
                      Make an Offer
                    </Text>
                    <Pressable
                      onPress={closeOfferSheet}
                      className="rounded-full p-2"
                      style={({ pressed }) => ({ backgroundColor: pressed ? "#F1F5F9" : "transparent" })}
                    >
                      <MaterialIcons name="close" size={24} color="#94A3B8" />
                    </Pressable>
                  </View>

                  <View className="mb-5 flex-row items-center gap-3 rounded-xl bg-[#F3F4F6] p-3">
                    {images[0] ? (
                      <Image source={images[0]} contentFit="cover" className="h-14 w-14 rounded-lg" />
                    ) : (
                      <View className="h-14 w-14 items-center justify-center rounded-lg bg-slate-200">
                        <MaterialIcons name="image" size={24} color="#CBD5E1" />
                      </View>
                    )}
                    <View className="flex-1">
                      <Text className="text-[13px] font-medium text-[#161D1A]" numberOfLines={1}>
                        {title}
                      </Text>
                      <Text className="mt-0.5 text-[12px] font-medium uppercase text-[#6C7A74]">Listed Price</Text>
                      <Text className="text-[16px] font-bold text-[#161D1A]">{price}</Text>
                    </View>
                  </View>

                  {recommendedOffers.length > 0 && (
                    <View className="mb-6">
                      <Text className="mb-3 text-[12px] font-medium uppercase tracking-wide text-[#6C7A74]">
                        Recommended Offers
                      </Text>
                      <View className="flex-row flex-wrap gap-2">
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
                              className="rounded-full px-4 py-2.5"
                              style={{
                                borderWidth: 1.5,
                                borderColor: isSelected ? BRAND : "#E2E8F0",
                                backgroundColor: isSelected ? "rgba(39,187,151,0.1)" : "#FFFFFF",
                              }}
                            >
                              <Text
                                className="text-[14px] font-medium"
                                style={{ color: isSelected ? BRAND : "#161D1A" }}
                              >
                                {label}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  )}

                  <View className="mb-6">
                    <Text className="mb-2 text-[12px] font-medium uppercase tracking-wide text-[#161D1A]">Your Offer</Text>
                    <View className="h-14 flex-row items-center rounded-xl border-2 border-slate-100 bg-slate-50 px-4">
                      <Text className="text-[20px] font-bold text-slate-400">
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
                        placeholderTextColor="#CBD5E1"
                        className="ml-2 flex-1 text-[20px] font-bold text-[#161D1A]"
                        style={{ paddingVertical: 0 }}
                      />
                    </View>
                    <View className="mt-2 flex-row items-center gap-1">
                      <MaterialIcons name="info-outline" size={14} color="#6C7A74" />
                      <Text className="text-[12px] text-[#6C7A74]">Offers are usually 5-15% below listed price</Text>
                    </View>
                  </View>

                  <Pressable
                    onPress={handleSendOffer}
                    disabled={sendingOffer || !offerAmount}
                    className="overflow-hidden rounded-xl"
                    style={({ pressed }) => ({
                      transform: [{ scale: pressed ? 0.98 : 1 }],
                      opacity: !offerAmount ? 0.5 : 1,
                    })}
                  >
                    <LinearGradient
                      colors={[BRAND, "#1FA882"]}
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
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <>
                          <Text className="text-[18px] font-semibold text-white">Send Offer</Text>
                          <MaterialIcons name="send" size={20} color="#FFFFFF" />
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

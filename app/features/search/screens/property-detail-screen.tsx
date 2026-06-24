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
  fetchListingById,
  toggleSaveListing,
  type ListingItem,
} from "@/features/listing/services/listing-api";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { ListingLocationSection } from "@/components/listing-location-section";
import { getListingDistanceLabel } from "@/lib/listing-distance";
import { Image } from "@/lib/nativewind-interop";
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

export function PropertyDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string; category?: string }>();
  const user = useAppSelector((s) => s.auth.user);
  const userCoords = useAppSelector(selectLocationCoords);
  const locationLabel = useAppSelector(selectLocationLabel);
  const isoCountryCode = useAppSelector(selectIsoCountryCode);
  const canShowDistanceOnCards = useAppSelector(selectCanShowDistanceOnCards);

  const [listing, setListing] = useState<ListingItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSaved, setIsSaved] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  const categorySlug = (params.category ?? "properties") as CategorySlug;
  const listingId = params.id;

  const loadListing = useCallback(async () => {
    if (!listingId) return;
    setLoading(true);
    try {
      const res = await fetchListingById(categorySlug, listingId);
      if (res.listing) {
        setListing(res.listing);
        addToRecentlyViewed(res.listing, locationLabel, isoCountryCode).catch(() => {});
        if (user?.id && res.listing.savedBy?.includes(user.id)) {
          setIsSaved(true);
        }
      }
    } catch {
      // keep null
    } finally {
      setLoading(false);
    }
  }, [categorySlug, listingId, user?.id]);

  useEffect(() => {
    loadListing();
  }, [loadListing]);

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
  const furnishing = (listing as any)?.furnishing ?? "";
  const features: string[] = (listing as any)?.features ?? [];
  const availableFrom = (listing as any)?.availableFrom
    ? new Date((listing as any).availableFrom).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "";
  const petFriendly = (listing as any)?.petFriendly ?? false;

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

  const topBarHeight = insets.top + 64;
  const footerBottomPadding = Math.max(insets.bottom, 10);

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

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-[#F6F7F8]">
        <ActivityIndicator size="large" color="#27BB97" />
      </View>
    );
  }

  if (!listing) {
    return (
      <View className="flex-1 items-center justify-center bg-[#F6F7F8]">
        <MaterialIcons name="error-outline" size={48} color="#CBD5E1" />
        <Text className="mt-2 text-[14px] text-[#6C7A74]">Property not found</Text>
        <Pressable onPress={() => router.back()} className="mt-4">
          <Text className="text-[14px] font-semibold text-[#27BB97]">Go Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#F6F7F8]">
      <View
        className="absolute inset-x-0 top-0 z-50 border-b border-slate-100 bg-white/80 px-4"
        style={{
          paddingTop: insets.top,
          height: topBarHeight,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.05,
          shadowRadius: 2,
          elevation: 2,
        }}
      >
        <View className="h-16 flex-row items-center justify-between">
          <Pressable
            onPress={() => router.back()}
            className="p-2"
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          >
            <MaterialIcons name="arrow-back" size={22} color="#161D1A" />
          </Pressable>
          <Text className="text-[20px] font-black tracking-tight text-[#27BB97]">
            Listify
          </Text>
          <View className="flex-row items-center gap-4 pr-2">
            <Pressable style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
              <MaterialIcons name="share" size={22} color="#6C7A74" />
            </Pressable>
            <Pressable
              onPress={handleToggleSave}
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <MaterialIcons
                name={isSaved ? "favorite" : "favorite-border"}
                size={22}
                color={isSaved ? "#EF4444" : "#6C7A74"}
              />
            </Pressable>
          </View>
        </View>
      </View>

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
        contentContainerStyle={{
          paddingTop: topBarHeight,
          paddingBottom: 112 + footerBottomPadding,
        }}
      >
        {/* Image Gallery */}
        {images.length > 0 ? (
          <View className="relative w-full" style={{ aspectRatio: 4 / 3 }}>
            <ScrollView
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
                  key={idx}
                  source={img}
                  contentFit="cover"
                  transition={180}
                  style={{ width: SCREEN_WIDTH, height: "100%" }}
                />
              ))}
            </ScrollView>
            <View className="absolute bottom-4 right-4 rounded-full bg-black/50 px-3 py-1">
              <Text className="text-[12px] text-white">
                {activeImageIndex + 1}/{images.length}
              </Text>
            </View>
          </View>
        ) : (
          <View className="w-full items-center justify-center bg-[#E9EFEB]" style={{ aspectRatio: 4 / 3 }}>
            <MaterialIcons name="apartment" size={48} color="#CBD5E1" />
          </View>
        )}

        <View className="mt-6 px-4">
          {/* Title & Price */}
          <View className="gap-1">
            <Text className="text-[24px] font-bold leading-8 text-[#161D1A]">{title}</Text>
            <View className="flex-row items-center gap-2">
              <Text className="text-[20px] font-bold text-[#005FB0]">{price}</Text>
              {listing.subcategory === "Rentals" && (
                <Text className="text-[12px] text-[#6C7A74]">/ month</Text>
              )}
            </View>
            {distanceLabel ? (
              <View className="mt-1 flex-row items-center gap-1">
                <MaterialIcons name="near-me" size={14} color="#27BB97" />
                <Text className="text-[13px] font-semibold text-[#27BB97]">
                  {distanceLabel} away
                </Text>
              </View>
            ) : null}
          </View>

          {listing ? (
            <ListingLocationSection listing={listing} category={categorySlug} />
          ) : null}

          {/* Quick Stats */}
          <View className="mt-6 flex-row border-y border-[#BBCAC3]/30 py-4">
            <View className="flex-1 items-center border-r border-[#BBCAC3]/30">
              <MaterialIcons name="bed" size={22} color="#006B55" />
              <Text className="mt-1 text-[12px] text-[#6C7A74]">
                {bedrooms} Bed{bedrooms !== 1 ? "s" : ""}
              </Text>
            </View>
            <View className="flex-1 items-center border-r border-[#BBCAC3]/30">
              <MaterialIcons name="bathtub" size={22} color="#006B55" />
              <Text className="mt-1 text-[12px] text-[#6C7A74]">
                {bathrooms} Bath{bathrooms !== 1 ? "s" : ""}
              </Text>
            </View>
            <View className="flex-1 items-center">
              <MaterialIcons name="square-foot" size={22} color="#006B55" />
              <Text className="mt-1 text-[12px] text-[#6C7A74]">
                {squareFeet ? `${squareFeet.toLocaleString()} Sq Ft` : "—"}
              </Text>
            </View>
          </View>

          {/* Details */}
          <View className="mt-6">
            <Text className="mb-3 text-[18px] font-semibold text-[#161D1A]">Details</Text>
            <View className="gap-2">
              {listing.subcategory ? (
                <View className="flex-row justify-between py-1">
                  <Text className="text-[13px] text-[#6C7A74]">Type</Text>
                  <Text className="text-[13px] font-medium text-[#161D1A]">{listing.subcategory}</Text>
                </View>
              ) : null}
              {furnishing ? (
                <View className="flex-row justify-between py-1">
                  <Text className="text-[13px] text-[#6C7A74]">Furnishing</Text>
                  <Text className="text-[13px] font-medium text-[#161D1A]">{furnishing}</Text>
                </View>
              ) : null}
              {availableFrom ? (
                <View className="flex-row justify-between py-1">
                  <Text className="text-[13px] text-[#6C7A74]">Available From</Text>
                  <Text className="text-[13px] font-medium text-[#161D1A]">{availableFrom}</Text>
                </View>
              ) : null}
              <View className="flex-row justify-between py-1">
                <Text className="text-[13px] text-[#6C7A74]">Pet Friendly</Text>
                <Text className="text-[13px] font-medium text-[#161D1A]">
                  {petFriendly ? "Yes" : "No"}
                </Text>
              </View>
              {listing.views != null && (
                <View className="flex-row justify-between py-1">
                  <Text className="text-[13px] text-[#6C7A74]">Views</Text>
                  <Text className="text-[13px] font-medium text-[#161D1A]">{listing.views}</Text>
                </View>
              )}
            </View>
          </View>

          {/* Amenities */}
          {features.length > 0 && (
            <View className="mt-6">
              <Text className="mb-4 text-[18px] font-semibold text-[#161D1A]">
                Key Amenities
              </Text>
              <View className="flex-row flex-wrap" style={{ columnGap: 8, rowGap: 8 }}>
                {features.map((feat) => (
                  <View
                    key={feat}
                    className="flex-row items-center gap-2 rounded-xl border border-[#DDE4DF]/50 bg-[#F3F4F6] px-4 py-3"
                  >
                    <MaterialIcons name="check-circle" size={18} color="#006B55" />
                    <Text className="text-[13px] text-[#161D1A]">{feat}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Description */}
          {description ? (
            <View className="mt-6">
              <Text className="mb-2 text-[18px] font-semibold text-[#161D1A]">Description</Text>
              <Text className="text-[14px] leading-6 text-[#3C4A44]">{description}</Text>
            </View>
          ) : null}

          {/* Seller Card */}
          <Pressable
            onPress={() => {
              if (sellerId) router.push(`/seller-public-profile?userId=${sellerId}` as Href);
            }}
            className="mt-6 rounded-2xl border border-[#BBCAC3]/30 bg-white p-4"
          >
            <View className="flex-row items-center gap-4">
              <View className="relative">
                {sellerProfileImage ? (
                  <Image
                    source={sellerProfileImage}
                    contentFit="cover"
                    transition={150}
                    className="h-16 w-16 rounded-full"
                  />
                ) : (
                  <View className="h-16 w-16 items-center justify-center rounded-full bg-[#E9EFEB]">
                    <MaterialIcons name="person" size={28} color="#6C7A74" />
                  </View>
                )}
              </View>
              <View className="flex-1">
                <Text className="text-[18px] font-semibold text-[#161D1A]">{sellerName}</Text>
                {sellerJoined ? (
                  <Text className="text-[12px] text-[#6C7A74]">{sellerJoined}</Text>
                ) : null}
              </View>
              <MaterialIcons name="chevron-right" size={24} color="#6C7A74" />
            </View>
          </Pressable>
        </View>
      </ScrollView>

      {/* Footer */}
      <View
        className="absolute inset-x-0 bottom-0 z-50 border-t border-[#BBCAC3]/20 bg-white/90 px-4"
        style={{ paddingTop: 12, paddingBottom: footerBottomPadding }}
      >
        <View className="mx-auto w-full max-w-xl flex-row gap-4">
          <Pressable
            onPress={() => {
              if (sellerId) {
                requireAuth("message", () => {
                   if (isOwnListing(listing, user?.id)) {
                     showErrorToast("Not Allowed", "You can't message yourself on your own listing.");
                     return;
                   }
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
              }
            }}
            disabled={isOwnListing(listing, user?.id)}
            className="h-12 flex-1 items-center justify-center rounded-xl border border-[#BBCAC3]"
            style={({ pressed }) => ({ opacity: isOwnListing(listing, user?.id) ? 0.5 : (pressed ? 0.8 : 1) })}
          >
            <Text className="text-[16px] font-semibold text-[#161D1A]" style={{ opacity: isOwnListing(listing, user?.id) ? 0.5 : 1 }}>Contact Seller</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              if (isOwnListing(listing, user?.id)) {
                showErrorToast("Not Available", "You cannot make an offer on your own listing.");
                return;
              }
              if (!sellerId) {
                showErrorToast("Unavailable", "Seller information is missing for this listing.");
                return;
              }
              requireAuth("offer", openOfferSheet);
            }}
            className="h-12 flex-[1.5] items-center justify-center rounded-xl bg-[#27BB97]"
            style={({ pressed }) => ({
              opacity: pressed ? 0.9 : 1,
              shadowColor: "#27BB97",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.2,
              shadowRadius: 10,
              elevation: 4,
            })}
          >
            <Text className="text-[16px] font-semibold text-white">Make Offer</Text>
          </Pressable>
        </View>
      </View>

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

                  {/* Product Summary */}
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

                  {/* Recommended Offers */}
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
                                borderColor: isSelected ? "#006B55" : "#E2E8F0",
                                backgroundColor: isSelected ? "rgba(39,187,151,0.1)" : "#FFFFFF",
                              }}
                            >
                              <Text
                                className="text-[14px] font-medium"
                                style={{ color: isSelected ? "#006B55" : "#161D1A" }}
                              >
                                {label}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  )}

                  {/* Custom Input */}
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

                  {/* Submit */}
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
                      colors={["#27BB97", "#1E9E7E"]}
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

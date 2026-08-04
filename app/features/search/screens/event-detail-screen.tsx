import { MaterialIcons } from "@expo/vector-icons";
import { type Href, useLocalSearchParams, useRouter } from "@/lib/safe-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { CategorySlug } from "@/constants/categories";
import { AUTH_API_BASE_URL } from "@/features/auth/services/auth-api";
import { buildListingChatHref } from "@/lib/listing-chat";
import {
  addToRecentlyViewed,
  fetchListingById,
  toggleSaveListing,
  type ListingItem,
} from "@/features/listing/services/listing-api";
import { AuthGateBottomSheet } from "@/features/auth/components/auth-gate-bottom-sheet";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { useSwrListing } from "@/lib/use-swr-listing";
import { Image } from "@/lib/nativewind-interop";
import { useAppSelector } from "@/store/hooks";
import { selectIsoCountryCode, selectLocationLabel } from "@/store/slices/location-slice";
import { formatPrice } from "@/lib/currency";
import { getListingSellerId, isOwnListing } from "@/lib/is-own-listing";
import { showErrorToast } from "@/lib/toast";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export function EventDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string; category?: string }>();
  const user = useAppSelector((s) => s.auth.user);
  const locationLabel = useAppSelector(selectLocationLabel);
  const isoCountryCode = useAppSelector(selectIsoCountryCode);

  const categorySlug = (params.category ?? "events") as CategorySlug;
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

  useEffect(() => {
    if (swrListing && swrListing !== listing) setListing(swrListing);
  }, [swrListing]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!listing) return;
    addToRecentlyViewed(listing, locationLabel, isoCountryCode).catch(() => {});
    if (user?.id && listing.savedBy?.includes(user.id)) setIsSaved(true);
  }, [listing, locationLabel, isoCountryCode, user?.id]);

  // Auth gate for guest users
  const [authGateVisible, setAuthGateVisible] = useState(false);
  const [authGateAction, setAuthGateAction] = useState<"save" | "message">("save");

  const requireAuth = useCallback((action: "save" | "message", callback: () => void) => {
    if (!user) {
      setAuthGateAction(action);
      setAuthGateVisible(true);
      return;
    }
    callback();
  }, [user]);

  const loadListing = useCallback(async () => {
    if (!listingId) return;
    await refreshListing();
  }, [listingId, refreshListing]);

  const { refreshing, onRefresh } = usePullToRefresh(loadListing);

  const handleToggleSave = useCallback(async () => {
    if (!listingId) return;
    requireAuth("save", async () => {
      try {
        const res = await toggleSaveListing(categorySlug, listingId);
        setIsSaved(res.saved);
      } catch {}
    });
  }, [categorySlug, listingId, requireAuth]);

  const title = listing?.title ?? "";
  const description = listing?.description ?? "";
  const locationText = listing?.location ?? "";
  const images = listing?.images?.length ? listing.images : [];
  const subcategory = listing?.subcategory ?? "";
  const eventDate = (listing as any)?.eventDate ?? "";
  const eventTime = (listing as any)?.eventTime ?? "";
  const organizer = (listing as any)?.organizer ?? listing?.sellerName ?? "";
  const venue = (listing as any)?.venue ?? "";
  const ticketsAvailable = (listing as any)?.ticketsAvailable ?? 0;
  const ageRestriction = (listing as any)?.ageRestriction ?? "";
  const dressCode = (listing as any)?.dressCode ?? "";
  const features: string[] = (listing as any)?.features ?? [];

  const priceLabel = !listing?.price && listing?.price !== 0
    ? "FREE"
    : listing?.price === 0
    ? "FREE"
    : formatPrice(listing.price, listing.currency, listing.countryCode ?? isoCountryCode);

  const sellerName = listing?.seller?.name ?? listing?.sellerName ?? "Organizer";
  const sellerProfileImage = listing?.seller?.profileImage
    ? listing.seller.profileImage.startsWith("http")
      ? listing.seller.profileImage
      : `${AUTH_API_BASE_URL}${listing.seller.profileImage}`
    : null;
  const sellerId = listing ? getListingSellerId(listing) : null;
  const sellerJoined = listing?.seller?.createdAt
    ? `Member since ${new Date(listing.seller.createdAt).getFullYear()}`
    : "";

  const topBarHeight = insets.top + 64;
  const footerBottomPadding = Math.max(insets.bottom, 12);
  const isOwn = isOwnListing(listing, user?.id);

  // Screen-first: render shell immediately; SWR fills in the cached or fresh data.

  if (!listing) {
    return (
      <View className="flex-1 items-center justify-center bg-[#F6F7F8]">
        <MaterialIcons name="error-outline" size={48} color="#CBD5E1" />
        <Text className="mt-2 text-[14px] text-[#6C7A74]">Event not found</Text>
        <Pressable onPress={() => router.back()} className="mt-4">
          <Text className="text-[14px] font-semibold text-[#27BB97]">Go Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#F6F7F8]">
      {/* TOP BAR */}
      <View
        className="absolute inset-x-0 top-0 z-50 flex-row items-center justify-between border-b border-slate-100 bg-white/90 px-4"
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
        <Pressable className="h-10 w-10 items-center justify-center" onPress={() => router.back()} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
          <MaterialIcons name="arrow-back" size={24} color="#27BB97" />
        </Pressable>
        <Text className="text-[20px] font-black tracking-tight text-[#27BB97]">Listifys</Text>
        <View className="flex-row items-center gap-4">
          <Pressable style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
            <MaterialIcons name="share" size={22} color="#64748B" />
          </Pressable>
          <Pressable onPress={handleToggleSave} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
            <MaterialIcons name={isSaved ? "favorite" : "favorite-border"} size={22} color={isSaved ? "#EF4444" : "#64748B"} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        removeClippedSubviews
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#27BB97"]} tintColor="#27BB97" progressViewOffset={topBarHeight} />}
        contentContainerStyle={{ paddingTop: topBarHeight, paddingBottom: isOwn ? 24 + footerBottomPadding : 96 + footerBottomPadding }}
      >
        {/* Event Poster — swipeable gallery */}
        {images.length > 0 ? (
          <View className="relative w-full" style={{ aspectRatio: 4 / 5 }}>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(e) => {
                const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
                setActiveImageIndex(idx);
              }}
            >
              {images.map((img, idx) => (
                <View key={img + idx.toString()} style={{ width: SCREEN_WIDTH, aspectRatio: 4 / 5 }}>
                  <Image source={img} contentFit="cover" cachePolicy="memory-disk" transition={200} className="h-full w-full" />
                </View>
              ))}
            </ScrollView>
            {subcategory ? (
              <View className="absolute bottom-4 left-4 rounded-full bg-[#27BB97] px-3 py-1">
                <Text className="text-[12px] font-medium uppercase tracking-wide text-white">{subcategory}</Text>
              </View>
            ) : null}
            {images.length > 1 && (
              <View className="absolute bottom-4 left-0 right-0 flex-row justify-center gap-2">
                {images.map((_, idx) => (
                  <View
                    key={idx.toString()}
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: idx === activeImageIndex ? "#FFFFFF" : "rgba(255,255,255,0.45)" }}
                  />
                ))}
              </View>
            )}
          </View>
        ) : (
          <View className="w-full items-center justify-center bg-[#E3EAE5]" style={{ aspectRatio: 4 / 5 }}>
            <MaterialIcons name="event" size={48} color="#CBD5E1" />
          </View>
        )}

        <View className="mt-6 gap-6 px-4">
          {/* Title & Date */}
          <View className="gap-2">
            <Text className="text-[24px] font-bold leading-8 tracking-tight text-[#161D1A]">{title}</Text>
            {(eventDate || eventTime) ? (
              <View className="flex-row items-center gap-2">
                <MaterialIcons name="calendar-today" size={20} color="#6c7a74" />
                <Text className="text-[14px] leading-5 text-[#6c7a74]">
                  {[eventDate, eventTime].filter(Boolean).join(" \u2022 ")}
                </Text>
              </View>
            ) : null}
          </View>

          {/* About */}
          {description ? (
            <View className="gap-2">
              <Text className="text-[20px] font-semibold leading-7 text-[#161D1A]">About Event</Text>
              <Text className="text-[14px] leading-6 text-[#3c4a44]">{description}</Text>
            </View>
          ) : null}

          {/* Event Details */}
          <View className="gap-2">
            <Text className="text-[18px] font-semibold text-[#161D1A]">Event Details</Text>
            <View className="overflow-hidden rounded-xl border border-[#BBCAC3]/20 bg-white">
              {[
                { label: "Entry Price", value: priceLabel, icon: "local-activity" as const },
                venue && { label: "Venue", value: venue, icon: "place" as const },
                locationText && { label: "Location", value: locationText, icon: "location-on" as const },
                ageRestriction && { label: "Age Restriction", value: ageRestriction, icon: "no-accounts" as const },
                dressCode && { label: "Dress Code", value: dressCode, icon: "checkroom" as const },
                subcategory && { label: "Category", value: subcategory, icon: "category" as const },
              ].filter(Boolean).map((row: any, idx, arr) => (
                <View
                  key={row.label}
                  className="flex-row items-center px-4 py-3"
                  style={idx < arr.length - 1 ? { borderBottomWidth: 1, borderBottomColor: "rgba(187,202,195,0.15)" } : undefined}
                >
                  <View className="mr-3 h-8 w-8 items-center justify-center rounded-lg bg-[#27BB97]/10">
                    <MaterialIcons name={row.icon} size={16} color="#27BB97" />
                  </View>
                  <Text className="flex-1 text-[14px] text-[#6C7A74]">{row.label}</Text>
                  <Text className="text-[14px] font-medium text-[#161D1A]">{row.value}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Features / Highlights */}
          {features.length > 0 ? (
            <View className="gap-3">
              <Text className="text-[18px] font-semibold text-[#161D1A]">Highlights</Text>
              <View className="gap-2">
                {features.map((f, i) => (
                  <View key={i} className="flex-row gap-3">
                    <MaterialIcons name="star" size={18} color="#CBA100" style={{ marginTop: 2 }} />
                    <Text className="flex-1 text-[14px] leading-5 text-[#3c4a44]">{f}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          <View className="h-px bg-[#BBCAC3]/30" />

          {/* Organizer */}
          <View className="py-1">
            <Text className="mb-4 text-[18px] font-semibold text-[#161D1A]">Organizer</Text>
            <Pressable
              onPress={() => { if (sellerId) router.push(`/seller-public-profile?sellerId=${sellerId}` as Href); }}
              className="flex-row items-center rounded-xl border border-[#BBCAC3]/20 bg-white p-4"
              style={{
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.05,
                shadowRadius: 3,
                elevation: 1,
              }}
            >
              <View className="mr-4 h-14 w-14 overflow-hidden rounded-full border-2 border-white">
                {sellerProfileImage ? (
                  <Image source={sellerProfileImage} contentFit="cover" transition={200} className="h-full w-full" />
                ) : (
                  <View className="h-full w-full items-center justify-center bg-[#27BB97]">
                    <Text className="text-[20px] font-bold text-white">
                      {(organizer || sellerName).charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
              </View>
              <View className="flex-1">
                <View className="flex-row items-center gap-1">
                  <Text className="text-[20px] font-semibold text-[#161D1A]">{organizer || sellerName}</Text>
                  <MaterialIcons name="verified" size={18} color="#005FB0" />
                </View>
                {sellerJoined ? (
                  <Text className="text-[12px] text-[#3C4A44]">{sellerJoined}</Text>
                ) : null}
                {listing?.views ? (
                  <View className="mt-1 flex-row items-center gap-1">
                    <MaterialIcons name="visibility" size={16} color="#64748B" />
                    <Text className="text-[12px] text-[#3C4A44]">{listing.views} views</Text>
                  </View>
                ) : null}
              </View>
              <MaterialIcons name="chevron-right" size={22} color="#161D1A" />
            </Pressable>
          </View>

          {/* Report */}
          <Pressable
            onPress={() => router.push(`/report-listing-modal?listingId=${listing._id}&category=${categorySlug}` as Href)}
            className="flex-row items-center justify-center gap-2 py-2"
          >
            <MaterialIcons name="flag" size={16} color="#94A3B8" />
            <Text className="text-[12px] text-slate-400">Report this listing</Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* Footer — hidden on own listings */}
      {!isOwn ? (
      <View
        className="absolute inset-x-0 bottom-0 z-50 border-t border-[#BBCAC3]/20 bg-white/95 px-4"
        style={{
          paddingTop: 12,
          paddingBottom: footerBottomPadding,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.05,
          shadowRadius: 12,
          elevation: 8,
        }}
      >
        <View className="flex-row items-center justify-between">
          {/* Entry Price */}
          <View>
            <Text className="text-[12px] font-medium text-[#6C7A74]">Entry Price</Text>
            <Text className="text-[20px] font-bold text-[#161D1A]">{priceLabel}</Text>
          </View>
          {/* Actions */}
          <View className="flex-row items-center gap-3">
            <Pressable
              onPress={() => {
                if (!sellerId) return;
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
              className="h-12 w-12 items-center justify-center rounded-xl border-2 border-[#BBCAC3]/50 bg-white"
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <MaterialIcons name="chat" size={20} color="#161D1A" />
            </Pressable>
            <Pressable
              onPress={() => {
                requireAuth("message", () => {
                  if (!sellerId) return;
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
              className="h-12 items-center justify-center rounded-xl px-6"
              style={({ pressed }) => ({ backgroundColor: "#27BB97", opacity: pressed ? 0.85 : 1 })}
            >
              <Text className="text-[16px] font-semibold text-white">Book Now</Text>
            </Pressable>
          </View>
        </View>
      </View>
      ) : null}

      {/* Auth Gate for guest users */}
      <AuthGateBottomSheet
        visible={authGateVisible}
        onClose={() => setAuthGateVisible(false)}
        action={authGateAction}
      />
    </View>
  );
}

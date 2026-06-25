import { MaterialIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { type Href, useLocalSearchParams, useRouter } from "@/lib/safe-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Keyboard,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { KeyboardStickyView } from "@/lib/safe-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useKeyboardStickyOffset } from "@/components/chat-keyboard-scroll-view";

import type { CategorySlug } from "@/constants/categories";
import { ListifyFonts } from "@/constants/typography";
import { AuthGateBottomSheet } from "@/features/auth/components/auth-gate-bottom-sheet";
import { AUTH_API_BASE_URL, fetchSellerReviews, getAuthErrorMessage } from "@/features/auth/services/auth-api";
import { buildListingChatHref, sendListingOffer } from "@/lib/listing-chat";
import { showErrorToast } from "@/lib/toast";
import {
  getSuggestedOfferAmounts,
  parseListedPrice,
  validateOfferAmount,
} from "@/lib/offer-validation";
import {
  addToRecentlyViewed,
  fetchListingById,
  toggleSaveListing,
  type ListingItem,
} from "@/features/listing/services/listing-api";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { useSwrListing } from "@/lib/use-swr-listing";
import { ListingLocationSection } from "@/components/listing-location-section";
import { formatVehicleOdometer, getListingDistanceLabel } from "@/lib/listing-distance";
import { Image } from "@/lib/nativewind-interop";
import { useAppSelector } from "@/store/hooks";
import {
  selectCanShowDistanceOnCards,
  selectIsoCountryCode,
  selectLocationCoords,
  selectLocationLabel,
} from "@/store/slices/location-slice";
import { formatPrice, getCurrencySymbol } from "@/lib/currency";
import { getListingSellerId, isOwnListing } from "@/lib/is-own-listing";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const IMAGE_HORIZONTAL_PAD = 16;
const IMAGE_WIDTH = SCREEN_WIDTH - IMAGE_HORIZONTAL_PAD * 2;
const THUMB_SIZE = 72;
const TAB_BLUE = "#6BA3FF";
const READ_MORE_LIMIT = 320;

const CONDITION_OPTIONS = ["New", "Like New", "Good", "Fair", "Used"];

function HeaderIconButton({
  icon,
  onPress,
  filled,
}: {
  icon: React.ComponentProps<typeof MaterialIcons>["name"];
  onPress?: () => void;
  filled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="h-11 w-11 items-center justify-center rounded-2xl border border-[#ECECEC] bg-white"
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
    >
      <MaterialIcons
        name={icon}
        size={22}
        color={filled ? "#EF4444" : "#1A1A1A"}
      />
    </Pressable>
  );
}

function SellerStars({ rating }: { rating: number }) {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;

  return (
    <View className="flex-row items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => {
        const name =
          i < full ? "star" : i === full && half ? "star-half" : "star-border";
        return <MaterialIcons key={i} name={name} size={16} color="#F59E0B" />;
      })}
      <Text
        className="ml-1 text-[14px] text-[#6B7280]"
        style={{ fontFamily: ListifyFonts.medium }}
      >
        {rating.toFixed(1)}
      </Text>
    </View>
  );
}

export function ListingDetailTemplateScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const stickyOffset = useKeyboardStickyOffset();
  const params = useLocalSearchParams<{ category?: string; id?: string }>();
  const user = useAppSelector((s) => s.auth.user);
  const userCoords = useAppSelector(selectLocationCoords);
  const locationLabel = useAppSelector(selectLocationLabel);
  const isoCountryCode = useAppSelector(selectIsoCountryCode);
  const canShowDistanceOnCards = useAppSelector(selectCanShowDistanceOnCards);

  const categorySlug = (params.category ?? "electronics") as CategorySlug;
  const listingId = params.id;
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  // Screen-first / cache-first: this hook returns whatever is in the cache
  // synchronously (seeded by the feed/category list when the card was visible)
  // and refreshes in the background. The shell renders immediately.
  const {
    listing: swrListing,
    isLoading: swrLoading,
    refresh: refreshListing,
  } = useSwrListing(categorySlug, listingId);
  const [listing, setListing] = useState<ListingItem | null>(swrListing ?? null);
  const loading = !listing && swrLoading;
  const [isSaved, setIsSaved] = useState(false);

  // Mirror SWR state into local listing so existing handlers/setListing calls
  // (save toggle, edit local fields) continue to work without further refactor.
  useEffect(() => {
    if (swrListing && swrListing !== listing) {
      setListing(swrListing);
    }
  }, [swrListing]); // eslint-disable-line react-hooks/exhaustive-deps
  const [activeTab, setActiveTab] = useState<"description" | "details">("description");
  const [descExpanded, setDescExpanded] = useState(false);

  const [authGateVisible, setAuthGateVisible] = useState(false);
  const [authGateAction, setAuthGateAction] = useState<"save" | "message" | "offer">("message");

  const [offerVisible, setOfferVisible] = useState(false);
  const [offerAmount, setOfferAmount] = useState("");
  const [selectedChip, setSelectedChip] = useState("");
  const [sendingOffer, setSendingOffer] = useState(false);
  const [offerSent, setOfferSent] = useState(false);
  const [offerError, setOfferError] = useState("");
  const [sellerRating, setSellerRating] = useState(0);
  const [sellerReviewsCount, setSellerReviewsCount] = useState(0);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const imageListRef = useRef<FlatList<string>>(null);
  // Stores the action to run after the user successfully authenticates via
  // the auth-gate bottom sheet (so we can auto-continue after login).
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

  const loadListing = useCallback(async () => {
    if (!listingId) return;
    await refreshListing();
  }, [listingId, refreshListing]);

  // Side-effects when listing becomes available (from cache or fresh fetch).
  useEffect(() => {
    if (!listing) return;
    addToRecentlyViewed(listing, locationLabel, isoCountryCode).catch(() => {});
    if (user?.id && listing.savedBy?.includes(user.id)) {
      setIsSaved(true);
    }
  }, [listing, locationLabel, isoCountryCode, user?.id]);

  useEffect(() => {
    if (!listing) return;
    const sellerId = getListingSellerId(listing);
    if (!sellerId) return;

    fetchSellerReviews(sellerId)
      .then((res) => {
        setSellerRating(res.averageRating ?? 0);
        setSellerReviewsCount(res.reviewsCount ?? 0);
      })
      .catch(() => {
        setSellerRating(0);
        setSellerReviewsCount(0);
      });
  }, [listing?._id]);

  const { refreshing, onRefresh } = usePullToRefresh(loadListing);

  const handleToggleSave = useCallback(async () => {
    if (!listingId) return;
    requireAuth("save", async () => {
      try {
        const res = await toggleSaveListing(categorySlug, listingId);
        setIsSaved(res.saved);
      } catch {
        // ignore
      }
    });
  }, [categorySlug, listingId, requireAuth]);

  const handleMessageSeller = useCallback(() => {
    if (!listing) return;

    const sellerId = getListingSellerId(listing);
    if (!sellerId) {
      showErrorToast("Unavailable", "Seller information is missing for this listing.");
      return;
    }
    const sellerName =
      listing.seller?.name ?? listing.sellerName ?? "Seller";

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
          contactImage: sellerProfileImage ?? undefined,
          productId: listing._id,
          productType: categorySlug,
          productTitle: listing.title ?? "",
          productPrice: listing.price,
          productImage: listing.images?.[0] ?? null,
          currency: listing.currency ?? "₹",
        }),
      );
    });
  }, [categorySlug, listing, requireAuth, router]);

  const listedPrice = useMemo(
    () => (listing ? parseListedPrice(listing.price) : 0),
    [listing],
  );

  const recommendedOffers = useMemo(() => {
    if (listedPrice <= 0) return [];
    return getSuggestedOfferAmounts(listedPrice);
  }, [listedPrice]);

  const openOfferSheet = useCallback(() => {
    if (listedPrice > 0) {
      const suggestions = getSuggestedOfferAmounts(listedPrice);
      const defaultOffer = suggestions[1] ?? suggestions[0] ?? listedPrice;
      setOfferAmount(String(defaultOffer));
      setSelectedChip(String(defaultOffer));
    } else {
      setOfferAmount("");
      setSelectedChip("");
    }
    setOfferError("");
    setOfferSent(false);
    setOfferVisible(true);
    Animated.spring(slideAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
  }, [listedPrice, slideAnim]);

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

    const amount = Number(offerAmount);
    const validation = validateOfferAmount(amount, listedPrice);
    if (!validation.valid) {
      setOfferError(validation.error);
      return;
    }
    setOfferError("");

    const sellerId = getListingSellerId(listing);
    if (!sellerId) {
      showErrorToast("Unavailable", "Seller information is missing for this listing.");
      return;
    }
    setSendingOffer(true);
    try {
      await sendListingOffer(
        {
          recipientId: sellerId,
          sellerId,
          productId: listing._id,
          productType: categorySlug,
          productTitle: listing.title,
          productPrice: listedPrice,
          productImage: listing.images?.[0] ?? null,
          currency: listing.currency ?? "₹",
        },
        amount,
        listing.currency ?? "₹",
      );
      setOfferSent(true);
      setTimeout(() => {
        closeOfferSheet();
        router.push(
          buildListingChatHref({
            recipientId: sellerId,
            sellerId,
            name: sellerName,
            productId: listing._id,
            productType: categorySlug,
            productTitle: listing.title ?? "",
            productPrice: listing.price,
            productImage: listing.images?.[0] ?? null,
            currency: listing.currency ?? "₹",
          }),
        );
      }, 1200);
    } catch (e) {
      showErrorToast(
        "Offer Failed",
        getAuthErrorMessage(e),
      );
    } finally {
      setSendingOffer(false);
    }
  }, [listing, offerAmount, sendingOffer, categorySlug, closeOfferSheet, listedPrice]);

  const handleMakeOffer = useCallback(() => {
    if (!listing) return;
    if (isOwnListing(listing, user?.id)) {
      showErrorToast("Not Available", "You cannot make an offer on your own listing.");
      return;
    }
    const sellerId = getListingSellerId(listing);
    if (!sellerId) {
      showErrorToast("Unavailable", "Seller information is missing for this listing.");
      return;
    }
    requireAuth("offer", openOfferSheet);
  }, [listing, openOfferSheet, requireAuth, user?.id]);

  const images = useMemo(() => {
    const raw = listing?.images?.length ? listing.images : [];
    if (raw.length > 0) return raw;
    return [];
  }, [listing?.images]);

  const galleryImages = images;

  useEffect(() => {
    if (activeImageIndex >= images.length) {
      setActiveImageIndex(Math.max(0, images.length - 1));
    }
  }, [activeImageIndex, images.length]);

  const title = listing?.title ?? "";
  const priceLabel = listing?.price
    ? formatPrice(listing.price, listing.currency, listing.countryCode ?? isoCountryCode)
    : "Price on request";
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
  const condition = listing?.condition?.trim() ?? "";
  const description =
    listing?.description ??
    "No description provided for this listing. Contact the seller to ask for more details.";

  const sellerName = listing?.seller?.name ?? listing?.sellerName ?? "Seller";
  const sellerProfileImage = listing?.seller?.profileImage
    ? listing.seller.profileImage.startsWith("http")
      ? listing.seller.profileImage
      : `${AUTH_API_BASE_URL}${listing.seller.profileImage}`
    : null;
  const sellerJoined = listing?.seller?.createdAt
    ? `Member since ${new Date(listing.seller.createdAt).getFullYear()}`
    : "Verified seller on Listify";

  const showReadMore = description.length > READ_MORE_LIMIT;
  const descriptionPreview = descExpanded
    ? description
    : description.slice(0, READ_MORE_LIMIT) + (showReadMore ? "…" : "");

  const footerInsetPadding = Math.max(insets.bottom, 12);
  const headerHeight = insets.top + 56;
  const isOwn = isOwnListing(listing, user?.id);

  const handleImageScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const idx = Math.round(e.nativeEvent.contentOffset.x / IMAGE_WIDTH);
      if (idx >= 0 && idx < images.length) setActiveImageIndex(idx);
    },
    [images.length],
  );

  const scrollToImage = useCallback((index: number) => {
    setActiveImageIndex(index);
    imageListRef.current?.scrollToIndex({ index, animated: true });
  }, []);

  const detailRows = useMemo(() => {
    if (!listing) return [] as { label: string; value: string }[];
    const rows: { label: string; value: string }[] = [];
    const l = listing as Record<string, unknown>;

    const push = (label: string, val: unknown) => {
      const s = val != null ? String(val).trim() : "";
      if (s !== "" && s !== "undefined") rows.push({ label, value: s });
    };

    // ── Universal ─────────────────────────────────────────────
    push("Category", listing.subcategory);
    push("Brand", listing.brand);
    push("Model", listing.model);

    // ── Electronics ───────────────────────────────────────────
    push("Purchase Year", l.purchaseYear);
    push("Warranty", listing.warranty);
    push("Screen Size", l.screenSize);
    push("Display Type", l.displayType);
    push("Processor", l.processor);
    push("RAM", listing.ram);
    push("Storage", listing.storage);
    push("Capacity", l.capacity);
    push("Energy Rating", l.energyRating);
    push("Megapixels", l.megapixels);
    push("Lens Type", l.lensType);

    // ── Vehicles ──────────────────────────────────────────────
    push("Year", listing.year);
    push("Fuel Type", listing.fuelType);
    push("Transmission", listing.transmission);
    push(
      "Driven",
      formatVehicleOdometer(listing.kmDriven ?? listing.mileage, {
        unit: listing.mileageUnit,
        isoCountryCode: listing.countryCode ?? isoCountryCode,
      }),
    );
    push("Engine CC", l.engineCC);
    push("Color", listing.color);

    // ── Properties ────────────────────────────────────────────
    push("Type", listing.category === "Rentals" ? "For Rent" : listing.category === "Properties" ? "For Sale" : listing.category);
    if (listing.bedrooms != null) push("Bedrooms", listing.bedrooms);
    if (listing.bathrooms != null) push("Bathrooms", listing.bathrooms);
    if (l.squareFeet != null) push("Area (sq.ft)", l.squareFeet);
    push("Furnishing", listing.furnishing);
    push("Occupancy", listing.occupancy);
    push("Gender Preference", l.genderPreference);
    if (l.petFriendly != null) push("Pet Friendly", l.petFriendly ? "Yes" : "No");
    if (l.availableFrom) {
      try {
        push("Available From", new Date(String(l.availableFrom)).toLocaleDateString("en-IN", {
          day: "numeric", month: "short", year: "numeric",
        }));
      } catch { /* skip invalid date */ }
    }
    if (Array.isArray(l.features) && (l.features as string[]).length > 0) {
      push("Amenities", (l.features as string[]).join(", "));
    }

    // ── Jobs / Services ───────────────────────────────────────
    push("Job Type", l.jobType);
    push("Experience", l.experience);
    push("Education", l.educationLevel);
    push("Service Type", l.serviceType);
    push("Availability", l.availability);

    // ── Events ────────────────────────────────────────────────
    if (l.startDate) {
      try {
        push("Event Date", new Date(String(l.startDate)).toLocaleDateString("en-IN", {
          day: "numeric", month: "short", year: "numeric",
        }));
      } catch { /* skip invalid date */ }
    }
    push("Venue", l.venue);
    push("Organizer", l.organizer);

    return rows;
  }, [isoCountryCode, listing]);

  const sellerDetailsBlock = (
    <View className="mt-8">
      <Text
        className="mb-3 text-[16px] text-[#1A1A1A]"
        style={{ fontFamily: ListifyFonts.bold }}
      >
        Seller details
      </Text>
      <Pressable
        onPress={() => {
          const sid = listing ? getListingSellerId(listing) : null;
          if (!sid) return;
          router.push({
            pathname: "/seller-public-profile",
            params: {
              sellerId: sid,
              sellerName,
              sellerRating: String(sellerRating),
              ...(sellerProfileImage ? { sellerImage: sellerProfileImage } : {}),
            },
          } as Href);
        }}
        className="flex-row items-center rounded-2xl border border-[#F0F0F0] bg-[#FAFAFA] p-4"
        style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
      >
        <View className="mr-3 h-14 w-14 overflow-hidden rounded-full bg-[#E5E7EB]">
          {sellerProfileImage ? (
            <Image source={sellerProfileImage} contentFit="cover" className="h-full w-full" />
          ) : (
            <View className="h-full w-full items-center justify-center bg-[#F43F9C]">
              <Text className="text-[20px] text-white" style={{ fontFamily: ListifyFonts.bold }}>
                {sellerName.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
        </View>
        <View className="flex-1">
          <Text className="text-[17px] text-[#1A1A1A]" style={{ fontFamily: ListifyFonts.semiBold }}>
            {sellerName}
          </Text>
          <SellerStars rating={sellerRating} />
          <Text className="mt-0.5 text-[12px] text-[#9CA3AF]" style={{ fontFamily: ListifyFonts.regular }}>
            {sellerReviewsCount} {sellerReviewsCount === 1 ? "member rated" : "members rated"}
          </Text>
          <Text className="mt-1 text-[12px] text-[#9CA3AF]" style={{ fontFamily: ListifyFonts.regular }}>
            {sellerJoined}
          </Text>
        </View>
        <MaterialIcons name="chevron-right" size={22} color="#C4C4C4" />
      </Pressable>
    </View>
  );

  // Screen-first: never block the screen on a spinner. If we truly have no
  // listing yet, render the shell with a skeleton header so the user sees a
  // structured layout immediately. The skeleton resolves when SWR lands.
  // (The legacy full-screen ActivityIndicator was the #1 cause of perceived
  // slowness — see PERFORMANCE_ARCHITECTURE.md.)

  return (
    <View className="flex-1 bg-[#F6F7F8]">
      {/* Top bar — back only */}
      <View
        className="z-50 flex-row items-center border-b border-[#F0F0F0] bg-white px-4"
        style={{ paddingTop: insets.top, height: headerHeight }}
      >
        <HeaderIconButton icon="arrow-back" onPress={() => router.back()} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1A1A1A" />
        }
        contentContainerStyle={{ paddingBottom: isOwn ? 24 + footerInsetPadding : 100 + footerInsetPadding }}
      >
        {/* Main image — swipeable carousel */}
        <View className="mt-4 px-4">
          <View
            className="overflow-hidden rounded-[28px] bg-[#F3F4F6]"
            style={{ width: IMAGE_WIDTH, height: IMAGE_WIDTH * 0.92 }}
          >
            {galleryImages.length > 0 ? (
              <FlatList
                ref={imageListRef}
                data={galleryImages}
                horizontal
                pagingEnabled
                bounces={galleryImages.length > 1}
                showsHorizontalScrollIndicator={false}
                keyExtractor={(item, index) => `${item}-${index}`}
                onMomentumScrollEnd={handleImageScroll}
                getItemLayout={(_, index) => ({
                  length: IMAGE_WIDTH,
                  offset: IMAGE_WIDTH * index,
                  index,
                })}
                renderItem={({ item }) => (
                  <View
                    className="items-center justify-center"
                    style={{ width: IMAGE_WIDTH, height: IMAGE_WIDTH * 0.92 }}
                  >
                    <Image
                      source={item}
                      contentFit="contain"
                      style={{ width: IMAGE_WIDTH * 0.88, height: IMAGE_WIDTH * 0.88 }}
                    />
                  </View>
                )}
              />
            ) : (
              <View className="flex-1 items-center justify-center">
                <MaterialIcons name="image" size={64} color="#D1D5DB" />
              </View>
            )}
          </View>

          {/* Carousel dots */}
          {galleryImages.length > 1 ? (
            <View className="mt-4 flex-row items-center justify-center gap-2">
              {galleryImages.map((_, index) => {
                const active = index === activeImageIndex;
                return (
                  <Pressable key={index} onPress={() => scrollToImage(index)}>
                    <View
                      className="h-2.5 w-2.5 rounded-full"
                      style={{
                        backgroundColor: active ? TAB_BLUE : "#D1D5DB",
                        borderWidth: active ? 0 : 0,
                      }}
                    />
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {/* Thumbnails */}
          {galleryImages.length > 1 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="mt-4"
              contentContainerStyle={{ gap: 10 }}
            >
              {galleryImages.map((img, index) => {
                const tints = ["#FDE8D8", "#D8E8FD", "#E8E8E8", "#E8DDF5"];
                const active = index === activeImageIndex;
                return (
                  <Pressable
                    key={`${img}-${index}`}
                    onPress={() => scrollToImage(index)}
                    className="overflow-hidden rounded-2xl"
                    style={{
                      width: THUMB_SIZE,
                      height: THUMB_SIZE,
                      backgroundColor: tints[index % tints.length],
                      borderWidth: active ? 2 : 0,
                      borderColor: TAB_BLUE,
                    }}
                  >
                    <Image source={img} contentFit="cover" className="h-full w-full" />
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}
        </View>

        {/* Title + price */}
        <View className="mt-5 flex-row items-start justify-between px-4">
          <Text
            className="flex-1 pr-4 text-[22px] leading-7 text-[#1A1A1A]"
            style={{ fontFamily: ListifyFonts.bold }}
          >
            {title}
          </Text>
          <View className="items-end">
            <Text
              className="text-[22px] text-[#1A1A1A]"
              style={{ fontFamily: ListifyFonts.bold }}
            >
              {priceLabel}
            </Text>
            {distanceLabel ? (
              <View className="mt-1 flex-row items-center gap-0.5">
                <MaterialIcons name="near-me" size={14} color="#27BB97" />
                <Text
                  className="text-[13px] text-[#27BB97]"
                  style={{ fontFamily: ListifyFonts.semiBold }}
                >
                  {distanceLabel} away
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Condition (replaces size / no product rating) */}
        <View className="mt-5 px-4">
          <Text
            className="mb-3 text-[16px] text-[#1A1A1A]"
            style={{ fontFamily: ListifyFonts.bold }}
          >
            Condition
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {CONDITION_OPTIONS.map((opt) => {
              const selected = condition.toLowerCase() === opt.toLowerCase();
              return (
                <View
                  key={opt}
                  className="h-11 min-w-[56px] items-center justify-center rounded-2xl px-3"
                  style={{
                    backgroundColor: selected ? "#E8E8E8" : "#F3F4F6",
                    borderWidth: selected ? 1.5 : 0,
                    borderColor: "#1A1A1A",
                  }}
                >
                  <Text
                    className="text-[14px]"
                    style={{
                      fontFamily: selected ? ListifyFonts.semiBold : ListifyFonts.regular,
                      color: "#1A1A1A",
                    }}
                  >
                    {opt}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        {listing ? (
          <ListingLocationSection listing={listing} category={categorySlug} />
        ) : null}

        {/* Description / Details tab switcher */}
        <View className="mt-5 flex-row border-b border-[#F0F0F0] px-4">
          {(["description", "details"] as const).map((tab) => {
            const isActive = activeTab === tab;
            return (
              <Pressable
                key={tab}
                onPress={() => setActiveTab(tab)}
                className="mr-6 pb-3"
                style={{ borderBottomWidth: isActive ? 2 : 0, borderBottomColor: "#1A1A1A" }}
              >
                <Text
                  className="text-[15px]"
                  style={{
                    fontFamily: isActive ? ListifyFonts.semiBold : ListifyFonts.regular,
                    color: isActive ? "#1A1A1A" : "#9CA3AF",
                  }}
                >
                  {tab === "description" ? "Description" : "Details"}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Tab content */}
        <View className="mt-4 px-4">
          {activeTab === "description" ? (
            <>
              <Text
                className="text-[14px] leading-6 text-[#9CA3AF]"
                style={{ fontFamily: ListifyFonts.regular }}
              >
                {descriptionPreview}
              </Text>
              {showReadMore ? (
                <Pressable onPress={() => setDescExpanded((v) => !v)} className="mt-2">
                  <Text
                    className="text-[14px]"
                    style={{ fontFamily: ListifyFonts.semiBold, color: "#C67B5C" }}
                  >
                    {descExpanded ? "Show less" : "Read More"}
                  </Text>
                </Pressable>
              ) : null}

              {sellerDetailsBlock}
            </>
          ) : (
            <View className="gap-3">
              {detailRows.length === 0 ? (
                <Text
                  className="text-[14px] text-[#9CA3AF]"
                  style={{ fontFamily: ListifyFonts.regular }}
                >
                  No extra details for this listing.
                </Text>
              ) : (
                detailRows.map((row) => (
                  <View
                    key={row.label}
                    className="flex-row items-center justify-between rounded-2xl bg-[#F9FAFB] px-4 py-3"
                  >
                    <Text
                      className="text-[14px] text-[#6B7280]"
                      style={{ fontFamily: ListifyFonts.regular }}
                    >
                      {row.label}
                    </Text>
                    <Text
                      className="text-[14px] text-[#1A1A1A]"
                      style={{ fontFamily: ListifyFonts.medium }}
                    >
                      {row.value}
                    </Text>
                  </View>
                ))
              )}
              {sellerDetailsBlock}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Bottom bar — OfferUp style: save · message · make offer (hidden on own listings) */}
      {!isOwn ? (
      <View
        className="absolute inset-x-0 bottom-0 z-50 border-t border-[#F0F0F0] bg-white px-4"
        style={{ paddingTop: 12, paddingBottom: footerInsetPadding }}
      >
        <View className="flex-row items-center gap-2">
          <Pressable
            onPress={handleToggleSave}
            className="h-12 w-12 items-center justify-center rounded-2xl border border-[#E5E7EB] bg-white"
            style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
          >
            <MaterialIcons
              name={isSaved ? "bookmark" : "bookmark-border"}
              size={22}
              color={isSaved ? "#EF4444" : "#1A1A1A"}
            />
          </Pressable>

          <Pressable
            onPress={handleMessageSeller}
            className="h-12 flex-1 items-center justify-center rounded-2xl border border-[#E5E7EB] bg-white"
            style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
          >
            <Text
              className="text-[14px] text-[#1A1A1A]"
              style={{ fontFamily: ListifyFonts.semiBold }}
            >
              Message
            </Text>
          </Pressable>

          <Pressable
            onPress={handleMakeOffer}
            className="h-12 flex-[1.15] items-center justify-center rounded-2xl bg-gray-800"
            style={({ pressed }) => ({
              opacity: pressed ? 0.9 : 1,
              shadowColor: "#27BB97",
              shadowOffset: { width: 0, height: 3 },
              shadowOpacity: 0.25,
              shadowRadius: 8,
              elevation: 4,
            })}
          >
            <Text
              className="text-[14px] text-white"
              style={{ fontFamily: ListifyFonts.semiBold }}
            >
              Make Offer
            </Text>
          </Pressable>
        </View>
      </View>
      ) : null}

      {/* Make Offer bottom sheet */}
      <Modal
        visible={offerVisible}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={closeOfferSheet}
      >
        <View style={{ flex: 1 }}>
          <Pressable onPress={closeOfferSheet} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)" }}>
            <View style={{ flex: 1, minHeight: 80 }} />
          </Pressable>
          <KeyboardStickyView offset={stickyOffset}>
          <Animated.View
            style={{
              transform: [
                {
                  translateY: slideAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [600, 0],
                  }),
                },
              ],
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

              <ScrollView
                keyboardShouldPersistTaps="handled"
                bounces={false}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{
                  paddingHorizontal: 16,
                  paddingBottom: 16,
                }}
              >
              {offerSent ? (
                <View className="items-center py-8">
                  <View className="mb-4 h-16 w-16 items-center justify-center rounded-full bg-[#27BB97]/15">
                    <MaterialIcons name="check-circle" size={40} color="#27BB97" />
                  </View>
                  <Text
                    className="text-[20px] text-[#161D1A]"
                    style={{ fontFamily: ListifyFonts.bold }}
                  >
                    Offer Sent!
                  </Text>
                  <Text
                    className="mt-1 text-center text-[14px] text-[#6C7A74]"
                    style={{ fontFamily: ListifyFonts.regular }}
                  >
                    The seller will be notified and can accept or counter.
                  </Text>
                </View>
              ) : (
                <>
                  <View className="mb-5 flex-row items-center justify-between">
                    <Text
                      className="text-[24px] text-[#161D1A]"
                      style={{ fontFamily: ListifyFonts.bold }}
                    >
                      Make an Offer
                    </Text>
                    <Pressable
                      onPress={closeOfferSheet}
                      className="rounded-full p-2"
                      style={({ pressed }) => ({
                        backgroundColor: pressed ? "#F1F5F9" : "transparent",
                      })}
                    >
                      <MaterialIcons name="close" size={24} color="#94A3B8" />
                    </Pressable>
                  </View>

                  <View className="mb-5 flex-row items-center gap-3 rounded-xl bg-[#F3F4F6] p-3">
                    {images[0] ? (
                      <Image
                        source={images[0]}
                        contentFit="cover"
                        className="h-14 w-14 rounded-lg"
                      />
                    ) : (
                      <View className="h-14 w-14 items-center justify-center rounded-lg bg-slate-200">
                        <MaterialIcons name="image" size={24} color="#CBD5E1" />
                      </View>
                    )}
                    <View className="flex-1">
                      <Text
                        className="text-[13px] text-[#161D1A]"
                        style={{ fontFamily: ListifyFonts.medium }}
                        numberOfLines={1}
                      >
                        {title}
                      </Text>
                      <Text
                        className="mt-0.5 text-[12px] uppercase text-[#6C7A74]"
                        style={{ fontFamily: ListifyFonts.medium }}
                      >
                        Listed price
                      </Text>
                      <Text
                        className="text-[16px] text-[#161D1A]"
                        style={{ fontFamily: ListifyFonts.bold }}
                      >
                        {priceLabel}
                      </Text>
                    </View>
                  </View>

                  {recommendedOffers.length > 0 ? (
                    <View className="mb-6">
                      <Text
                        className="mb-3 text-[12px] uppercase tracking-wide text-[#6C7A74]"
                        style={{ fontFamily: ListifyFonts.medium }}
                      >
                        Suggested offers
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
                                borderColor: isSelected ? "#27BB97" : "#E2E8F0",
                                backgroundColor: isSelected
                                  ? "rgba(39,187,151,0.1)"
                                  : "#FFFFFF",
                              }}
                            >
                              <Text
                                className="text-[14px]"
                                style={{
                                  fontFamily: ListifyFonts.medium,
                                  color: isSelected ? "#27BB97" : "#161D1A",
                                }}
                              >
                                {label}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  ) : null}

                  <View className="mb-6">
                    <Text
                      className="mb-2 text-[12px] uppercase tracking-wide text-[#161D1A]"
                      style={{ fontFamily: ListifyFonts.medium }}
                    >
                      Your offer
                    </Text>
                    <View className="h-14 flex-row items-center rounded-xl border-2 border-slate-100 bg-slate-50 px-4">
                      <Text
                        className="text-[20px] text-slate-400"
                        style={{ fontFamily: ListifyFonts.bold }}
                      >
                        {getCurrencySymbol(listing?.currency)}
                      </Text>
                      <TextInput
                        value={offerAmount}
                        onChangeText={(val) => {
                          setOfferAmount(val.replace(/[^0-9]/g, ""));
                          setSelectedChip("");
                          setOfferError("");
                        }}
                        keyboardType="numeric"
                        placeholder="Enter amount"
                        placeholderTextColor="#CBD5E1"
                        className="ml-2 flex-1 text-[20px] text-[#161D1A]"
                        style={{
                          fontFamily: ListifyFonts.bold,
                          paddingVertical: 0,
                        }}
                      />
                    </View>
                    {offerError ? (
                      <Text
                        className="mt-2 text-[13px] text-[#DC2626]"
                        style={{ fontFamily: ListifyFonts.medium }}
                      >
                        {offerError}
                      </Text>
                    ) : null}
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
                          <Text
                            className="text-[18px] text-white"
                            style={{ fontFamily: ListifyFonts.semiBold }}
                          >
                            Send Offer
                          </Text>
                          <MaterialIcons name="send" size={20} color="#FFFFFF" />
                        </>
                      )}
                    </LinearGradient>
                  </Pressable>
                </>
              )}
              </ScrollView>
            </View>
          </Animated.View>
          </KeyboardStickyView>
        </View>
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

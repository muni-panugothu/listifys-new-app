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
import { ListingSellerContactCard } from "@/components/listing-seller-contact-card";
import { formatVehicleOdometer, getListingDistanceLabel } from "@/lib/listing-distance";
import {
  getListingContactSectionTitle,
  getListingModelForCategory,
  openListingPhoneDialer,
  resolveListingContactPhone,
} from "@/lib/listing-contact-phone";
import { Image } from "@/lib/nativewind-interop";
import { ListingVideoPlayer } from "@/components/listing-media-viewer";
import {
  buildListingMediaGallery,
  type ListingMediaGalleryEntry,
} from "@/lib/listing-media";
import { useAppSelector } from "@/store/hooks";
import {
  selectCanShowDistanceOnCards,
  selectIsoCountryCode,
  selectLocationCoords,
  selectLocationLabel,
} from "@/store/slices/location-slice";
import { formatPrice, getCurrencySymbol } from "@/lib/currency";
import { getListingSellerId, isOwnListing } from "@/lib/is-own-listing";
import { useTheme } from "@/providers/theme-provider";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const IMAGE_HORIZONTAL_PAD = 16;
const IMAGE_WIDTH = SCREEN_WIDTH - IMAGE_HORIZONTAL_PAD * 2;
const THUMB_SIZE = 72;
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
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        opacity: pressed ? 0.85 : 1,
        height: 44,
        width: 44,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
      })}
    >
      <MaterialIcons
        name={icon}
        size={22}
        color={filled ? colors.danger : colors.icon}
      />
    </Pressable>
  );
}

export function ListingDetailTemplateScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
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
  const imageListRef = useRef<FlatList<ListingMediaGalleryEntry>>(null);
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
  }, [categorySlug, listing, requireAuth, router, user?.id]);

  const sellerContact = useMemo(
    () => (listing ? resolveListingContactPhone(listing) : null),
    [listing],
  );

  const handleCallSeller = useCallback(async () => {
    if (!listing || !sellerContact) {
      showErrorToast("No Number", "Seller has not provided a contact number.");
      return;
    }
    const sid = getListingSellerId(listing);
    if (!sid) {
      showErrorToast("Unavailable", "Seller information is missing for this listing.");
      return;
    }
    await openListingPhoneDialer({
      contact: sellerContact,
      listingId: listing._id,
      sellerId: sid,
      listingModel: getListingModelForCategory(categorySlug),
    });
  }, [categorySlug, listing, sellerContact]);

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

  const galleryMedia = useMemo(
    () => buildListingMediaGallery(listing ?? undefined),
    [listing],
  );

  const images = useMemo(
    () => galleryMedia.map((entry) => entry.url),
    [galleryMedia],
  );

  const galleryImages = galleryMedia;

  useEffect(() => {
    if (activeImageIndex >= galleryMedia.length) {
      setActiveImageIndex(Math.max(0, galleryMedia.length - 1));
    }
  }, [activeImageIndex, galleryMedia.length]);

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
    : "Verified seller on Listifys";

  const openSellerProfile = useCallback(() => {
    if (!listing) return;
    const sid = getListingSellerId(listing);
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
  }, [listing, router, sellerName, sellerProfileImage, sellerRating]);

  const sellerContactBlock =
    categorySlug === "events" || !listing ? null : (
      <ListingSellerContactCard
        title={getListingContactSectionTitle(categorySlug)}
        name={sellerName}
        avatarUri={sellerProfileImage}
        rating={sellerRating}
        reviewsLabel={
          sellerReviewsCount > 0
            ? `${sellerReviewsCount} ${sellerReviewsCount === 1 ? "member rated" : "members rated"}`
            : undefined
        }
        joinedLabel={sellerJoined}
        contactPhone={sellerContact}
        onProfilePress={openSellerProfile}
        onMessagePress={handleMessageSeller}
        onCallPress={() => void handleCallSeller()}
      />
    );

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
      if (idx >= 0 && idx < galleryMedia.length) setActiveImageIndex(idx);
    },
    [galleryMedia.length],
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

  const sellerDetailsBlock = sellerContactBlock;

  // Screen-first: never block the screen on a spinner.
  // listing yet, render the shell with a skeleton header so the user sees a
  // structured layout immediately. The skeleton resolves when SWR lands.
  // (The legacy full-screen ActivityIndicator was the #1 cause of perceived
  // slowness — see PERFORMANCE_ARCHITECTURE.md.)

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      {/* Top bar — back only */}
      <View
        className="z-50 flex-row items-center px-4"
        style={{
          paddingTop: insets.top,
          height: headerHeight,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          backgroundColor: colors.surface,
        }}
      >
        <HeaderIconButton icon="arrow-back" onPress={() => router.back()} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        removeClippedSubviews
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textPrimary} />
        }
        contentContainerStyle={{ paddingBottom: isOwn ? 24 + footerInsetPadding : 100 + footerInsetPadding }}
      >
        {/* Main image — swipeable carousel */}
        <View className="mt-4 px-4">
          <View
            className="overflow-hidden rounded-[28px]"
            style={{
              width: IMAGE_WIDTH,
              height: IMAGE_WIDTH * 0.92,
              backgroundColor: colors.surfaceMuted,
            }}
          >
            {galleryImages.length > 0 ? (
              <FlatList
                ref={imageListRef}
                data={galleryImages}
                horizontal
                pagingEnabled
                bounces={galleryImages.length > 1}
                showsHorizontalScrollIndicator={false}
                keyExtractor={(item, index) => `${item.type}-${item.url}-${index}`}
                onMomentumScrollEnd={handleImageScroll}
                getItemLayout={(_, index) => ({
                  length: IMAGE_WIDTH,
                  offset: IMAGE_WIDTH * index,
                  index,
                })}
                renderItem={({ item, index }) => (
                  <View
                    className="items-center justify-center"
                    style={{ width: IMAGE_WIDTH, height: IMAGE_WIDTH * 0.92 }}
                  >
                    {item.type === "video" ? (
                      <ListingVideoPlayer
                        uri={item.url}
                        poster={item.thumbnailUrl}
                        showControls
                        style={{
                          width: IMAGE_WIDTH * 0.88,
                          height: IMAGE_WIDTH * 0.88,
                          borderRadius: 20,
                        }}
                      />
                    ) : (
                      <Image
                        source={item.url}
                        contentFit="contain"
                        cachePolicy="memory-disk"
                        recyclingKey={item.url}
                        style={{ width: IMAGE_WIDTH * 0.88, height: IMAGE_WIDTH * 0.88 }}
                      />
                    )}
                  </View>
                )}
              />
            ) : (
              <View className="flex-1 items-center justify-center">
                <MaterialIcons name="image" size={64} color={colors.borderStrong} />
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
                        backgroundColor: active ? colors.primary : colors.borderStrong,
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
              {galleryImages.map((entry, index) => {
                const active = index === activeImageIndex;
                return (
                  <Pressable
                    key={`${entry.url}-${index}`}
                    onPress={() => scrollToImage(index)}
                    className="overflow-hidden rounded-2xl"
                    style={{
                      width: THUMB_SIZE,
                      height: THUMB_SIZE,
                      backgroundColor: colors.surfaceMuted,
                      borderWidth: active ? 2 : 0,
                      borderColor: colors.primary,
                    }}
                  >
                    {entry.type === "video" ? (
                      <ListingVideoPlayer
                        uri={entry.url}
                        poster={entry.thumbnailUrl}
                        compact
                        showControls={false}
                        style={{ width: THUMB_SIZE, height: THUMB_SIZE }}
                      />
                    ) : (
                      <Image
                        source={entry.url}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                        className="h-full w-full"
                      />
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}
        </View>

        {/* Title + price */}
        <View className="mt-5 flex-row items-start justify-between px-4">
          <Text
            className="flex-1 pr-4 leading-7"
            style={{ fontSize: 22, fontFamily: ListifyFonts.bold, color: colors.textPrimary }}
          >
            {title}
          </Text>
          <View className="items-end">
            <Text
              style={{ fontSize: 22, fontFamily: ListifyFonts.bold, color: colors.textPrimary }}
            >
              {priceLabel}
            </Text>
            {distanceLabel ? (
              <View className="mt-1 flex-row items-center gap-0.5">
                <MaterialIcons name="near-me" size={14} color={colors.primary} />
                <Text
                  style={{ fontSize: 13, fontFamily: ListifyFonts.semiBold, color: colors.primary }}
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
            style={{
              marginBottom: 12,
              fontSize: 16,
              fontFamily: ListifyFonts.bold,
              color: colors.textPrimary,
            }}
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
                    backgroundColor: selected ? colors.primarySoft : colors.surfaceMuted,
                    borderWidth: selected ? 1.5 : 0,
                    borderColor: colors.textPrimary,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontFamily: selected ? ListifyFonts.semiBold : ListifyFonts.regular,
                      color: colors.textPrimary,
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
        <View
          className="mt-5 flex-row px-4"
          style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}
        >
          {(["description", "details"] as const).map((tab) => {
            const isActive = activeTab === tab;
            return (
              <Pressable
                key={tab}
                onPress={() => setActiveTab(tab)}
                className="mr-6 pb-3"
                style={{
                  borderBottomWidth: isActive ? 2 : 0,
                  borderBottomColor: colors.textPrimary,
                }}
              >
                <Text
                  style={{
                    fontSize: 15,
                    fontFamily: isActive ? ListifyFonts.semiBold : ListifyFonts.regular,
                    color: isActive ? colors.textPrimary : colors.textTertiary,
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
                style={{
                  fontSize: 14,
                  lineHeight: 24,
                  fontFamily: ListifyFonts.regular,
                  color: colors.textSecondary,
                }}
              >
                {descriptionPreview}
              </Text>
              {showReadMore ? (
                <Pressable onPress={() => setDescExpanded((v) => !v)} className="mt-2">
                  <Text
                    style={{ fontSize: 14, fontFamily: ListifyFonts.semiBold, color: colors.accentOrange }}
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
                  style={{ fontSize: 14, fontFamily: ListifyFonts.regular, color: colors.textTertiary }}
                >
                  No extra details for this listing.
                </Text>
              ) : (
                detailRows.map((row) => (
                  <View
                    key={row.label}
                    className="flex-row items-center justify-between rounded-2xl px-4 py-3"
                    style={{ backgroundColor: colors.surfaceMuted }}
                  >
                    <Text
                      style={{ fontSize: 14, fontFamily: ListifyFonts.regular, color: colors.textSecondary }}
                    >
                      {row.label}
                    </Text>
                    <Text
                      style={{ fontSize: 14, fontFamily: ListifyFonts.medium, color: colors.textPrimary }}
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
        className="absolute inset-x-0 bottom-0 z-50 px-4"
        style={{
          paddingTop: 12,
          paddingBottom: footerInsetPadding,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          backgroundColor: colors.surface,
        }}
      >
        <View className="flex-row items-center gap-2">
          <Pressable
            onPress={handleToggleSave}
            style={({ pressed }) => ({
              opacity: pressed ? 0.85 : 1,
              height: 48,
              width: 48,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 16,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
            })}
          >
            <MaterialIcons
              name={isSaved ? "bookmark" : "bookmark-border"}
              size={22}
              color={isSaved ? colors.danger : colors.icon}
            />
          </Pressable>

          <Pressable
            onPress={handleMessageSeller}
            style={({ pressed }) => ({
              opacity: pressed ? 0.85 : 1,
              height: 48,
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 16,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
            })}
          >
            <Text
              style={{ fontSize: 14, fontFamily: ListifyFonts.semiBold, color: colors.textPrimary }}
            >
              Message
            </Text>
          </Pressable>

          <Pressable
            onPress={handleMakeOffer}
            style={({ pressed }) => ({
              opacity: pressed ? 0.9 : 1,
              height: 48,
              flex: 1.15,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 16,
              backgroundColor: colors.textPrimary,
              shadowColor: colors.primary,
              shadowOffset: { width: 0, height: 3 },
              shadowOpacity: 0.25,
              shadowRadius: 8,
              elevation: 4,
            })}
          >
            <Text
              style={{ fontSize: 14, fontFamily: ListifyFonts.semiBold, color: colors.background }}
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
          <Pressable onPress={closeOfferSheet} style={{ flex: 1, backgroundColor: colors.scrim }}>
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
              style={{
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                borderTopWidth: 1,
                borderTopColor: colors.border,
                backgroundColor: colors.surfaceElevated,
                paddingBottom: Math.max(insets.bottom, 16),
                shadowColor: "#000",
                shadowOffset: { width: 0, height: -12 },
                shadowOpacity: 0.15,
                shadowRadius: 40,
                elevation: 24,
              }}
            >
              <View className="items-center py-3">
                <View
                  className="h-1.5 w-12 rounded-full"
                  style={{ backgroundColor: colors.borderStrong }}
                />
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
                  <View
                    className="mb-4 h-16 w-16 items-center justify-center rounded-full"
                    style={{ backgroundColor: colors.primarySoft }}
                  >
                    <MaterialIcons name="check-circle" size={40} color={colors.primary} />
                  </View>
                  <Text
                    style={{ fontSize: 20, fontFamily: ListifyFonts.bold, color: colors.textPrimary }}
                  >
                    Offer Sent!
                  </Text>
                  <Text
                    style={{
                      marginTop: 4,
                      textAlign: "center",
                      fontSize: 14,
                      fontFamily: ListifyFonts.regular,
                      color: colors.textSecondary,
                    }}
                  >
                    The seller will be notified and can accept or counter.
                  </Text>
                </View>
              ) : (
                <>
                  <View className="mb-5 flex-row items-center justify-between">
                    <Text
                      style={{ fontSize: 24, fontFamily: ListifyFonts.bold, color: colors.textPrimary }}
                    >
                      Make an Offer
                    </Text>
                    <Pressable
                      onPress={closeOfferSheet}
                      className="rounded-full p-2"
                      style={({ pressed }) => ({
                        backgroundColor: pressed ? colors.surfaceMuted : "transparent",
                      })}
                    >
                      <MaterialIcons name="close" size={24} color={colors.iconMuted} />
                    </Pressable>
                  </View>

                  <View
                    className="mb-5 flex-row items-center gap-3 rounded-xl p-3"
                    style={{ backgroundColor: colors.surfaceMuted }}
                  >
                    {images[0] ? (
                      <Image
                        source={images[0]}
                        contentFit="cover"
                        className="h-14 w-14 rounded-lg"
                      />
                    ) : (
                      <View
                        className="h-14 w-14 items-center justify-center rounded-lg"
                        style={{ backgroundColor: colors.border }}
                      >
                        <MaterialIcons name="image" size={24} color={colors.iconMuted} />
                      </View>
                    )}
                    <View className="flex-1">
                      <Text
                        style={{ fontSize: 13, fontFamily: ListifyFonts.medium, color: colors.textPrimary }}
                        numberOfLines={1}
                      >
                        {title}
                      </Text>
                      <Text
                        style={{
                          marginTop: 2,
                          fontSize: 12,
                          fontFamily: ListifyFonts.medium,
                          color: colors.textSecondary,
                          textTransform: "uppercase",
                        }}
                      >
                        Listed price
                      </Text>
                      <Text
                        style={{ fontSize: 16, fontFamily: ListifyFonts.bold, color: colors.textPrimary }}
                      >
                        {priceLabel}
                      </Text>
                    </View>
                  </View>

                  {recommendedOffers.length > 0 ? (
                    <View className="mb-6">
                      <Text
                        style={{
                          marginBottom: 12,
                          fontSize: 12,
                          fontFamily: ListifyFonts.medium,
                          color: colors.textSecondary,
                          textTransform: "uppercase",
                          letterSpacing: 0.5,
                        }}
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
                                borderColor: isSelected ? colors.primary : colors.border,
                                backgroundColor: isSelected ? colors.primarySoft : colors.inputBackground,
                              }}
                            >
                              <Text
                                style={{
                                  fontSize: 14,
                                  fontFamily: ListifyFonts.medium,
                                  color: isSelected ? colors.primaryDeep : colors.textPrimary,
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
                      style={{
                        marginBottom: 8,
                        fontSize: 12,
                        fontFamily: ListifyFonts.medium,
                        color: colors.textPrimary,
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                      }}
                    >
                      Your offer
                    </Text>
                    <View
                      className="h-14 flex-row items-center rounded-xl px-4"
                      style={{
                        borderWidth: 2,
                        borderColor: colors.border,
                        backgroundColor: colors.inputBackground,
                      }}
                    >
                      <Text
                        style={{ fontSize: 20, fontFamily: ListifyFonts.bold, color: colors.textTertiary }}
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
                        placeholderTextColor={colors.inputPlaceholder}
                        style={{
                          marginLeft: 8,
                          flex: 1,
                          fontSize: 20,
                          fontFamily: ListifyFonts.bold,
                          paddingVertical: 0,
                          color: colors.textPrimary,
                        }}
                      />
                    </View>
                    {offerError ? (
                      <Text
                        style={{
                          marginTop: 8,
                          fontSize: 13,
                          fontFamily: ListifyFonts.medium,
                          color: colors.danger,
                        }}
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
                        <ActivityIndicator size="small" color={colors.textOnPrimary} />
                      ) : (
                        <>
                          <Text
                            style={{ fontSize: 18, fontFamily: ListifyFonts.semiBold, color: colors.textOnPrimary }}
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

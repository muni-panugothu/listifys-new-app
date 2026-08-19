import { MaterialIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "@/lib/safe-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dimensions,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  UIManager,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ListingVideoPlayer } from "@/components/listing-media-viewer";
import { PortfolioGalleryModal } from "@/components/portfolio-gallery-modal";
import { ProfileAvatarImage } from "@/components/profile-avatar-image";
import { ServiceReviewModal } from "@/components/service-review-modal";
import { TopSaveToast } from "@/components/top-save-toast";
import { ListifyFonts } from "@/constants/typography";
import { requestJson, resolveAbsoluteMediaUrl } from "@/features/auth/services/auth-api";
import {
  addToRecentlyViewed,
  toggleSaveListing,
  type ListingItem,
} from "@/features/listing/services/listing-api";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { formatPrice } from "@/lib/currency";
import { formatServiceExperienceLabel } from "@/lib/format-service-experience";
import { buildListingChatHref } from "@/lib/listing-chat";
import {
  getListingContactSectionTitle,
  getListingModelForCategory,
  openListingPhoneDialer,
  resolveListingContactPhone,
} from "@/lib/listing-contact-phone";
import {
  normalizeListingVideos,
  type ListingVideoEntry,
} from "@/lib/listing-media";
import { getListingSellerId, isOwnListing } from "@/lib/is-own-listing";
import { Image } from "@/lib/nativewind-interop";
import { showErrorToast } from "@/lib/toast";
import { useSwrListing } from "@/lib/use-swr-listing";
import { useLocale } from "@/providers/locale-provider";
import { useTheme } from "@/providers/theme-provider";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { selectLocationLabel } from "@/store/slices/location-slice";
import { showAuthGate } from "@/store/slices/auth-gate-slice";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const HERO_HEIGHT = Math.round(SCREEN_WIDTH * 0.72);
const GALLERY_SIDE = 16;
const GALLERY_INNER_PAD = 10;
const GALLERY_GAP = 8;
const GALLERY_SLOTS = 6;
const THUMB_SIZE = Math.floor(
  (SCREEN_WIDTH -
    GALLERY_SIDE * 2 -
    GALLERY_INNER_PAD * 2 -
    GALLERY_GAP * (GALLERY_SLOTS - 1)) /
    GALLERY_SLOTS,
);
const THUMB_OVERLAP = Math.round(THUMB_SIZE / 2) + 8;
const ABOUT_PREVIEW_CHARS = 160;

type DetailTab = "about" | "services" | "gallery" | "reviews";

type ApiReviewItem = {
  _id: string;
  rating: number;
  title?: string;
  comment: string;
  createdAt: string;
  userId?: {
    name?: string;
    profileImageUrl?: string;
    profileImage?: string;
    avatar?: string;
    googleProfileImage?: string;
  };
};

type PricePlan = {
  id: string;
  title: string;
  subtitle: string;
  price: string;
  popular?: boolean;
};

const DETAIL_TABS: { key: DetailTab; label: string }[] = [
  { key: "about", label: "About" },
  { key: "services", label: "Services" },
  { key: "gallery", label: "Gallery" },
  { key: "reviews", label: "Reviews" },
];

function parseParam(value: string | string[] | undefined, fallback: string) {
  if (Array.isArray(value)) return value[0] ?? fallback;
  return value ?? fallback;
}

function normalizeReviewItem(review: ApiReviewItem): ApiReviewItem {
  if (!review.userId || typeof review.userId !== "object") return review;
  const user = review.userId;
  const profileImageUrl = resolveAbsoluteMediaUrl(
    user.profileImageUrl ??
      user.profileImage ??
      user.googleProfileImage ??
      user.avatar,
  );
  return {
    ...review,
    userId: {
      ...user,
      profileImageUrl: profileImageUrl ?? undefined,
      profileImage: resolveAbsoluteMediaUrl(user.profileImage) ?? undefined,
      googleProfileImage: resolveAbsoluteMediaUrl(user.googleProfileImage) ?? undefined,
      avatar: resolveAbsoluteMediaUrl(user.avatar) ?? undefined,
    },
  };
}

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  const wks = Math.floor(days / 7);
  if (wks < 5) return `${wks}w ago`;
  const mons = Math.floor(days / 30);
  if (mons < 12) return `${mons}mo ago`;
  return `${Math.floor(mons / 12)}y ago`;
}

async function fetchReviewsForListing(listingId: string): Promise<ApiReviewItem[]> {
  try {
    const res = await requestJson<{ success: boolean; data: ApiReviewItem[] }>(
      `/api/services/reviews/listing/${listingId}?limit=20&sort=-createdAt`,
    );
    return (res.data ?? []).map(normalizeReviewItem);
  } catch {
    return [];
  }
}

function formatServiceLocation(listing: ListingItem | null): string {
  if (!listing) return "Location not specified";
  const loc = (listing as { location?: unknown }).location;
  if (typeof loc === "string" && loc.trim()) return loc.trim();
  if (loc && typeof loc === "object") {
    const obj = loc as Record<string, string | undefined>;
    const parts = [obj.address, obj.landmark, obj.city, obj.state, obj.pincode].filter(Boolean);
    if (parts.length) return parts.join(", ");
  }
  return "Location not specified";
}

function resolveCategoryLabel(listing: ListingItem | null): string {
  if (!listing) return "Services";
  const cat = (listing as { category?: unknown }).category;
  if (cat && typeof cat === "object" && "name" in cat && typeof (cat as { name?: string }).name === "string") {
    return (cat as { name: string }).name;
  }
  if (typeof cat === "string" && cat.trim()) return cat;
  return listing.subcategory ?? "Services";
}

function resolveProviderUser(listing: ListingItem | null): Record<string, unknown> | null {
  if (!listing) return null;
  if (typeof listing.userId === "object" && listing.userId) {
    return listing.userId as Record<string, unknown>;
  }
  if (listing.seller && typeof listing.seller === "object") {
    return listing.seller as Record<string, unknown>;
  }
  return null;
}

function resolveProviderName(listing: ListingItem | null): string {
  const user = resolveProviderUser(listing);
  if (user && typeof user.name === "string" && user.name.trim()) return user.name;
  return listing?.sellerName ?? "Service Provider";
}

function resolveProviderRole(listing: ListingItem | null): string {
  if (!listing) return "Provider";
  const serviceType = (listing as { serviceType?: string }).serviceType;
  if (serviceType?.trim()) return serviceType;
  if (listing.subcategory?.trim()) return listing.subcategory;
  const exp = formatServiceExperienceLabel(listing);
  return exp || "Provider";
}

function buildPricingPlans(listing: ListingItem): PricePlan[] {
  const pricing = (listing as { pricing?: { basePrice?: number; priceType?: string } }).pricing;
  const basePrice = pricing?.basePrice ?? listing.price;
  const priceType = pricing?.priceType ?? (listing as { priceType?: string }).priceType;
  const currency = listing.currency ?? "₹";

  if (basePrice == null) return [];

  const formattedPrice = formatPrice(Number(basePrice), currency, listing.countryCode ?? undefined);
  const unitLabel =
    priceType === "hourly" || priceType === "Hourly" || priceType === "Per Hour"
      ? "/hr"
      : priceType === "daily" || priceType === "Daily" || priceType === "Per Day"
        ? "/day"
        : priceType === "Per Visit"
          ? "/visit"
          : priceType === "project" || priceType === "Per Project"
            ? "/project"
            : priceType === "monthly" || priceType === "Monthly" || priceType === "Per Month"
              ? "/mo"
              : "";

  const serviceArea = (listing as { serviceArea?: string }).serviceArea;

  return [
    {
      id: "main",
      title: listing.title ?? "Service",
      subtitle: [listing.subcategory, serviceArea].filter(Boolean).join(" · ") || "Professional service",
      price: `${formattedPrice}${unitLabel}`,
      popular: true,
    },
  ];
}

function ServiceDetailSkeleton({
  heroHeight,
  insetTop,
}: {
  heroHeight: number;
  insetTop: number;
}) {
  const { colors, isDark } = useTheme();
  const bone = isDark ? colors.surfaceMuted : "#E8EDEA";

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        style={{
          height: heroHeight,
          backgroundColor: bone,
          borderBottomLeftRadius: 24,
          borderBottomRightRadius: 24,
        }}
      />
      <View style={{ paddingHorizontal: GALLERY_SIDE, paddingTop: 24, gap: 12 }}>
        <View style={{ width: 100, height: 24, borderRadius: 12, backgroundColor: bone }} />
        <View style={{ width: "85%", height: 28, borderRadius: 8, backgroundColor: bone }} />
        <View style={{ width: "60%", height: 16, borderRadius: 8, backgroundColor: bone }} />
        <View style={{ flexDirection: "row", gap: 24, marginTop: 8 }}>
          {DETAIL_TABS.map((tab) => (
            <View key={tab.key} style={{ width: 56, height: 18, borderRadius: 6, backgroundColor: bone }} />
          ))}
        </View>
        <View style={{ marginTop: 16, width: "100%", height: 80, borderRadius: 12, backgroundColor: bone }} />
      </View>
      <View style={{ position: "absolute", top: insetTop + 8, left: 16 }}>
        <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: bone }} />
      </View>
    </View>
  );
}

export function ServiceDetailScreen() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { isoCountryCode } = useLocale();
  const user = useAppSelector((s) => s.auth.user);
  const isAuthenticated = useAppSelector((s) => s.auth.isAuthenticated);
  const locationLabel = useAppSelector(selectLocationLabel);

  const params = useLocalSearchParams<{ id?: string | string[]; category?: string | string[] }>();
  const listingId = parseParam(params.id, "");

  const {
    listing: swrListing,
    isLoading: swrLoading,
    refresh: refreshListing,
  } = useSwrListing("services", listingId);

  const [listing, setListing] = useState<ListingItem | null>(swrListing ?? null);
  const [reviews, setReviews] = useState<ApiReviewItem[]>([]);
  const [activeTab, setActiveTab] = useState<DetailTab>("about");
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [descExpanded, setDescExpanded] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [saveToastVisible, setSaveToastVisible] = useState(false);
  const [saveToastKey, setSaveToastKey] = useState(0);
  const [portfolioModalVisible, setPortfolioModalVisible] = useState(false);
  const [portfolioStartIndex, setPortfolioStartIndex] = useState(0);
  const [reviewModalVisible, setReviewModalVisible] = useState(false);
  const [videoModalVisible, setVideoModalVisible] = useState(false);
  const heroScrollRef = useRef<ScrollView>(null);

  const loading = !listing && swrLoading;

  useEffect(() => {
    if (swrListing && swrListing !== listing) setListing(swrListing);
  }, [swrListing]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!listingId) return;
    let cancelled = false;
    fetchReviewsForListing(listingId)
      .then((res) => {
        if (!cancelled) setReviews(res);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [listingId]);

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
    try {
      const reviewsRes = await fetchReviewsForListing(listingId);
      setReviews(reviewsRes);
    } catch {}
  }, [listingId, refreshListing]);

  const { refreshing, onRefresh: baseRefresh } = usePullToRefresh();
  const onRefresh = useCallback(() => {
    baseRefresh();
    void loadListing();
  }, [baseRefresh, loadListing]);

  const listingImages = useMemo(
    () => (listing?.images ?? []).filter((img) => typeof img === "string" && img.length > 0),
    [listing?.images],
  );

  const demoVideo: ListingVideoEntry | null = useMemo(() => {
    const videos = normalizeListingVideos(listing?.videos);
    return videos[0] ?? null;
  }, [listing?.videos]);

  const serviceTitle = listing?.title ?? "";
  const categoryLabel = resolveCategoryLabel(listing);
  const locationText = formatServiceLocation(listing);
  const description = listing?.description?.trim() ?? "";
  const providerName = resolveProviderName(listing);
  const providerRole = resolveProviderRole(listing);
  const providerUser = resolveProviderUser(listing);
  const sellerId = listing ? getListingSellerId(listing) : null;
  const isOwnService = isOwnListing(listing, user?.id);
  const sellerContact = useMemo(
    () => (listing ? resolveListingContactPhone(listing) : null),
    [listing],
  );

  const statsRating = (listing as { stats?: { rating?: number; reviewCount?: number } } | null)?.stats?.rating;
  const statsReviewCount = (listing as { stats?: { reviewCount?: number } } | null)?.stats?.reviewCount;

  const averageRating = useMemo(() => {
    if (typeof statsRating === "number" && statsRating > 0) return statsRating;
    if (reviews.length === 0) return null;
    const sum = reviews.reduce((acc, r) => acc + (r.rating ?? 0), 0);
    return sum / reviews.length;
  }, [statsRating, reviews]);

  const reviewCount = statsReviewCount ?? reviews.length;

  const pricing = (listing as { pricing?: { basePrice?: number } } | null)?.pricing;
  const basePrice = pricing?.basePrice ?? listing?.price;
  const currency = listing?.currency ?? "₹";
  const startingPrice =
    basePrice != null
      ? formatPrice(Number(basePrice), currency, listing?.countryCode ?? undefined)
      : null;

  const pricingPlans = listing ? buildPricingPlans(listing) : [];
  const hasBookingSupport = Boolean((listing as { providerId?: string })?.providerId);

  const footerBottom = Math.max(insets.bottom, 12);

  const circleBtn = useMemo(
    () => ({
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
    }),
    [isDark],
  );

  const cardSurface = isDark ? colors.surfaceElevated : colors.card;

  const hasGallery = listingImages.length > 0;
  const showThumbStrip = hasGallery;

  const galleryThumbs = useMemo(() => {
    if (!listingImages.length) return [];
    if (listingImages.length <= GALLERY_SLOTS) {
      return listingImages.map((uri, index) => ({
        uri,
        index,
        overflowLabel: null as string | null,
      }));
    }
    const remaining = listingImages.length - (GALLERY_SLOTS - 1);
    const overflowLabel = `+${remaining}`;
    return [
      ...listingImages.slice(0, GALLERY_SLOTS - 1).map((uri, index) => ({
        uri,
        index,
        overflowLabel: null as string | null,
      })),
      {
        uri: listingImages[GALLERY_SLOTS - 1],
        index: GALLERY_SLOTS - 1,
        overflowLabel,
      },
    ];
  }, [listingImages]);

  const scrollHeroTo = useCallback(
    (index: number) => {
      const safe = Math.max(0, Math.min(index, listingImages.length - 1));
      setActiveImageIndex(safe);
      heroScrollRef.current?.scrollTo({ x: safe * SCREEN_WIDTH, animated: true });
    },
    [listingImages.length],
  );

  const openGalleryAt = useCallback((index: number) => {
    setPortfolioStartIndex(index);
    setPortfolioModalVisible(true);
  }, []);

  const handleToggleSave = useCallback(async () => {
    if (!listingId) return;
    if (!isAuthenticated) {
      dispatch(
        showAuthGate({
          action: "general",
          redirectTo: `/service-detail?category=services&id=${listingId}`,
        }),
      );
      return;
    }
    const wasSaved = isSaved;
    setIsSaved(!wasSaved);
    if (!wasSaved) {
      setSaveToastKey((k) => k + 1);
      setSaveToastVisible(true);
    }
    try {
      const res = await toggleSaveListing("services", listingId);
      setIsSaved(res.saved);
    } catch {
      setIsSaved(wasSaved);
    }
  }, [dispatch, isAuthenticated, isSaved, listingId]);

  const handleShare = useCallback(() => {
    if (!listing) return;
    const ratingLine =
      averageRating != null ? `\n${averageRating.toFixed(1)} ★ (${reviewCount} reviews)` : "";
    void Share.share({
      title: serviceTitle,
      message: `${serviceTitle}${startingPrice ? ` — ${startingPrice}` : ""}${ratingLine}\n${locationText}`,
    }).catch(() => {});
  }, [averageRating, listing, locationText, reviewCount, serviceTitle, startingPrice]);

  const handleMessageSeller = useCallback(() => {
    if (!listing || !sellerId) return;
    if (!user) {
      dispatch(
        showAuthGate({
          action: "general",
          redirectTo: `/service-detail?category=services&id=${listingId}`,
        }),
      );
      return;
    }
    if (isOwnListing(listing, user?.id)) {
      showErrorToast("Not Allowed", "You can't message yourself on your own service.");
      return;
    }
    router.push(
      buildListingChatHref({
        recipientId: sellerId,
        sellerId,
        name: providerName,
        productId: listing._id,
        productType: "services",
        productTitle: listing.title ?? categoryLabel,
        productPrice: basePrice,
        productImage: listing.images?.[0] ?? null,
        currency,
      }),
    );
  }, [
    basePrice,
    categoryLabel,
    currency,
    dispatch,
    listing,
    listingId,
    providerName,
    router,
    sellerId,
    user,
  ]);

  const handleCallProvider = useCallback(async () => {
    if (!listing || !sellerContact) {
      showErrorToast("No Number", "Provider has not provided a contact number.");
      return;
    }
    if (!sellerId) {
      showErrorToast("Unavailable", "Provider information is missing for this listing.");
      return;
    }
    await openListingPhoneDialer({
      contact: sellerContact,
      listingId: listing._id,
      sellerId,
      listingModel: getListingModelForCategory("services"),
    });
  }, [listing, sellerContact, sellerId]);

  const handleOpenReview = useCallback(() => {
    if (isOwnService) {
      showErrorToast("Not allowed", "You cannot review your own service.");
      return;
    }
    if (!isAuthenticated) {
      dispatch(
        showAuthGate({
          action: "general",
          redirectTo: listingId ? `/service-detail?category=services&id=${listingId}` : null,
        }),
      );
      return;
    }
    setReviewModalVisible(true);
  }, [dispatch, isAuthenticated, isOwnService, listingId]);

  const handleReviewSubmitted = useCallback(async () => {
    if (!listingId) return;
    const fresh = await fetchReviewsForListing(listingId);
    setReviews(fresh);
  }, [listingId]);

  const handleTabPress = useCallback((tab: DetailTab) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setActiveTab(tab);
  }, []);

  const handlePrimaryCta = useCallback(() => {
    if (hasBookingSupport || sellerContact) {
      handleMessageSeller();
      return;
    }
    handleMessageSeller();
  }, [handleMessageSeller, hasBookingSupport, sellerContact]);

  const ctaLabel = useMemo(() => {
    if (isOwnService) return null;
    if (hasBookingSupport) return "Book Service Now";
    if (sellerContact) return "Contact Provider";
    return "Message Provider";
  }, [hasBookingSupport, isOwnService, sellerContact]);

  const descPreview =
    description.length > ABOUT_PREVIEW_CHARS && !descExpanded
      ? `${description.slice(0, ABOUT_PREVIEW_CHARS).trim()}…`
      : description;

  const showReadMore = description.length > ABOUT_PREVIEW_CHARS;

  if (loading) {
    return (
      <ServiceDetailSkeleton heroHeight={HERO_HEIGHT} insetTop={insets.top} />
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
          paddingHorizontal: 24,
        }}
      >
        <MaterialIcons name="error-outline" size={48} color={colors.iconMuted} />
        <Text
          style={{
            marginTop: 8,
            fontSize: 14,
            fontFamily: ListifyFonts.regular,
            color: colors.textSecondary,
            textAlign: "center",
          }}
        >
          Service not found
        </Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ fontFamily: ListifyFonts.semiBold, color: colors.primary }}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const galleryGridGap = 10;
  const galleryColWidth = (SCREEN_WIDTH - GALLERY_SIDE * 2 - galleryGridGap) / 2;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {saveToastVisible ? (
        <TopSaveToast
          key={saveToastKey}
          visible
          message="Service saved"
          onHidden={() => setSaveToastVisible(false)}
        />
      ) : null}

      <ScrollView
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
        contentContainerStyle={{
          paddingBottom: isOwnService ? 24 + footerBottom : 100 + footerBottom,
        }}
      >
        {/* Hero media */}
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
                {listingImages.map((img, idx) => (
                  <Image
                    key={`${img}-${idx}`}
                    source={img}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    recyclingKey={img}
                    transition={180}
                    style={{ width: SCREEN_WIDTH, height: HERO_HEIGHT }}
                  />
                ))}
              </ScrollView>
            ) : (
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                <MaterialIcons name="home-repair-service" size={52} color={colors.iconMuted} />
              </View>
            )}

            {/* Floating controls */}
            <View
              pointerEvents="box-none"
              style={{
                position: "absolute",
                top: insets.top + 8,
                left: GALLERY_SIDE,
                right: GALLERY_SIDE,
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Pressable
                onPress={() => router.back()}
                style={({ pressed }) => [{ ...circleBtn, opacity: pressed ? 0.85 : 1 }]}
                accessibilityLabel="Go back"
              >
                <MaterialIcons name="arrow-back-ios" size={18} color={colors.icon} style={{ marginLeft: 4 }} />
              </Pressable>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <Pressable
                  onPress={handleShare}
                  style={({ pressed }) => [{ ...circleBtn, opacity: pressed ? 0.85 : 1 }]}
                  accessibilityLabel="Share service"
                >
                  <MaterialIcons name="share" size={20} color={colors.icon} />
                </Pressable>
                <Pressable
                  onPress={() => void handleToggleSave()}
                  style={({ pressed }) => [{ ...circleBtn, opacity: pressed ? 0.85 : 1 }]}
                  accessibilityLabel={isSaved ? "Remove from saved" : "Save service"}
                >
                  <MaterialIcons
                    name={isSaved ? "favorite" : "favorite-border"}
                    size={20}
                    color={isSaved ? colors.primary : colors.icon}
                  />
                </Pressable>
              </View>
            </View>

            {/* Demo video overlay */}
            {demoVideo ? (
              <Pressable
                onPress={() => setVideoModalVisible(true)}
                style={{
                  position: "absolute",
                  alignSelf: "center",
                  top: HERO_HEIGHT * 0.42,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  paddingHorizontal: 18,
                  paddingVertical: 10,
                  borderRadius: 999,
                  backgroundColor: "rgba(0,0,0,0.55)",
                }}
              >
                <MaterialIcons name="play-arrow" size={22} color="#FFFFFF" />
                <Text
                  style={{
                    fontFamily: ListifyFonts.semiBold,
                    fontSize: 14,
                    color: "#FFFFFF",
                  }}
                >
                  Demo Video
                </Text>
              </Pressable>
            ) : null}
          </View>

          {/* Thumbnail strip */}
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
                    ? activeImageIndex >= GALLERY_SLOTS - 1
                    : activeImageIndex === slot.index;

                  return (
                    <Pressable
                      key={`${slot.uri}-thumb-${slot.index}`}
                      onPress={() => {
                        if (slot.overflowLabel) {
                          openGalleryAt(GALLERY_SLOTS - 1);
                        } else {
                          scrollHeroTo(slot.index);
                        }
                      }}
                      style={{
                        width: THUMB_SIZE + (active ? 4 : 0),
                        height: THUMB_SIZE + (active ? 4 : 0),
                        borderRadius: 12,
                        padding: active ? 2 : 0,
                        backgroundColor: active ? cardSurface : "transparent",
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
                          recyclingKey={slot.uri}
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
                                fontSize: 13,
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

        {/* Service metadata */}
        <View
          style={{
            paddingHorizontal: GALLERY_SIDE,
            paddingTop: showThumbStrip ? THUMB_OVERLAP + 16 : 20,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            <View
              style={{
                paddingHorizontal: 12,
                paddingVertical: 5,
                borderRadius: 999,
                backgroundColor: colors.primarySoft,
              }}
            >
              <Text
                style={{
                  fontFamily: ListifyFonts.semiBold,
                  fontSize: 12,
                  color: colors.primary,
                }}
              >
                {categoryLabel}
              </Text>
            </View>
            {averageRating != null ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <MaterialIcons name="star" size={16} color={colors.warning} />
                <Text
                  style={{
                    fontFamily: ListifyFonts.semiBold,
                    fontSize: 13,
                    color: colors.textPrimary,
                  }}
                >
                  {averageRating.toFixed(1)}
                </Text>
                <Text
                  style={{
                    fontFamily: ListifyFonts.regular,
                    fontSize: 13,
                    color: colors.textSecondary,
                  }}
                >
                  ({reviewCount} review{reviewCount === 1 ? "" : "s"})
                </Text>
              </View>
            ) : null}
          </View>

          <Text
            style={{
              marginTop: 12,
              fontFamily: ListifyFonts.bold,
              fontSize: 24,
              color: colors.textPrimary,
              letterSpacing: -0.3,
            }}
          >
            {serviceTitle}
          </Text>

          <View style={{ marginTop: 8, flexDirection: "row", alignItems: "flex-start", gap: 6 }}>
            <MaterialIcons name="location-on" size={18} color={colors.textSecondary} style={{ marginTop: 1 }} />
            <Text
              style={{
                flex: 1,
                fontFamily: ListifyFonts.regular,
                fontSize: 14,
                color: colors.textSecondary,
                lineHeight: 20,
              }}
            >
              {locationText}
            </Text>
          </View>
        </View>

        {/* Tab navigation */}
        <View style={{ marginTop: 22 }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: GALLERY_SIDE,
              gap: 28,
              paddingBottom: 12,
            }}
          >
            {DETAIL_TABS.map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <Pressable
                  key={tab.key}
                  onPress={() => handleTabPress(tab.key)}
                  style={{ paddingBottom: 8 }}
                >
                  <Text
                    style={{
                      fontFamily: isActive ? ListifyFonts.bold : ListifyFonts.medium,
                      fontSize: 16,
                      color: isActive ? colors.primary : colors.textTertiary,
                    }}
                  >
                    {tab.label}
                  </Text>
                  {isActive ? (
                    <View
                      style={{
                        marginTop: 8,
                        height: 3,
                        width: 56,
                        borderRadius: 2,
                        backgroundColor: colors.primary,
                      }}
                    />
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
          <View style={{ height: 1, backgroundColor: colors.border, marginHorizontal: GALLERY_SIDE }} />
        </View>

        {/* Tab content */}
        <View style={{ paddingHorizontal: GALLERY_SIDE, paddingTop: 20 }}>
          {activeTab === "about" ? (
            <>
              <Text
                style={{
                  fontFamily: ListifyFonts.bold,
                  fontSize: 18,
                  color: colors.textPrimary,
                  marginBottom: 10,
                }}
              >
                About
              </Text>
              {description ? (
                <Text
                  style={{
                    fontFamily: ListifyFonts.regular,
                    fontSize: 14,
                    color: colors.textSecondary,
                    lineHeight: 22,
                  }}
                >
                  {descPreview}
                  {showReadMore && !descExpanded ? (
                    <Text
                      onPress={() => {
                        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                        setDescExpanded(true);
                      }}
                      style={{
                        fontFamily: ListifyFonts.semiBold,
                        fontSize: 14,
                        color: colors.primary,
                      }}
                    >
                      {" "}
                      Read more
                    </Text>
                  ) : null}
                  {showReadMore && descExpanded ? (
                    <Text
                      onPress={() => {
                        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                        setDescExpanded(false);
                      }}
                      style={{
                        fontFamily: ListifyFonts.semiBold,
                        fontSize: 14,
                        color: colors.primary,
                      }}
                    >
                      {" "}
                      Show less
                    </Text>
                  ) : null}
                </Text>
              ) : (
                <Text
                  style={{
                    fontFamily: ListifyFonts.regular,
                    fontSize: 14,
                    color: colors.textTertiary,
                  }}
                >
                  No description provided.
                </Text>
              )}

              {/* Service Provider */}
              <Text
                style={{
                  marginTop: 28,
                  fontFamily: ListifyFonts.bold,
                  fontSize: 18,
                  color: colors.textPrimary,
                  marginBottom: 14,
                }}
              >
                {getListingContactSectionTitle("services")}
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <View
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 28,
                    overflow: "hidden",
                    backgroundColor: colors.surfaceMuted,
                  }}
                >
                  <ProfileAvatarImage
                    user={providerUser}
                    fallbackName={providerName}
                    style={{ width: 56, height: 56 }}
                    iconSize={28}
                  />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    numberOfLines={1}
                    style={{
                      fontFamily: ListifyFonts.bold,
                      fontSize: 16,
                      color: colors.textPrimary,
                    }}
                  >
                    {providerName}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={{
                      marginTop: 2,
                      fontFamily: ListifyFonts.regular,
                      fontSize: 13,
                      color: colors.textSecondary,
                    }}
                  >
                    {providerRole}
                  </Text>
                </View>
                <Pressable
                  onPress={handleMessageSeller}
                  style={({ pressed }) => ({
                    width: 44,
                    height: 44,
                    borderRadius: 22,
                    backgroundColor: colors.primary,
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: pressed ? 0.88 : 1,
                  })}
                  accessibilityLabel="Message provider"
                >
                  <MaterialIcons name="chat-bubble-outline" size={20} color={colors.textOnPrimary} />
                </Pressable>
                <Pressable
                  onPress={() => void handleCallProvider()}
                  style={({ pressed }) => ({
                    width: 44,
                    height: 44,
                    borderRadius: 22,
                    borderWidth: 1.5,
                    borderColor: colors.primary,
                    backgroundColor: colors.surface,
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: pressed ? 0.88 : 1,
                  })}
                  accessibilityLabel="Call provider"
                >
                  <MaterialIcons name="phone" size={20} color={colors.primary} />
                </Pressable>
              </View>
            </>
          ) : null}

          {activeTab === "services" ? (
            <>
              <Text
                style={{
                  fontFamily: ListifyFonts.bold,
                  fontSize: 18,
                  color: colors.textPrimary,
                  marginBottom: 12,
                }}
              >
                Services & Pricing
              </Text>
              {pricingPlans.length === 0 ? (
                <Text
                  style={{
                    fontFamily: ListifyFonts.regular,
                    fontSize: 14,
                    color: colors.textTertiary,
                  }}
                >
                  Pricing not available for this service.
                </Text>
              ) : (
                <View style={{ gap: 10 }}>
                  {pricingPlans.map((plan) => (
                    <View
                      key={plan.id}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        borderRadius: 16,
                        borderWidth: plan.popular ? 2 : 1,
                        borderColor: plan.popular ? colors.primary : colors.border,
                        backgroundColor: cardSurface,
                        padding: 16,
                      }}
                    >
                      <View style={{ flex: 1, paddingRight: 12 }}>
                        <Text
                          style={{
                            fontFamily: ListifyFonts.semiBold,
                            fontSize: 16,
                            color: colors.textPrimary,
                          }}
                        >
                          {plan.title}
                        </Text>
                        <Text
                          style={{
                            marginTop: 4,
                            fontFamily: ListifyFonts.regular,
                            fontSize: 13,
                            color: colors.textSecondary,
                          }}
                        >
                          {plan.subtitle}
                        </Text>
                      </View>
                      <Text
                        style={{
                          fontFamily: ListifyFonts.bold,
                          fontSize: 18,
                          color: colors.primary,
                        }}
                      >
                        {plan.price}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </>
          ) : null}

          {activeTab === "gallery" ? (
            <>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 12,
                }}
              >
                <Text
                  style={{
                    fontFamily: ListifyFonts.bold,
                    fontSize: 18,
                    color: colors.textPrimary,
                  }}
                >
                  Gallery
                </Text>
                {listingImages.length > 0 ? (
                  <Pressable onPress={() => openGalleryAt(0)}>
                    <Text
                      style={{
                        fontFamily: ListifyFonts.medium,
                        fontSize: 13,
                        color: colors.primary,
                      }}
                    >
                      View all
                    </Text>
                  </Pressable>
                ) : null}
              </View>
              {listingImages.length === 0 ? (
                <View
                  style={{
                    alignItems: "center",
                    justifyContent: "center",
                    paddingVertical: 40,
                    borderRadius: 16,
                    backgroundColor: colors.surfaceMuted,
                  }}
                >
                  <MaterialIcons name="photo-library" size={40} color={colors.iconMuted} />
                  <Text
                    style={{
                      marginTop: 8,
                      fontFamily: ListifyFonts.regular,
                      fontSize: 14,
                      color: colors.textTertiary,
                    }}
                  >
                    No photos yet
                  </Text>
                </View>
              ) : (
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    gap: galleryGridGap,
                  }}
                >
                  {listingImages.map((uri, index) => (
                    <Pressable
                      key={`${uri}-${index}`}
                      onPress={() => openGalleryAt(index)}
                      style={{
                        width: galleryColWidth,
                        height: galleryColWidth * 0.72,
                        borderRadius: 14,
                        overflow: "hidden",
                        backgroundColor: colors.surfaceMuted,
                      }}
                    >
                      <Image
                        source={uri}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                        recyclingKey={uri}
                        transition={150}
                        style={{ width: "100%", height: "100%" }}
                      />
                    </Pressable>
                  ))}
                </View>
              )}
            </>
          ) : null}

          {activeTab === "reviews" ? (
            <>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 12,
                }}
              >
                <Text
                  style={{
                    fontFamily: ListifyFonts.bold,
                    fontSize: 18,
                    color: colors.textPrimary,
                  }}
                >
                  Reviews{reviewCount > 0 ? ` (${reviewCount})` : ""}
                </Text>
                {!isOwnService ? (
                  <Pressable onPress={handleOpenReview}>
                    <Text
                      style={{
                        fontFamily: ListifyFonts.medium,
                        fontSize: 13,
                        color: colors.primary,
                      }}
                    >
                      Write a Review
                    </Text>
                  </Pressable>
                ) : null}
              </View>

              {reviews.length === 0 ? (
                <View
                  style={{
                    alignItems: "center",
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: cardSurface,
                    paddingVertical: 32,
                    paddingHorizontal: 20,
                  }}
                >
                  <MaterialIcons name="rate-review" size={40} color={colors.iconMuted} />
                  <Text
                    style={{
                      marginTop: 10,
                      fontFamily: ListifyFonts.regular,
                      fontSize: 14,
                      color: colors.textSecondary,
                      textAlign: "center",
                    }}
                  >
                    No reviews yet. Be the first to review!
                  </Text>
                  {!isOwnService ? (
                    <Pressable
                      onPress={handleOpenReview}
                      style={{
                        marginTop: 16,
                        borderRadius: 999,
                        backgroundColor: colors.primary,
                        paddingHorizontal: 20,
                        paddingVertical: 12,
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: ListifyFonts.semiBold,
                          fontSize: 14,
                          color: colors.textOnPrimary,
                        }}
                      >
                        Write the first review
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : (
                <View style={{ gap: 16 }}>
                  {reviews.map((item) => {
                    const reviewerName = item.userId?.name ?? "Anonymous";
                    return (
                      <View
                        key={item._id}
                        style={{
                          borderBottomWidth: 1,
                          borderBottomColor: colors.border,
                          paddingBottom: 16,
                        }}
                      >
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                          <View
                            style={{
                              width: 40,
                              height: 40,
                              borderRadius: 20,
                              overflow: "hidden",
                            }}
                          >
                            <ProfileAvatarImage
                              user={item.userId}
                              fallbackName={reviewerName}
                              style={{ width: 40, height: 40 }}
                              iconSize={20}
                            />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text
                              style={{
                                fontFamily: ListifyFonts.semiBold,
                                fontSize: 14,
                                color: colors.textPrimary,
                              }}
                            >
                              {reviewerName}
                            </Text>
                            <View style={{ flexDirection: "row", marginTop: 2 }}>
                              {Array.from({ length: 5 }).map((_, index) => (
                                <MaterialIcons
                                  key={`${item._id}-star-${index}`}
                                  name={index < item.rating ? "star" : "star-border"}
                                  size={14}
                                  color={colors.warning}
                                />
                              ))}
                            </View>
                          </View>
                          <Text
                            style={{
                              fontFamily: ListifyFonts.regular,
                              fontSize: 12,
                              color: colors.textTertiary,
                            }}
                          >
                            {relativeDate(item.createdAt)}
                          </Text>
                        </View>
                        {item.title ? (
                          <Text
                            style={{
                              marginTop: 8,
                              fontFamily: ListifyFonts.semiBold,
                              fontSize: 13,
                              color: colors.textPrimary,
                            }}
                          >
                            {item.title}
                          </Text>
                        ) : null}
                        <Text
                          style={{
                            marginTop: 6,
                            fontFamily: ListifyFonts.regular,
                            fontSize: 14,
                            color: colors.textSecondary,
                            lineHeight: 20,
                          }}
                        >
                          {item.comment}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              )}
            </>
          ) : null}
        </View>
      </ScrollView>

      {/* Bottom CTA */}
      {ctaLabel ? (
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            paddingHorizontal: GALLERY_SIDE,
            paddingTop: 12,
            paddingBottom: footerBottom,
            backgroundColor: isDark ? "rgba(18,22,26,0.96)" : "rgba(255,255,255,0.96)",
            borderTopWidth: 1,
            borderTopColor: colors.border,
          }}
        >
          <Pressable
            onPress={handlePrimaryCta}
            style={({ pressed }) => ({
              height: 52,
              borderRadius: 999,
              backgroundColor: colors.primary,
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.92 : 1,
              transform: [{ scale: pressed ? 0.98 : 1 }],
            })}
          >
            <Text
              style={{
                fontFamily: ListifyFonts.bold,
                fontSize: 17,
                color: colors.textOnPrimary,
              }}
            >
              {ctaLabel}
            </Text>
          </Pressable>
        </View>
      ) : null}

      <PortfolioGalleryModal
        visible={portfolioModalVisible}
        title="Gallery"
        images={listingImages}
        initialIndex={portfolioStartIndex}
        onClose={() => setPortfolioModalVisible(false)}
      />

      <Modal
        visible={videoModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setVideoModalVisible(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.92)",
            justifyContent: "center",
          }}
        >
          <Pressable
            onPress={() => setVideoModalVisible(false)}
            style={{
              position: "absolute",
              top: insets.top + 12,
              right: 16,
              zIndex: 10,
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: "rgba(255,255,255,0.15)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <MaterialIcons name="close" size={22} color="#FFFFFF" />
          </Pressable>
          {demoVideo ? (
            <ListingVideoPlayer
              uri={demoVideo.url}
              poster={demoVideo.thumbnailUrl}
              style={{ width: SCREEN_WIDTH, height: SCREEN_WIDTH * 0.56 }}
              autoPlay
              isActive={videoModalVisible}
              showControls
              muted={false}
            />
          ) : null}
        </View>
      </Modal>

      {listingId && sellerId ? (
        <ServiceReviewModal
          visible={reviewModalVisible}
          listingId={listingId}
          providerId={sellerId}
          providerName={providerName}
          serviceTitle={serviceTitle}
          categoryLabel={categoryLabel}
          coverImage={listingImages[0] ?? null}
          locationText={locationText}
          averageRating={averageRating}
          reviewCount={reviewCount}
          providerAvatar={providerUser}
          onClose={() => setReviewModalVisible(false)}
          onSubmitted={handleReviewSubmitted}
        />
      ) : null}
    </View>
  );
}

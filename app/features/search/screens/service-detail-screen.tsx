import { MaterialIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { type Href, useLocalSearchParams, useRouter } from "@/lib/safe-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PortfolioGalleryModal } from "@/components/portfolio-gallery-modal";
import { ProfileAvatarImage } from "@/components/profile-avatar-image";
import { ServiceReviewModal } from "@/components/service-review-modal";
import { ListifyColors } from "@/constants/listify-theme";
import { ListifyFonts } from "@/constants/typography";
import { requestJson, resolveAbsoluteMediaUrl } from "@/features/auth/services/auth-api";
import { fetchListingById } from "@/features/listing/services/listing-api";
import type { ListingItem } from "@/features/listing/services/listing-api";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { formatPrice } from "@/lib/currency";
import { formatServiceExperienceLabel } from "@/lib/format-service-experience";
import { buildListingChatHref } from "@/lib/listing-chat";
import { getListingSellerId, isOwnListing } from "@/lib/is-own-listing";
import { Image } from "@/lib/nativewind-interop";
import { showErrorToast } from "@/lib/toast";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { showAuthGate } from "@/store/slices/auth-gate-slice";
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

type PortfolioItem = {
  id: string;
  image: string;
};

type PricePlan = {
  id: string;
  title: string;
  subtitle: string;
  price: string;
  popular?: boolean;
};

const STATIC_COVER =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuBGs23VktszuEagNylsPgf-9GFSu_s7uCb-J6Qi7ZCGqtm6O_KuWB_Y211FM3R8s4vQ9Tqs5YGlZ-C0v8gy8KMLTMzjLKoRrBkYepTFmKvmGpe_hWjjFe-xc3r1xuF-7JuUn-rwb4oqOoJrkNJOmG0wgxodueczJg2KwV6eEWKRyQzOMcWUqEjcex5_N_X3vo12YYaGEyFbq7_UXCyV2Z4KzsGH7wQVLUsRieRu8MkUOBXmvHwNx2Oy95ElfT9LiF_a4z5IgO8CNOM";

const STATIC_PROFILE =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuBED343g7NNJLDUCiIrrFmoy5-EuJ-1-7wUNbwPZB6UWNvZdRTc4oCsjzevF1m4W4nBGpyZhTP142vJfSrr-pEyK9M5vBqCg_xhx21wxvxbWX0_ZbyvpNlv7IqgNzb6Dsx6pGCypesc_jOGb4-Le_eNcsvv-HYTlLcNnaIFv7LPeaednPFP8pCcIT4BcgDh2LelQ5eV_wuYr2HGFrpQxziOTQILaAO7JE-ywYSWMvBmok9FQzxpUczRw-YymnXUMuip2TJZJ4Eh1uY";

const staticPortfolioItems: PortfolioItem[] = [
  {
    id: "living-room",
    image:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuAlF2hAkVSYAm55L-77f-1LeCVgUsqf1kGAAdXwSavFj5-Dx2962_CVzkWf4-b0BqlhxzIeVvqSGbJWcHWC5SJuBbOlRHkuuU7qrbEFXcT97DuzwhCnZLoEL3MB-nPruSU_4jNS6ImivBqH_Hwwv833ShjNfWIBX1O-3UIC65XKVuj-ttjKVYA6qt4UblJPvt-CDdr7zy4fPajx452zpb-iyP3S3RH7087CdCoAv17-zMQbXC5XXN5OZOQizqonf3zmlIGu0u62B2E",
  },
  {
    id: "kitchen",
    image:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuCIvXQr-RSAw2-OgCORDMu-psGNbDYVhAR7cuavsRinq3am5cPvQtmKfK22bDAY0UIbBfG1sf7vPsIv9KjrfOxChm8rI4LQonJP8t3UGxtulsgtQJTky9trMQECYtbUEkiK9G7SF8ZmAjAcJVjUShIIRHZWuXJ0S2gCheTZDH95DH7HvAW6jFriKib5pP82y65z_sGYW_vPPkLbZtAzdCRqSFLOw6WZyEUytxiD2LSzB3mzYjKDpshkMaXMLE_dweO8y-b0oK5OIcE",
  },
  {
    id: "bedroom",
    image:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuC_Syn_4SedQpoO1LekoxQB6Fm47gnq8TAiGA_rh7V8_vh1nKziPOf0fpithR0zMz6vzyJGr1grsWewxSM-C1XfBbIQQJ99IS-ADT7Rf3CzLvqOD51d0_GDOwD3Z5v8-bW0yctNOJ-WsLiD4B10s6y2y7IirRAwjgkxFmtHcqNVmzTx4r9u8CIfV_jmMRJ1mHZidh_cKeeQM49jBza2WKrOu49t6Bi-CQ2ga3B8UTajLhhm8AUKkqpbrtcjCfu8LhXB5_LlvKkZEvc",
  },
];

const staticPricingPlans: PricePlan[] = [
  {
    id: "consult",
    title: "Consultation Call",
    subtitle: "45 min video strategy session",
    price: "₹1,499",
  },
  {
    id: "room-redesign",
    title: "Room Redesign",
    subtitle: "Full 2D layout + Material list",
    price: "₹8,999",
    popular: true,
  },
];



function parseParam(value: string | string[] | undefined, fallback: string) {
  if (Array.isArray(value)) {
    return value[0] ?? fallback;
  }
  return value ?? fallback;
}

function buildPortfolioItems(images: string[]): PortfolioItem[] {
  return images.map((img, i) => ({ id: `img-${i}`, image: img }));
}

function buildPricingPlans(listing: ListingItem): PricePlan[] {
  const pricing = (listing as any).pricing;
  const basePrice = pricing?.basePrice ?? listing.price;
  const priceType = pricing?.priceType ?? (listing as any).priceType;
  const currency = listing.currency ?? "₹";

  if (basePrice == null) return staticPricingPlans;

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

  return [
    {
      id: "main",
      title: listing.title ?? "Service",
      subtitle: `${(listing as any).subcategory ?? "Professional Service"}${(listing as any).serviceArea ? ` · ${(listing as any).serviceArea}` : ""}`,
      price: `${formattedPrice}${unitLabel}`,
      popular: true,
    },
  ];
}

export function ServiceDetailScreen() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const user = useAppSelector((s) => s.auth.user);
  const isAuthenticated = useAppSelector((s) => s.auth.isAuthenticated);
  const params = useLocalSearchParams<{
    id?: string | string[];
    category?: string | string[];
  }>();
  const insets = useSafeAreaInsets();

  const listingId = parseParam(params.id, "");

  const [listing, setListing] = useState<ListingItem | null>(null);
  const [loading, setLoading] = useState(!!listingId);
  const [reviews, setReviews] = useState<ApiReviewItem[]>([]);
  const [reviewTotal, setReviewTotal] = useState(0);
  const [portfolioModalVisible, setPortfolioModalVisible] = useState(false);
  const [reviewModalVisible, setReviewModalVisible] = useState(false);

  const loadListing = useCallback(async () => {
    if (!listingId) return;
    setLoading(true);
    try {
      const [listingRes, reviewsRes] = await Promise.all([
        fetchListingById("services", listingId),
        fetchReviewsForListing(listingId),
      ]);
      if (listingRes.listing) setListing(listingRes.listing);
      setReviews(reviewsRes);
      setReviewTotal(reviewsRes.length);
    } catch {
      // silently fallback to static display
    } finally {
      setLoading(false);
    }
  }, [listingId]);

  useEffect(() => {
    loadListing();
  }, [loadListing]);

  const { refreshing, onRefresh: baseRefresh } = usePullToRefresh();
  const onRefresh = useCallback(() => {
    baseRefresh();
    loadListing();
  }, [baseRefresh, loadListing]);

  // ── Derived display values ────────────────────────────────────────────────
  const listingImages = (listing?.images ?? []).filter(
    (img) => typeof img === "string" && img.length > 0,
  );
  const coverImage = listingImages[0] ?? STATIC_COVER;
  const profileImage =
    ((listing as any)?.userId as { profileImage?: string; googleProfileImage?: string; avatar?: string } | undefined)
      ?.profileImage ??
    ((listing as any)?.userId as { googleProfileImage?: string } | undefined)?.googleProfileImage ??
    ((listing as any)?.userId as { avatar?: string } | undefined)?.avatar ??
    listingImages[0] ??
    STATIC_PROFILE;

  const professionalName =
    ((listing as any)?.userId as { name?: string } | undefined)?.name ??
    listing?.sellerName ??
    "Priya Sharma";

  const professionalBadge = listing
    ? ((listing as any).subcategory ?? listing.title ?? "Premium Interior Architect & Space Planner")
    : "Premium Interior Architect & Space Planner";

  const pricing = (listing as any)?.pricing;
  const basePrice = pricing?.basePrice ?? listing?.price;
  const currency = listing?.currency ?? "₹";
  const startingPrice =
    basePrice != null
      ? formatPrice(Number(basePrice), currency, listing?.countryCode ?? undefined)
      : "₹1,499";

  const locationText =
    (listing as any)?.location?.address ??
    (listing as any)?.location?.city ??
    "Location not specified";

  const experienceText = formatServiceExperienceLabel(listing ?? ({} as ListingItem));

  const aboutText =
    listing?.description ??
    "Transforming spaces into curated experiences. I specialize in contemporary Indian aesthetics blended with global minimalism. My focus is on sustainable materials and ergonomic efficiency for modern urban homes.";

  const sellerId = listing ? getListingSellerId(listing) : null;
  const isOwnService = isOwnListing(listing, user?.id);

  const averageRating = useMemo(() => {
    const statsRating = (listing as { stats?: { rating?: number } } | null)?.stats?.rating;
    if (typeof statsRating === "number" && statsRating > 0) return statsRating;
    if (reviews.length === 0) return null;
    const sum = reviews.reduce((acc, r) => acc + (r.rating ?? 0), 0);
    return sum / reviews.length;
  }, [listing, reviews]);

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
    setReviewTotal(fresh.length);
  }, [listingId]);

  const handleMessageSeller = useCallback(() => {
    if (!listing || !sellerId) return;
    if (!user) {
      router.push("/sign-in" as Href);
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
        name: professionalName,
        productId: listing._id,
        productType: "services",
        productTitle: listing.title ?? professionalBadge,
        productPrice: basePrice,
        productImage: listing.images?.[0] ?? null,
        currency,
      }),
    );
  }, [basePrice, currency, listing, professionalBadge, professionalName, router, sellerId, user]);

  const portfolioItems: PortfolioItem[] = listingImages.length
    ? buildPortfolioItems(listingImages)
    : staticPortfolioItems;

  const portfolioUris = portfolioItems.map((item) => item.image);

  const pricingPlans: PricePlan[] = listing ? buildPricingPlans(listing) : staticPricingPlans;

  const topBarHeight = useMemo(() => insets.top + 64, [insets.top]);
  const footerBottom = Math.max(insets.bottom, 12);

  return (
    <View className="flex-1 bg-[#F6F7F8]">
      <View
        className="absolute inset-x-0 top-0 z-50 bg-white/80 px-4"
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
          <View className="flex-row items-center gap-2">
            <Pressable
              className="p-2"
              onPress={() => router.back()}
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <MaterialIcons name="arrow-back" size={22} color="#161D1A" />
            </Pressable>
            <Text className="text-[20px] font-black tracking-tight text-[#27BB97]">
              Listify
            </Text>
          </View>

          <View className="flex-row items-center gap-2">
            <Pressable
              className="rounded-full p-2"
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <MaterialIcons name="share" size={22} color="#161D1A" />
            </Pressable>
            <Pressable
              className="rounded-full p-2"
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <MaterialIcons name="favorite-border" size={22} color="#161D1A" />
            </Pressable>
          </View>
        </View>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center" style={{ paddingTop: topBarHeight }}>
          <ActivityIndicator size="large" color="#27BB97" />
        </View>
      ) : (
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
            paddingBottom: isOwnService ? 24 + footerBottom : 120 + footerBottom,
          }}
        >
        <View className="relative">
          <View className="h-64 w-full overflow-hidden bg-[#E5E7EB]">
            <Image
              source={coverImage}
              contentFit="cover"
              transition={200}
              style={{ width: "100%", height: 256 }}
            />
          </View>

          {/* Avatar sits outside the overflow-hidden cover so it is not clipped */}
          <View
            className="absolute left-4 z-10"
            style={{ top: 256 - 48 }}
          >
            <View className="relative overflow-hidden rounded-xl border-4 border-white bg-[#F3F4F6]">
              <ProfileAvatarImage
                user={
                  typeof (listing as any)?.userId === "object"
                    ? (listing as any).userId
                    : { profileImage: profileImage }
                }
                fallbackName={professionalName}
                style={{ width: 96, height: 96 }}
                iconSize={40}
              />
              <View className="absolute -bottom-1 -right-1 rounded-full border-2 border-white bg-[#27BB97] p-1">
                <MaterialIcons name="verified" size={16} color="#FFFFFF" />
              </View>
            </View>
          </View>
        </View>

        <View className="mt-16 px-4">
          <View className="flex-row items-start justify-between gap-4">
            <View className="flex-1">
              <Text className="text-[24px] font-bold text-[#161D1A]">
                {professionalName}
              </Text>
              <Text className="text-[16px] text-[#6C7A74]">
                {professionalBadge}
              </Text>
            </View>

            <View className="flex-row items-center gap-1 rounded-lg bg-[#E9EFEB] px-2.5 py-1">
              <MaterialIcons name="star" size={18} color="#CBA100" />
              <Text className="text-[16px] font-bold text-[#161D1A]">
                {averageRating != null ? averageRating.toFixed(1) : "—"}
              </Text>
            </View>
          </View>

          <View className="mt-4 flex-row gap-4">
            <View className="flex-row items-center gap-1">
              <MaterialIcons name="location-on" size={16} color="#6C7A74" />
              <Text className="text-[12px] font-medium text-[#6C7A74]">
                {locationText}
              </Text>
            </View>

            {experienceText ? (
              <View className="flex-row items-center gap-1">
                <MaterialIcons name="work" size={16} color="#6C7A74" />
                <Text className="text-[12px] font-medium text-[#6C7A74]">
                  {experienceText}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        <View className="mt-6">
          <View className="mb-2 flex-row items-center justify-between px-4">
            <Text className="text-[20px] font-semibold text-[#161D1A]">
              Portfolio
            </Text>
            <Pressable onPress={() => setPortfolioModalVisible(true)}>
              <Text
                className="text-[12px] font-medium"
                style={{ color: ListifyColors.primary, fontFamily: ListifyFonts.medium }}
              >
                View all
              </Text>
            </Pressable>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
          >
            {portfolioItems.map((item) => (
              <Pressable key={item.id} onPress={() => setPortfolioModalVisible(true)}>
                <Image
                  source={item.image}
                  contentFit="cover"
                  transition={200}
                  style={{ width: 192, height: 128, borderRadius: 12 }}
                />
              </Pressable>
            ))}
          </ScrollView>
        </View>

        <View className="mt-6 px-4">
          <Text className="mb-2 text-[20px] font-semibold text-[#161D1A]">
            About me
          </Text>
          <Text className="text-[14px] leading-6 text-[#3C4A44]">
            {aboutText}
          </Text>
        </View>

        <View className="mt-6 px-4">
          <Text className="mb-2 text-[20px] font-semibold text-[#161D1A]">
            Pricing
          </Text>

          <View className="gap-2">
            {pricingPlans.map((plan) => (
              <View
                key={plan.id}
                className="relative flex-row items-center justify-between rounded-xl bg-white p-4"
                style={{
                  borderWidth: plan.popular ? 2 : 1,
                  borderColor: plan.popular ? "#27BB97" : "#BBCAC3",
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: plan.popular ? 0.08 : 0.04,
                  shadowRadius: 3,
                  elevation: plan.popular ? 2 : 1,
                }}
              >
                {plan.popular ? (
                  <View className="absolute right-0 top-0 rounded-bl-lg bg-[#27BB97] px-3 py-0.5">
                    <Text className="text-[10px] font-medium uppercase tracking-[1.4px] text-white">
                      Popular
                    </Text>
                  </View>
                ) : null}

                <View className="pr-3">
                  <Text className="text-[18px] font-semibold text-[#161D1A]">
                    {plan.title}
                  </Text>
                  <Text className="text-[12px] text-[#6C7A74]">
                    {plan.subtitle}
                  </Text>
                </View>

                <Text className="text-[20px] font-bold text-[#27BB97]">
                  {plan.price}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View className="mt-6 px-4">
          <View className="mb-2 flex-row items-center justify-between">
            <Text className="text-[20px] font-semibold text-[#161D1A]">
              Reviews{reviewTotal > 0 ? ` (${reviewTotal})` : ""}
            </Text>
            {!isOwnService ? (
              <Pressable onPress={handleOpenReview}>
                <Text
                  className="text-[12px] font-medium"
                  style={{ color: ListifyColors.primary, fontFamily: ListifyFonts.medium }}
                >
                  Write a Review
                </Text>
              </Pressable>
            ) : null}
          </View>

          {reviews.length === 0 ? (
            <View className="items-center rounded-2xl border border-[#F3F4F6] bg-white py-8">
              <MaterialIcons name="rate-review" size={40} color="#D1D5DB" />
              <Text
                className="mt-3 text-[14px] text-[#9CA3AF]"
                style={{ fontFamily: ListifyFonts.regular }}
              >
                No reviews yet. Be the first to review!
              </Text>
              {!isOwnService ? (
                <Pressable
                  onPress={handleOpenReview}
                  className="mt-4 rounded-xl px-5 py-3"
                  style={{ backgroundColor: ListifyColors.primary }}
                >
                  <Text
                    className="text-[14px] text-white"
                    style={{ fontFamily: ListifyFonts.semiBold }}
                  >
                    Write the first review
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : (
            <View className="gap-4">
              {reviews.map((item) => {
                const reviewerName = item.userId?.name ?? "Anonymous";
                return (
                  <View key={item._id} className="border-b border-slate-100 pb-4">
                    <View className="mb-2 flex-row items-center gap-3">
                      <View className="h-10 w-10 overflow-hidden rounded-full">
                        <ProfileAvatarImage
                          user={item.userId}
                          fallbackName={reviewerName}
                          style={{ width: 40, height: 40 }}
                          iconSize={20}
                        />
                      </View>

                      <View>
                        <Text className="text-[14px] font-semibold text-[#161D1A]">
                          {reviewerName}
                        </Text>
                        <View className="-ml-1 flex-row">
                          {Array.from({ length: 5 }).map((_, index) => (
                            <MaterialIcons
                              key={`${item._id}-star-${index}`}
                              name={index < item.rating ? "star" : "star-border"}
                              size={16}
                              color="#CBA100"
                            />
                          ))}
                        </View>
                      </View>

                      <Text className="ml-auto text-[12px] text-[#6C7A74]">
                        {relativeDate(item.createdAt)}
                      </Text>
                    </View>

                    {item.title ? (
                      <Text className="mb-1 text-[13px] font-semibold text-[#161D1A]">
                        {item.title}
                      </Text>
                    ) : null}

                    <Text className="text-[14px] leading-5 text-[#3C4A44]">
                      {item.comment}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>
      )}

      {!isOwnService ? (
      <View
        className="absolute inset-x-0 bottom-0 z-50 border-t border-slate-100 bg-white/90 px-4"
        style={{
          paddingTop: 16,
          paddingBottom: footerBottom,
        }}
      >
        <View className="flex-row items-center gap-4">
          <View className="flex-1">
            <Text className="text-[12px] text-[#6C7A74]">Starting from</Text>
            <Text className="text-[20px] font-bold text-[#161D1A]">
              {startingPrice}
            </Text>
          </View>

          <Pressable
            onPress={handleMessageSeller}
            className="flex-2 overflow-hidden rounded-lg"
            style={({ pressed }) => ({ opacity: pressed ? 0.92 : 1 })}
          >
            <LinearGradient
              colors={["#27BB97", "#1E9E7E"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              className="h-12 flex-row items-center justify-center gap-2"
            >
              <Text className="text-[18px] font-semibold text-white">Message</Text>
              <MaterialIcons name="chat" size={20} color="#FFFFFF" />
            </LinearGradient>
          </Pressable>
        </View>
      </View>
      ) : null}

      <PortfolioGalleryModal
        visible={portfolioModalVisible}
        title="Portfolio"
        images={portfolioUris}
        onClose={() => setPortfolioModalVisible(false)}
      />

      {listingId && sellerId ? (
        <ServiceReviewModal
          visible={reviewModalVisible}
          listingId={listingId}
          providerId={sellerId}
          providerName={professionalName}
          onClose={() => setReviewModalVisible(false)}
          onSubmitted={handleReviewSubmitted}
        />
      ) : null}
    </View>
  );
}

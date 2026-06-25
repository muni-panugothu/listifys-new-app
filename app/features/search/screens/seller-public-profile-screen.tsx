import { MaterialIcons } from "@expo/vector-icons";
import { type Href, useLocalSearchParams, useRouter } from "@/lib/safe-router";
import { useCallback, useEffect, useMemo, useState } from "react";
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

import { ListingItemsGridCard } from "@/components/listing-items-grid-card";
import { ProfileHeaderArt } from "@/components/profile-header-art";
import { ListifyFonts } from "@/constants/typography";
import {
  requestJson,
  resolveAbsoluteMediaUrl,
  fetchSellerReviews,
  deleteSellerReview,
} from "@/features/auth/services/auth-api";
import { SellerReviewModal } from "@/components/seller-review-modal";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import { Image } from "@/lib/nativewind-interop";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { showAuthGate } from "@/store/slices/auth-gate-slice";

type SellerProfile = {
  id: string;
  _id: string;
  name: string;
  email?: string;
  profileImageUrl: string | null;
  provider?: string;
  createdAt: string;
  isFollowedByCurrentUser: boolean;
  followersCount: number;
  followingCount: number;
  listingsCount: number;
  averageRating?: number;
  reviewsCount?: number;
};

type SellerListing = {
  _id: string;
  title: string;
  price?: number;
  currency?: string;
  countryCode?: string;
  images: string[];
  location?: string;
  condition?: string;
  category?: string;
  createdAt?: string;
  _listingType: string;
};

type ProfileTab = "listings" | "reviews";

const HEADER_ART_HEIGHT = 248;
const AVATAR_SIZE = 108;
const AVATAR_OVERLAP = AVATAR_SIZE / 2;
const BRAND_GREEN = "#27BB97";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const GRID_GUTTER = 14;
const GRID_SIDE_PADDING = 16;
const CARD_WIDTH = (SCREEN_WIDTH - GRID_SIDE_PADDING * 2 - GRID_GUTTER) / 2;

function formatReviewDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

async function fetchSellerProfile(sellerId: string): Promise<SellerProfile> {
  const res = await requestJson<{ seller: SellerProfile }>(
    `/api/auth/seller/${sellerId}`,
  );
  return res.seller;
}

async function fetchSellerListings(sellerId: string): Promise<SellerListing[]> {
  const res = await requestJson<{ listings: SellerListing[] }>(
    `/api/auth/seller/${sellerId}/listings`,
  );
  return (res.listings ?? []).map((listing) => ({
    ...listing,
    images: (listing.images ?? []).map(
      (img) => resolveAbsoluteMediaUrl(img) ?? img,
    ),
  }));
}

async function toggleFollowSeller(
  sellerId: string,
): Promise<{ isFollowing: boolean; followersCount: number }> {
  return requestJson(`/api/auth/follow/${sellerId}`, { method: "POST" });
}

function StatDivider() {
  return <View className="h-8 w-px bg-[#E5E7EB]" />;
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

type SellerReview = {
  id: string;
  reviewerId?: string;
  name: string;
  avatar: string;
  rating: number;
  date: string;
  review: string;
};

function SellerReviewCard({
  item,
  isOwn,
  onEdit,
  onDelete,
}: {
  item: SellerReview;
  isOwn?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <View className="border-b border-[#F0F0F0] pb-4">
      <View className="mb-2 flex-row items-center gap-3">
        <Image
          source={item.avatar || undefined}
          contentFit="cover"
          className="h-10 w-10 rounded-full bg-[#E5E7EB]"
        />
        <View className="flex-1">
          <Text
            className="text-[15px] text-[#1A1A1A]"
            style={{ fontFamily: ListifyFonts.semiBold }}
          >
            {item.name}
          </Text>
          <View className="mt-0.5 flex-row">
            {Array.from({ length: 5 }).map((_, index) => (
              <MaterialIcons
                key={`${item.id}-star-${index}`}
                name={index < item.rating ? "star" : "star-border"}
                size={15}
                color="#CBA100"
              />
            ))}
          </View>
        </View>
        {isOwn ? (
          <View>
            <Pressable
              onPress={() => setMenuOpen((v) => !v)}
              hitSlop={10}
              className="rounded-full p-1.5"
            >
              <MaterialIcons name="more-vert" size={22} color="#9CA3AF" />
            </Pressable>
            {menuOpen ? (
              <View
                className="absolute right-0 top-8 z-20 min-w-[130px] overflow-hidden rounded-xl border border-[#E5E7EB] bg-white"
                style={{
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.12,
                  shadowRadius: 8,
                  elevation: 6,
                }}
              >
                <Pressable
                  onPress={() => {
                    setMenuOpen(false);
                    onEdit?.();
                  }}
                  className="flex-row items-center gap-2 px-4 py-3"
                >
                  <MaterialIcons name="edit" size={18} color="#374151" />
                  <Text style={{ fontFamily: ListifyFonts.medium, fontSize: 14, color: "#374151" }}>
                    Edit
                  </Text>
                </Pressable>
                <View className="h-px bg-[#F0F0F0]" />
                <Pressable
                  onPress={() => {
                    setMenuOpen(false);
                    onDelete?.();
                  }}
                  className="flex-row items-center gap-2 px-4 py-3"
                >
                  <MaterialIcons name="delete-outline" size={18} color="#EF4444" />
                  <Text style={{ fontFamily: ListifyFonts.medium, fontSize: 14, color: "#EF4444" }}>
                    Delete
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        ) : (
          <Text
            className="text-[12px] text-[#9CA3AF]"
            style={{ fontFamily: ListifyFonts.regular }}
          >
            {item.date}
          </Text>
        )}
      </View>
      <Text
        className="text-[14px] leading-5 text-[#4B5563]"
        style={{ fontFamily: ListifyFonts.regular }}
      >
        {item.review}
      </Text>
    </View>
  );
}

export function SellerPublicProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const isAuthenticated = useAppSelector((s) => s.auth.isAuthenticated);
  const currentUserId = useAppSelector((s) => s.auth.user?.id);
  const params = useLocalSearchParams<{
    sellerId?: string;
    userId?: string;
    sellerName?: string;
    sellerRating?: string;
    sellerImage?: string;
  }>();

  const sellerId = params.sellerId ?? params.userId ?? "";
  const paramSellerName = params.sellerName?.trim() ?? "";
  const [seller, setSeller] = useState<SellerProfile | null>(null);
  const [listings, setListings] = useState<SellerListing[]>([]);
  const [reviews, setReviews] = useState<SellerReview[]>([]);
  const [loading, setLoading] = useState(Boolean(sellerId));
  const [listingsLoading, setListingsLoading] = useState(Boolean(sellerId));
  const [activeTab, setActiveTab] = useState<ProfileTab>("listings");
  const [following, setFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const [averageRating, setAverageRating] = useState(0);
  const [reviewModalVisible, setReviewModalVisible] = useState(false);
  const [reviewModalMode, setReviewModalMode] = useState<"create" | "edit">("create");
  const [editReviewData, setEditReviewData] = useState<SellerReview | null>(null);

  const isOwnProfile = Boolean(currentUserId && sellerId && currentUserId === sellerId);

  const loadData = useCallback(async () => {
    if (!sellerId) {
      setSeller(null);
      setListings([]);
      setReviews([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const timeout = setTimeout(() => setLoading(false), 8000);

    try {
      // Fetch profile first — listings failure must not block the profile view
      const profileRes = await fetchSellerProfile(sellerId);
      setSeller(profileRes);
      setFollowing(profileRes.isFollowedByCurrentUser);
      setFollowersCount(profileRes.followersCount);
      setAverageRating(profileRes.averageRating ?? 0);

      fetchSellerReviews(sellerId)
        .then((reviewRes) => {
          setAverageRating(reviewRes.averageRating);
          setReviews(
            (reviewRes.reviews ?? []).map((item) => ({
              id: item.id,
              reviewerId: item.reviewer.id ? String(item.reviewer.id) : undefined,
              name: item.reviewer.name,
              avatar: item.reviewer.profileImageUrl ?? "",
              rating: item.rating,
              date: formatReviewDate(item.createdAt),
              review: item.comment,
            })),
          );
        })
        .catch(() => setReviews([]));

      // Listings load independently so a failure here doesn't hide the profile
      setListingsLoading(true);
      fetchSellerListings(sellerId)
        .then(setListings)
        .catch(() => setListings([]))
        .finally(() => setListingsLoading(false));
    } catch {
      setSeller(null);
      setListings([]);
      setReviews([]);
      setListingsLoading(false);
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  }, [sellerId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleRefresh = useCallback(async () => {
    await loadData();
  }, [loadData]);

  const { refreshing, onRefresh } = usePullToRefresh(handleRefresh);

  const displayName = seller?.name ?? paramSellerName ?? "Seller";
  const memberSince = seller?.createdAt
    ? `Member since ${new Date(seller.createdAt).getFullYear()}`
    : "Verified seller on Listifys";

  const avatarUri = useMemo(() => {
    if (seller?.profileImageUrl) {
      return resolveAbsoluteMediaUrl(seller.profileImageUrl) ?? seller.profileImageUrl;
    }
    if (params.sellerImage?.startsWith("http")) return params.sellerImage;
    return null;
  }, [params.sellerImage, seller?.profileImageUrl]);

  const sellerRating = useMemo(() => {
    if (averageRating > 0) return averageRating;
    const fromParam = Number.parseFloat(params.sellerRating ?? "");
    if (!Number.isNaN(fromParam) && fromParam > 0) return fromParam;
    return seller?.averageRating ?? 0;
  }, [averageRating, params.sellerRating, seller?.averageRating]);

  const ratingsCount = seller?.reviewsCount ?? reviews.length;

  const stats = useMemo(
    () => [
      { value: String(seller?.listingsCount ?? listings.length), label: "Listings" },
      { value: String(followersCount), label: "Followers" },
      { value: String(seller?.followingCount ?? 0), label: "Following" },
    ],
    [followersCount, listings.length, seller?.followingCount, seller?.listingsCount],
  );

  const requireAuth = useCallback(
    (action: () => void) => {
      if (isAuthenticated) {
        action();
        return;
      }
      dispatch(
        showAuthGate({
          action: "profile",
          redirectTo: `/seller-public-profile?sellerId=${sellerId}&sellerName=${encodeURIComponent(displayName)}`,
        }),
      );
    },
    [dispatch, displayName, isAuthenticated, sellerId],
  );

  const handleOpenReview = useCallback(() => {
    requireAuth(() => {
      setReviewModalMode("create");
      setEditReviewData(null);
      setReviewModalVisible(true);
    });
  }, [requireAuth]);

  const handleEditReview = useCallback((review: SellerReview) => {
    setReviewModalMode("edit");
    setEditReviewData(review);
    setReviewModalVisible(true);
  }, []);

  const handleDeleteReview = useCallback(async () => {
    if (!sellerId) return;
    try {
      const res = await deleteSellerReview(sellerId);
      setAverageRating(res.averageRating ?? 0);
      await loadData();
      showSuccessToast("Review deleted", "Your review has been removed.");
    } catch (e) {
      showErrorToast("Could not delete", e instanceof Error ? e.message : "Please try again.");
    }
  }, [loadData, sellerId]);

  const handleReviewSubmitted = useCallback(
    (nextAverage: number, _nextCount: number) => {
      setAverageRating(nextAverage);
      void loadData();
    },
    [loadData],
  );

  const handleToggleFollow = useCallback(() => {
    requireAuth(async () => {
      if (!sellerId || followLoading) return;
      setFollowLoading(true);
      try {
        const res = await toggleFollowSeller(sellerId);
        setFollowing(res.isFollowing);
        setFollowersCount(res.followersCount);
      } catch {
        // keep state
      } finally {
        setFollowLoading(false);
      }
    });
  }, [followLoading, requireAuth, sellerId]);

  const handleMessage = useCallback(() => {
    if (!sellerId) return;
    requireAuth(() => {
      router.push({
        pathname: "/chat-conversation",
        params: {
          recipientId: sellerId,
          name: displayName,
          ...(seller?.profileImageUrl ? { contactImage: seller.profileImageUrl } : {}),
        },
      } as Href);
    });
  }, [displayName, requireAuth, router, seller?.profileImageUrl, sellerId]);

  const navigateToListing = useCallback(
    (item: SellerListing) => {
      const cat = item._listingType ?? item.category ?? "electronics";
      router.push(
        `/listing-detail-template?category=${cat}&id=${item._id}` as Href,
      );
    },
    [router],
  );

  const listingRows = useMemo(() => {
    const rows: SellerListing[][] = [];
    for (let i = 0; i < listings.length; i += 2) {
      rows.push(listings.slice(i, i + 2));
    }
    return rows;
  }, [listings]);

  return (
    <View className="flex-1 bg-[#F6F7F8]">
      <View
        className="absolute inset-x-0 top-0 z-30 flex-row items-center justify-between px-5"
        style={{ paddingTop: insets.top + 8 }}
        pointerEvents="box-none"
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          className="h-10 w-10 items-center justify-center rounded-full bg-white/90"
          style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
        >
          <MaterialIcons name="arrow-back-ios" size={18} color="#1A1A1A" style={{marginLeft: 6}}/>
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[BRAND_GREEN]}
            tintColor={BRAND_GREEN}
          />
        }
        contentContainerStyle={{
          flexGrow: 1,
          paddingBottom: Math.max(insets.bottom, 24) + 24,
        }}
      >
        <View style={{ height: HEADER_ART_HEIGHT }}>
          <ProfileHeaderArt height={HEADER_ART_HEIGHT} />
        </View>

        {loading ? (
          <View className="items-center py-16">
            <ActivityIndicator size="large" color={BRAND_GREEN} />
            <Text
              className="mt-3 text-[14px] text-[#9CA3AF]"
              style={{ fontFamily: ListifyFonts.regular }}
            >
              Loading seller profile...
            </Text>
          </View>
        ) : !seller ? (
          <View className="items-center px-6 py-16">
            <MaterialIcons name="person-off" size={48} color="#D1D5DB" />
            <Text
              className="mt-3 text-center text-[14px] text-[#9CA3AF]"
              style={{ fontFamily: ListifyFonts.regular }}
            >
              Could not load this seller profile.
            </Text>
          </View>
        ) : (
          <>
            <View
              className="z-10 w-full bg-white px-5 pb-2"
              style={{ marginTop: -AVATAR_OVERLAP, alignSelf: "stretch" }}
            >
              <View
                className="self-start"
                style={{ marginTop: -AVATAR_OVERLAP, marginBottom: 12 }}
              >
                <View
                  className="overflow-hidden rounded-full border-[4px] border-white bg-white"
                  style={{
                    width: AVATAR_SIZE,
                    height: AVATAR_SIZE,
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.14,
                    shadowRadius: 10,
                    elevation: 8,
                  }}
                >
                  {avatarUri ? (
                    <Image
                      source={avatarUri}
                      contentFit="cover"
                      className="h-full w-full"
                    />
                  ) : (
                    <View className="h-full w-full items-center justify-center bg-[#E5E7EB]">
                      <MaterialIcons name="person" size={48} color="#9CA3AF" />
                    </View>
                  )}
                </View>
              </View>

              <View
                className="mb-2 self-start rounded-md px-2.5 py-1"
                style={{ backgroundColor: BRAND_GREEN }}
              >
                <Text
                  className="text-[11px] tracking-wide text-white"
                  style={{ fontFamily: ListifyFonts.bold }}
                >
                  SELLER
                </Text>
              </View>

              <Text
                className="text-[26px] leading-8 text-[#1A1A1A]"
                style={{ fontFamily: ListifyFonts.bold }}
              >
                {displayName}
              </Text>

              {seller?.email ? (
                <View className="mt-1 flex-row items-center gap-1.5">
                  <MaterialIcons name="mail-outline" size={14} color="#9CA3AF" />
                  <Text
                    className="text-[13px] text-[#9CA3AF]"
                    style={{ fontFamily: ListifyFonts.regular }}
                  >
                    {seller.email}
                  </Text>
                </View>
              ) : null}

              <View className="mt-1.5 self-start">
                <SellerStars rating={sellerRating} />
                <Text
                  className="mt-0.5 text-[13px] text-[#9CA3AF]"
                  style={{ fontFamily: ListifyFonts.regular }}
                >
                  {ratingsCount}{" "}
                  {ratingsCount === 1 ? "member rated" : "members rated"}
                </Text>
              </View>

              <Text
                className="mt-1 text-[15px] text-[#9CA3AF]"
                style={{ fontFamily: ListifyFonts.regular }}
              >
                {memberSince}
              </Text>

              <View
                className="mt-4 flex-row items-center"
                style={{ width: "100%", gap: 10 }}
              >
                {!isOwnProfile ? (
                  <Pressable
                    onPress={handleToggleFollow}
                    disabled={followLoading}
                    style={({ pressed }) => ({
                      flex: 1,
                      height: 48,
                      borderRadius: 14,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: following ? "#E8F8F4" : BRAND_GREEN,
                      borderWidth: following ? 2 : 0,
                      borderColor: BRAND_GREEN,
                      opacity: pressed || followLoading ? 0.85 : 1,
                    })}
                  >
                    {followLoading ? (
                      <ActivityIndicator
                        size="small"
                        color={following ? BRAND_GREEN : "#FFFFFF"}
                      />
                    ) : (
                      <Text
                        style={{
                          fontFamily: ListifyFonts.semiBold,
                          fontSize: 16,
                          color: following ? BRAND_GREEN : "#FFFFFF",
                        }}
                      >
                        {following ? "Following" : "Follow"}
                      </Text>
                    )}
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={() => router.push("/profile-details-edit" as Href)}
                    style={({ pressed }) => ({
                      flex: 1,
                      height: 48,
                      borderRadius: 14,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: BRAND_GREEN,
                      opacity: pressed ? 0.88 : 1,
                    })}
                  >
                    <Text
                      style={{
                        fontFamily: ListifyFonts.semiBold,
                        fontSize: 16,
                        color: "#FFFFFF",
                      }}
                    >
                      Edit profile
                    </Text>
                  </Pressable>
                )}

                {!isOwnProfile ? (
                  <Pressable
                    onPress={handleOpenReview}
                    style={({ pressed }) => ({
                      flex: 1,
                      height: 48,
                      borderRadius: 14,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: "#FFFFFF",
                      borderWidth: 1,
                      borderColor: "#E5E7EB",
                      opacity: pressed ? 0.88 : 1,
                    })}
                  >
                    <Text
                      style={{
                        fontFamily: ListifyFonts.semiBold,
                        fontSize: 16,
                        color: "#1A1A1A",
                      }}
                    >
                      Write Review
                    </Text>
                  </Pressable>
                ) : null}

                {/* <Pressable
                  onPress={handleMessage}
                  style={({ pressed }) => ({
                    flex: 1,
                    height: 48,
                    borderRadius: 14,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "#FFFFFF",
                    borderWidth: 1,
                    borderColor: "#E5E7EB",
                    opacity: pressed ? 0.88 : 1,
                  })}
                >
                  <Text
                    style={{
                      fontFamily: ListifyFonts.semiBold,
                      fontSize: 16,
                      color: "#1A1A1A",
                    }}
                  >
                    Message
                  </Text>
                </Pressable> */}
              </View>

              <View className="mt-5 flex-row items-center self-start">
                {stats.map((stat, index) => (
                  <View key={stat.label} className="flex-row items-center">
                    {index > 0 ? <StatDivider /> : null}
                    <View
                      style={{
                        alignItems: "flex-start",
                        paddingRight: 20,
                        paddingLeft: index === 0 ? 0 : 20,
                      }}
                    >
                      <Text
                        className="text-[18px] text-[#1A1A1A]"
                        style={{ fontFamily: ListifyFonts.bold }}
                      >
                        {stat.value}
                      </Text>
                      <Text
                        className="mt-0.5 text-[12px] text-[#9CA3AF]"
                        style={{ fontFamily: ListifyFonts.regular }}
                      >
                        {stat.label}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>

            </View>

            <View className="mt-4 border-b border-[#F0F0F0] px-5">
              <View className="flex-row">
                {(["listings", "reviews"] as const).map((tab) => {
                  const active = activeTab === tab;
                  return (
                    <Pressable
                      key={tab}
                      onPress={() => setActiveTab(tab)}
                      className="mr-6 pb-3"
                      style={{
                        borderBottomWidth: 2,
                        borderBottomColor: active ? BRAND_GREEN : "transparent",
                      }}
                    >
                      <Text
                        className="text-[15px] capitalize"
                        style={{
                          fontFamily: active ? ListifyFonts.semiBold : ListifyFonts.medium,
                          color: active ? BRAND_GREEN : "#9CA3AF",
                        }}
                      >
                        {tab}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View className="px-4 pt-4" style={{ paddingHorizontal: GRID_SIDE_PADDING }}>
              {activeTab === "listings" ? (
                listings.length === 0 ? (
                  listingsLoading ? (
                    <View className="items-center py-16">
                      <ActivityIndicator size="large" color={BRAND_GREEN} />
                    </View>
                  ) : (
                  <View className="items-center py-16">
                    <MaterialIcons name="inventory-2" size={48} color="#D1D5DB" />
                    <Text
                      className="mt-2 text-[14px] text-[#9CA3AF]"
                      style={{ fontFamily: ListifyFonts.regular }}
                    >
                      No active listings yet.
                    </Text>
                  </View>
                  )
                ) : (
                  <View style={{ gap: GRID_GUTTER }}>
                    {listingRows.map((row) => (
                      <View
                        key={row.map((item) => item._id).join("-")}
                        className="flex-row"
                        style={{ gap: GRID_GUTTER }}
                      >
                        {row.map((item) => (
                          <ListingItemsGridCard
                            key={item._id}
                            title={item.title}
                            subtitle={item.condition}
                            price={item.price ?? null}
                            currency={item.currency}
                            isoCountryCode={item.countryCode}
                            image={item.images?.[0]}
                            createdAt={item.createdAt}
                            width={CARD_WIDTH}
                            onPress={() => navigateToListing(item)}
                          />
                        ))}
                        {row.length === 1 ? <View style={{ width: CARD_WIDTH }} /> : null}
                      </View>
                    ))}
                  </View>
                )
              ) : reviews.length === 0 ? (
                <View className="items-center py-16">
                  <MaterialIcons name="rate-review" size={48} color="#D1D5DB" />
                  <Text
                    className="mt-2 text-[14px] text-[#9CA3AF]"
                    style={{ fontFamily: ListifyFonts.regular }}
                  >
                    No reviews yet.
                  </Text>
                  {!isOwnProfile ? (
                    <Pressable
                      onPress={handleOpenReview}
                      className="mt-4 rounded-xl px-5 py-3"
                      style={{ backgroundColor: BRAND_GREEN }}
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
                  {reviews.map((item) => (
                    <SellerReviewCard
                      key={item.id}
                      item={item}
                      isOwn={Boolean(
                        currentUserId &&
                          item.reviewerId &&
                          String(item.reviewerId) === String(currentUserId),
                      )}
                      onEdit={() => handleEditReview(item)}
                      onDelete={() => void handleDeleteReview()}
                    />
                  ))}
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>

      <SellerReviewModal
        visible={reviewModalVisible}
        sellerId={sellerId}
        sellerName={displayName}
        mode={reviewModalMode}
        initialRating={editReviewData?.rating ?? 0}
        initialComment={editReviewData?.review ?? ""}
        onClose={() => {
          setReviewModalVisible(false);
          setEditReviewData(null);
        }}
        onSubmitted={handleReviewSubmitted}
      />
    </View>
  );
}

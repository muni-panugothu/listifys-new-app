import { MaterialIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { type Href, useLocalSearchParams, useRouter } from "@/lib/safe-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
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

export function JobDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string; category?: string }>();
  const user = useAppSelector((s) => s.auth.user);
  const locationLabel = useAppSelector(selectLocationLabel);
  const isoCountryCode = useAppSelector(selectIsoCountryCode);

  const categorySlug = (params.category ?? "jobs") as CategorySlug;
  const listingId = params.id;

  const {
    listing: swrListing,
    isLoading: swrLoading,
    refresh: refreshListing,
  } = useSwrListing(categorySlug, listingId);
  const [listing, setListing] = useState<ListingItem | null>(swrListing ?? null);
  const loading = !listing && swrLoading;
  const [isSaved, setIsSaved] = useState(false);

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
  const pendingActionRef = useRef<(() => void) | null>(null);

  const requireAuth = useCallback((action: "save" | "message", callback: () => void) => {
    if (!user) {
      pendingActionRef.current = callback;
      setAuthGateAction(action);
      setAuthGateVisible(true);
      return;
    }
    callback();
  }, [user]);

  const handleAuthSuccess = useCallback(() => {
    const pending = pendingActionRef.current;
    pendingActionRef.current = null;
    pending?.();
  }, []);

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
  const companyName = (listing as any)?.companyName ?? listing?.sellerName ?? "";
  const companyLogo = (listing as any)?.companyLogo ?? null;
  const jobType = (listing as any)?.jobType ?? "";
  const workMode = (listing as any)?.workMode ?? "";
  const experience = (listing as any)?.experience ?? "";
  const education = (listing as any)?.education ?? "";
  const skills: string[] = (listing as any)?.skills ?? [];
  const benefits: string[] = (listing as any)?.benefits ?? [];
  const requirements = (listing as any)?.requirements ?? "";
  const responsibilities = (listing as any)?.responsibilities ?? "";
  const aboutCompany = (listing as any)?.aboutCompany ?? "";
  const industry = (listing as any)?.industry ?? "";
  const department = (listing as any)?.department ?? "";
  const positions = (listing as any)?.positions ?? 1;
  const applyLink = (listing as any)?.applyLink ?? "";
  const salary = (listing as any)?.salary;
  const salaryType = (listing as any)?.salaryType ?? salary?.type ?? "monthly";
  const currency = listing?.currency ?? "?";
  const images = listing?.images?.length ? listing.images : [];

  const sellerName = listing?.seller?.name ?? listing?.sellerName ?? "Poster";
  const sellerProfileImage = listing?.seller?.profileImage
    ? listing.seller.profileImage.startsWith("http")
      ? listing.seller.profileImage
      : `${AUTH_API_BASE_URL}${listing.seller.profileImage}`
    : null;
  const sellerId = listing ? getListingSellerId(listing) : null;
  const sellerJoined = listing?.seller?.createdAt
    ? `Member since ${new Date(listing.seller.createdAt).getFullYear()}`
    : "";

  const formatSalary = () => {
    if (salary?.min && salary?.max) {
      const fmt = (n: number) => {
        if (n >= 100000) return `${(n / 100000).toFixed(n % 100000 === 0 ? 0 : 1)}L`;
        if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
        return n.toLocaleString("en-IN");
      };
      return `${currency}${fmt(salary.min)} - ${currency}${fmt(salary.max)}`;
    }
    return "";
  };

  const topBarHeight = insets.top + 56;
  const footerBottomPadding = Math.max(insets.bottom, 16);
  const isOwn = isOwnListing(listing, user?.id);

  // Screen-first: render shell immediately; SWR fills in the cached or fresh data.

  if (!listing) {
    return (
      <View className="flex-1 items-center justify-center bg-[#F6F7F8]">
        <MaterialIcons name="error-outline" size={48} color="#CBD5E1" />
        <Text className="mt-2 text-[14px] text-[#6C7A74]">Job not found</Text>
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
        <View className="flex-row items-center gap-3">
          <Pressable onPress={() => router.back()} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
            <MaterialIcons name="arrow-back" size={24} color="#0f172a" />
          </Pressable>
          <Text className="text-[20px] font-black tracking-tight text-[#27BB97]">Listify</Text>
        </View>
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
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#27BB97"]} tintColor="#27BB97" progressViewOffset={topBarHeight} />
        }
        contentContainerStyle={{ paddingTop: topBarHeight, paddingBottom: isOwn ? 24 + footerBottomPadding : 100 + footerBottomPadding }}
      >
        {/* Hero */}
        {images.length > 0 ? (
          <View className="relative h-48 w-full">
            <Image source={images[0]} contentFit="cover" transition={200} className="h-full w-full" />
            <View className="absolute inset-0 bg-black/20" />
          </View>
        ) : (
          <View className="h-48 w-full items-center justify-center bg-[#E3EAE5]">
            <MaterialIcons name="work" size={48} color="#CBD5E1" />
          </View>
        )}

        {/* Company Logo overlay */}
        {companyLogo ? (
          <View className="absolute left-4" style={{ top: topBarHeight + 144 }}>
            <View
              className="rounded-xl bg-white p-1"
              style={{ shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 4 }}
            >
              <View className="h-20 w-20 overflow-hidden rounded-lg bg-[#e9efeb]">
                <Image source={companyLogo} contentFit="cover" transition={200} className="h-full w-full" />
              </View>
            </View>
          </View>
        ) : null}

        <View style={{ marginTop: companyLogo ? 48 : 16 }} className="px-4 gap-6">
          {/* Title & Company */}
          <View className="gap-2">
            <Text className="text-[24px] font-bold leading-8 tracking-tight text-[#161D1A]">{title}</Text>
            {companyName ? (
              <View className="flex-row items-center gap-2">
                <Text className="text-[16px] font-medium leading-6 text-[#006b55]">{companyName}</Text>
              </View>
            ) : null}
          </View>

          {/* Meta Badges */}
          <View className="flex-row flex-wrap gap-2">
            {jobType ? (
              <View className="flex-row items-center gap-1 rounded-full bg-[#27BB97]/10 px-3 py-1">
                <MaterialIcons name="work" size={14} color="#27BB97" />
                <Text className="text-[12px] font-medium tracking-wide text-[#27BB97]">{jobType}</Text>
              </View>
            ) : null}
            {workMode ? (
              <View className="flex-row items-center gap-1 rounded-full bg-[#5ba2ff]/10 px-3 py-1">
                <MaterialIcons name="wifi" size={14} color="#5ba2ff" />
                <Text className="text-[12px] font-medium tracking-wide text-[#5ba2ff]">{workMode}</Text>
              </View>
            ) : null}
            {locationText ? (
              <View className="flex-row items-center gap-1 rounded-full bg-[#e3eae5] px-3 py-1">
                <MaterialIcons name="location-on" size={14} color="#3c4a44" />
                <Text className="text-[12px] font-medium tracking-wide text-[#3c4a44]">{locationText}</Text>
              </View>
            ) : null}
            {listing.subcategory ? (
              <View className="flex-row items-center gap-1 rounded-full bg-[#f0e6ff] px-3 py-1">
                <MaterialIcons name="category" size={14} color="#7C3AED" />
                <Text className="text-[12px] font-medium tracking-wide text-[#7C3AED]">{listing.subcategory}</Text>
              </View>
            ) : null}
          </View>

          {/* Salary Card */}
          {formatSalary() ? (
            <View
              className="flex-row items-center justify-between rounded-xl border border-slate-100 bg-white p-4"
              style={{ shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 }}
            >
              <View>
                <Text className="mb-1 text-[12px] font-medium tracking-wide text-slate-500">Salary</Text>
                <View className="flex-row items-baseline">
                  <Text className="text-[20px] font-bold leading-6 text-[#161D1A]">{formatSalary()}</Text>
                  <Text className="ml-1 text-[14px] leading-5 text-slate-400">/ {salaryType}</Text>
                </View>
              </View>
              <View className="h-10 w-10 items-center justify-center rounded-full bg-[#006b55]/10">
                <MaterialIcons name="payments" size={22} color="#006b55" />
              </View>
            </View>
          ) : null}

          {/* Details */}
          <View className="gap-2">
            <Text className="text-[18px] font-semibold text-[#161D1A]">Details</Text>
            {experience ? (
              <View className="flex-row justify-between py-1">
                <Text className="text-[13px] text-[#6C7A74]">Experience</Text>
                <Text className="text-[13px] font-medium text-[#161D1A]">{experience}</Text>
              </View>
            ) : null}
            {education ? (
              <View className="flex-row justify-between py-1">
                <Text className="text-[13px] text-[#6C7A74]">Education</Text>
                <Text className="text-[13px] font-medium text-[#161D1A]">{education}</Text>
              </View>
            ) : null}
            {industry ? (
              <View className="flex-row justify-between py-1">
                <Text className="text-[13px] text-[#6C7A74]">Industry</Text>
                <Text className="text-[13px] font-medium text-[#161D1A]">{industry}</Text>
              </View>
            ) : null}
            {department ? (
              <View className="flex-row justify-between py-1">
                <Text className="text-[13px] text-[#6C7A74]">Department</Text>
                <Text className="text-[13px] font-medium text-[#161D1A]">{department}</Text>
              </View>
            ) : null}
            {positions > 1 ? (
              <View className="flex-row justify-between py-1">
                <Text className="text-[13px] text-[#6C7A74]">Open Positions</Text>
                <Text className="text-[13px] font-medium text-[#161D1A]">{positions}</Text>
              </View>
            ) : null}
          </View>

          {/* Description */}
          {description ? (
            <View className="gap-3">
              <Text className="text-[20px] font-semibold leading-7 text-[#161D1A]">Job Description</Text>
              <Text className="text-[14px] leading-6 text-[#3c4a44]">{description}</Text>
            </View>
          ) : null}

          {/* Requirements */}
          {requirements ? (
            <View className="gap-3">
              <Text className="text-[20px] font-semibold leading-7 text-[#161D1A]">Requirements</Text>
              <Text className="text-[14px] leading-6 text-[#3c4a44]">{requirements}</Text>
            </View>
          ) : null}

          {/* Responsibilities */}
          {responsibilities ? (
            <View className="gap-3">
              <Text className="text-[20px] font-semibold leading-7 text-[#161D1A]">Responsibilities</Text>
              <Text className="text-[14px] leading-6 text-[#3c4a44]">{responsibilities}</Text>
            </View>
          ) : null}

          {/* Skills */}
          {skills.length > 0 ? (
            <View className="gap-3">
              <Text className="text-[18px] font-semibold text-[#161D1A]">Skills Required</Text>
              <View className="flex-row flex-wrap gap-2">
                {skills.map((skill) => (
                  <View key={skill} className="rounded-full bg-[#27BB97]/10 px-3 py-1.5">
                    <Text className="text-[12px] font-medium text-[#27BB97]">{skill}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {/* Benefits */}
          {benefits.length > 0 ? (
            <View className="gap-3">
              <Text className="text-[18px] font-semibold text-[#161D1A]">Benefits</Text>
              <View className="gap-2">
                {benefits.map((b, i) => (
                  <View key={i} className="flex-row gap-3">
                    <MaterialIcons name="check-circle" size={20} color="#006b55" style={{ marginTop: 2 }} />
                    <Text className="flex-1 text-[14px] leading-5 text-[#3c4a44]">{b}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {/* About Company */}
          {aboutCompany ? (
            <View className="gap-4 rounded-2xl bg-[#F3F4F6] p-6">
              <View className="flex-row items-center gap-4">
                {companyLogo ? (
                  <View className="h-12 w-12 items-center justify-center overflow-hidden rounded-lg bg-white p-2" style={{ shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 }}>
                    <Image source={companyLogo} contentFit="contain" transition={200} className="h-full w-full" />
                  </View>
                ) : null}
                <View>
                  <Text className="text-[18px] font-semibold leading-6 text-[#161D1A]">About {companyName || "Company"}</Text>
                  {industry ? <Text className="text-[12px] font-medium tracking-wide text-slate-500">{industry}</Text> : null}
                </View>
              </View>
              <Text className="text-[14px] leading-5 text-[#3c4a44]">{aboutCompany}</Text>
            </View>
          ) : null}

          {/* Seller / Poster card */}
          <View className="py-1">
            <Text className="mb-4 text-[18px] font-semibold text-[#161D1A]">Posted By</Text>
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
                      {sellerName.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
              </View>
              <View className="flex-1">
                <View className="flex-row items-center gap-1">
                  <Text className="text-[16px] font-semibold text-[#161D1A]">{sellerName}</Text>
                  <MaterialIcons name="verified" size={16} color="#005FB0" />
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

      {/* FOOTER — hidden on own listings */}
      {!isOwn ? (
      <View
        className="absolute inset-x-0 bottom-0 z-50 border-t border-[#BBCAC3]/20 bg-white/95 px-4"
        style={{
          paddingBottom: footerBottomPadding,
          paddingTop: 12,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.05,
          shadowRadius: 8,
          elevation: 8,
        }}
      >
        <View className="flex-row gap-3">
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
            className="h-12 flex-1 flex-row items-center justify-center gap-2 rounded-xl border-2 border-[#BBCAC3]/50 bg-white px-4"
          >
            <MaterialIcons name="chat" size={20} color="#161D1A" />
            <Text className="text-[16px] font-semibold text-[#161D1A]">Message</Text>
          </Pressable>

          <Pressable
            onPress={() => {
              if (applyLink) Linking.openURL(applyLink).catch(() => {});
              else if (sellerId) {
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
              }
            }}
            className="flex-1 overflow-hidden rounded-xl"
            style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.98 : 1 }], shadowColor: "#27BB97", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 6 })}
          >
            <LinearGradient
              colors={["#27BB97", "#1E9E7E"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ height: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12 }}
            >
              <Text className="text-[16px] font-bold text-white">Apply Now</Text>
              <MaterialIcons name="arrow-forward" size={20} color="#FFFFFF" />
            </LinearGradient>
          </Pressable>
        </View>
      </View>
      ) : null}

      {/* Auth Gate for guest users */}
      <AuthGateBottomSheet
        visible={authGateVisible}
        onClose={() => setAuthGateVisible(false)}
        action={authGateAction}
        onAuthenticated={handleAuthSuccess}
      />
    </View>
  );
}

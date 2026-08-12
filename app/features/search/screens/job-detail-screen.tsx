import { MaterialIcons } from "@expo/vector-icons";
import { type Href, useLocalSearchParams, useRouter } from "@/lib/safe-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  LayoutAnimation,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  Text,
  UIManager,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { CategorySlug } from "@/constants/categories";
import { ListifyFonts } from "@/constants/typography";
import { AuthGateBottomSheet } from "@/features/auth/components/auth-gate-bottom-sheet";
import { ListingSellerContactCard } from "@/components/listing-seller-contact-card";
import { JobsApplyFooter } from "@/features/jobs/components/jobs-apply-footer";
import { CompanyLogo } from "@/features/jobs/components/company-logo";
import {
  JOBS_BLUE,
  JOBS_PAGE_BG,
} from "@/features/jobs/data/jobs-discovery";
import {
  formatJobSalary,
  getCompanyDisplayName,
  getCompanyLocation,
  getJobWorkingHours,
  isJobApplied,
  type JobListingExtras,
} from "@/features/jobs/utils/jobs-formatters";
import {
  addToRecentlyViewed,
  recordJobApply,
  toggleSaveListing,
  type ListingItem,
} from "@/features/listing/services/listing-api";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { buildListingChatHref } from "@/lib/listing-chat";
import {
  getListingContactSectionTitle,
  getListingModelForCategory,
  openListingPhoneDialer,
  resolveListingContactPhone,
} from "@/lib/listing-contact-phone";
import { getListingSellerId, isOwnListing } from "@/lib/is-own-listing";
import { showErrorToast } from "@/lib/toast";
import { useSwrListing } from "@/lib/use-swr-listing";
import { useTheme } from "@/providers/theme-provider";
import { useAppSelector } from "@/store/hooks";
import { selectIsoCountryCode, selectLocationLabel } from "@/store/slices/location-slice";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type DetailTab = "description" | "company";

function HeaderIconButton({
  onPress,
  children,
  isDark,
  colors,
}: {
  onPress: () => void;
  children: React.ReactNode;
  isDark: boolean;
  colors: { border: string; surfaceElevated: string };
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        width: 40,
        height: 40,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: isDark ? colors.border : "#EEF2F7",
        backgroundColor: isDark ? colors.surfaceElevated : "#FFFFFF",
        alignItems: "center",
        justifyContent: "center",
        opacity: pressed ? 0.85 : 1,
        transform: [{ scale: pressed ? 0.96 : 1 }],
        shadowColor: "#64748B",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 6,
        elevation: 2,
      })}
    >
      {children}
    </Pressable>
  );
}

function InfoColumn({
  icon,
  iconColor,
  value,
  label,
  textPrimary,
  textSecondary,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  iconColor: string;
  value: string;
  label: string;
  textPrimary: string;
  textSecondary: string;
}) {
  return (
    <View style={{ flex: 1, alignItems: "center", paddingHorizontal: 6 }}>
      <MaterialIcons name={icon} size={22} color={iconColor} />
      <Text
        numberOfLines={2}
        style={{
          marginTop: 8,
          fontFamily: ListifyFonts.bold,
          fontSize: 13,
          color: textPrimary,
          textAlign: "center",
        }}
      >
        {value}
      </Text>
      <Text
        style={{
          marginTop: 4,
          fontFamily: ListifyFonts.regular,
          fontSize: 11,
          color: textSecondary,
          textAlign: "center",
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function DetailMiniCard({
  icon,
  label,
  value,
  isDark,
  colors,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  value: string;
  isDark: boolean;
  colors: { border: string; surface: string; textPrimary: string; textSecondary: string; iconMuted: string };
}) {
  return (
    <View
      style={{
        flex: 1,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: isDark ? colors.surface : "#FFFFFF",
        padding: 16,
        shadowColor: "#64748B",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
        elevation: 1,
      }}
    >
      <MaterialIcons name={icon} size={18} color={colors.iconMuted} />
      <Text
        style={{
          marginTop: 10,
          fontFamily: ListifyFonts.regular,
          fontSize: 12,
          color: colors.textSecondary,
        }}
      >
        {label}
      </Text>
      <Text
        numberOfLines={2}
        style={{
          marginTop: 4,
          fontFamily: ListifyFonts.bold,
          fontSize: 16,
          color: colors.textPrimary,
        }}
      >
        {value}
      </Text>
    </View>
  );
}

export function JobDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const params = useLocalSearchParams<{ id?: string; category?: string }>();
  const user = useAppSelector((s) => s.auth.user);
  const locationLabel = useAppSelector(selectLocationLabel);
  const isoCountryCode = useAppSelector(selectIsoCountryCode);

  const categorySlug = (params.category ?? "jobs") as CategorySlug;
  const listingId = params.id;

  const { listing: swrListing, isLoading: swrLoading, refresh: refreshListing } = useSwrListing(
    categorySlug,
    listingId,
  );
  const listing = (swrListing ?? null) as JobListingExtras | null;

  const [isSaved, setIsSaved] = useState(false);
  const [hasApplied, setHasApplied] = useState(false);
  const [applyLoading, setApplyLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<DetailTab>("description");
  const [descExpanded, setDescExpanded] = useState(false);

  const [authGateVisible, setAuthGateVisible] = useState(false);
  const [authGateAction, setAuthGateAction] = useState<"save" | "message">("message");
  const pendingActionRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!listing) return;
    addToRecentlyViewed(listing as ListingItem, locationLabel, isoCountryCode).catch(() => {});
    if (user?.id && listing.savedBy?.includes(user.id)) setIsSaved(true);
    if (isJobApplied(listing, user?.id)) setHasApplied(true);
  }, [listing, locationLabel, isoCountryCode, user?.id]);

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
    pendingActionRef.current?.();
    pendingActionRef.current = null;
  }, []);

  const loadListing = useCallback(async () => {
    if (!listingId) return;
    await refreshListing();
  }, [listingId, refreshListing]);

  const { refreshing, onRefresh } = usePullToRefresh(loadListing);

  const companyName = listing ? getCompanyDisplayName(listing) : "";
  const isVerified = Boolean((listing?.seller as { isVerified?: boolean } | undefined)?.isVerified);
  const sellerId = listing ? getListingSellerId(listing as ListingItem) : null;
  const sellerName = listing?.seller?.name ?? listing?.sellerName ?? "Poster";
  const isOwn = isOwnListing(listing as ListingItem | null, user?.id);

  const salaryText = listing ? formatJobSalary(listing, isoCountryCode) : "";
  const workingHours = listing ? getJobWorkingHours(listing) : "Flexible";
  const jobType = listing?.jobType ?? listing?.employmentType ?? "Full-Time";
  const workMode = listing?.workMode ?? "Hybrid";
  const locationText = listing ? getCompanyLocation(listing) || listing.location || "" : "";
  const experience = listing?.experience ?? "";
  const description = listing?.description?.trim() ?? "";
  const aboutCompany = listing?.aboutCompany?.trim() ?? "";
  const skills = listing?.skills ?? [];
  const benefits = listing?.benefits ?? [];
  const requirements = listing?.requirements?.trim() ?? "";
  const responsibilities = listing?.responsibilities?.trim() ?? "";

  const typeChips = useMemo(() => {
    const onsiteLabel =
      workMode.toLowerCase() === "remote"
        ? "Remote"
        : workMode.toLowerCase() === "hybrid"
          ? "Hybrid"
          : "On-Site";
    const chips = [jobType, onsiteLabel, listing?.subcategory]
      .filter(Boolean)
      .map((c) => String(c))
      .filter((c, i, arr) => arr.indexOf(c) === i)
      .slice(0, 3);
    return chips.length ? chips : ["Full-time", "On-Site", "Internship"];
  }, [jobType, listing?.subcategory, workMode]);

  const descPreview = useMemo(() => {
    if (!description) return "No description provided.";
    if (descExpanded || description.length <= 180) return description;
    return `${description.slice(0, 180).trim()}…`;
  }, [descExpanded, description]);

  const extraDetailRows = useMemo(() => {
    if (!listing) return [];
    const rows: { label: string; value: string }[] = [];
    if (listing.education) rows.push({ label: "Education", value: listing.education });
    if (listing.department) rows.push({ label: "Department", value: listing.department });
    if (listing.salaryType) rows.push({ label: "Salary Type", value: listing.salaryType });
    if (listing.employmentType) rows.push({ label: "Employment Type", value: listing.employmentType });
    if (listing.positions && listing.positions > 0) {
      rows.push({ label: "Vacancy Count", value: String(listing.positions) });
    }
    return rows;
  }, [listing]);

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

  const handleApply = useCallback(async () => {
    if (!listing || !listingId) return;
    requireAuth("message", async () => {
      setApplyLoading(true);
      try {
        const res = await recordJobApply(listingId);
        setHasApplied(true);
        const link = res.applyLink || listing.applyLink;
        if (link) {
          await Linking.openURL(link);
        }
      } catch {
        if (listing.applyLink) {
          Linking.openURL(listing.applyLink).catch(() => {
            showErrorToast("Apply Failed", "Could not open application link.");
          });
        } else if (sellerId) {
          router.push(
            buildListingChatHref({
              recipientId: sellerId,
              sellerId,
              name: sellerName,
              productId: listing._id,
              productType: categorySlug,
              productTitle: listing.title,
              productPrice: listing.price,
              productImage: listing.images?.[0] ?? null,
              currency: listing.currency ?? "₹",
            }),
          );
        }
      } finally {
        setApplyLoading(false);
      }
    });
  }, [categorySlug, listing, listingId, requireAuth, router, sellerId, sellerName]);

  const handleShare = useCallback(async () => {
    if (!listing) return;
    try {
      await Share.share({ message: `${listing.title} at ${companyName}` });
    } catch {
      // ignore
    }
  }, [companyName, listing]);

  const sellerContact = useMemo(
    () => (listing ? resolveListingContactPhone(listing as ListingItem) : null),
    [listing],
  );

  const handleMessageRecruiter = useCallback(() => {
    if (!listing || !sellerId) return;
    if (isOwn) {
      showErrorToast("Not Allowed", "You can't message yourself on your own listing.");
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
          productTitle: listing.title,
          productPrice: listing.price,
          productImage: listing.images?.[0] ?? null,
          currency: listing.currency ?? "₹",
        }),
      );
    });
  }, [categorySlug, isOwn, listing, requireAuth, router, sellerId, sellerName]);

  const handleCallRecruiter = useCallback(async () => {
    if (!listing || !sellerContact) {
      showErrorToast("No Number", "Recruiter has not provided a contact number.");
      return;
    }
    if (!sellerId) {
      showErrorToast("Unavailable", "Contact information is missing for this listing.");
      return;
    }
    await openListingPhoneDialer({
      contact: sellerContact,
      listingId: listing._id,
      sellerId,
      listingModel: getListingModelForCategory(categorySlug),
    });
  }, [categorySlug, listing, sellerContact, sellerId]);

  const switchTab = useCallback((tab: DetailTab) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setActiveTab(tab);
  }, []);

  const pageBg = isDark ? colors.background : JOBS_PAGE_BG;
  const cardBg = isDark ? colors.surfaceElevated : "#FFFFFF";

  if (swrLoading && !listing) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: pageBg }}>
        <ActivityIndicator color={JOBS_BLUE} size="large" />
      </View>
    );
  }

  if (!listing) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: pageBg, padding: 24 }}>
        <MaterialIcons name="work-outline" size={48} color={colors.iconMuted} />
        <Text style={{ marginTop: 12, fontFamily: ListifyFonts.semiBold, fontSize: 16, color: colors.textPrimary }}>
          Job not found
        </Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ fontFamily: ListifyFonts.semiBold, fontSize: 14, color: JOBS_BLUE }}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: pageBg }}>
      <View
        style={{
          paddingTop: insets.top + 8,
          paddingHorizontal: 16,
          paddingBottom: 12,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <HeaderIconButton onPress={() => router.back()} isDark={isDark} colors={colors}>
          <MaterialIcons name="chevron-left" size={24} color={colors.textPrimary} />
        </HeaderIconButton>

        <View style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
          {listing ? (
            <CompanyLogo
              job={listing}
              size={28}
              imageSize={22}
              borderWidth={1}
              borderColor={isDark ? colors.border : "#EEF2F7"}
            />
          ) : null}
          <Text numberOfLines={1} style={{ fontFamily: ListifyFonts.bold, fontSize: 17, color: colors.textPrimary, flexShrink: 1 }}>
            {companyName}
          </Text>
          {isVerified ? <MaterialIcons name="verified" size={18} color={JOBS_BLUE} /> : null}
        </View>

        <HeaderIconButton onPress={() => void handleToggleSave()} isDark={isDark} colors={colors}>
          <MaterialIcons
            name={isSaved ? "bookmark" : "bookmark-border"}
            size={24}
            color={isSaved ? "#EF4444" : colors.iconMuted}
          />
        </HeaderIconButton>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[JOBS_BLUE]} tintColor={JOBS_BLUE} />
        }
        contentContainerStyle={{ paddingBottom: isOwn ? 24 + insets.bottom : 110 + insets.bottom }}
      >
        <View
          style={{
            marginHorizontal: 16,
            marginTop: 24,
            borderRadius: 32,
            backgroundColor: cardBg,
            paddingTop: 56,
            paddingHorizontal: 20,
            paddingBottom: 24,
            shadowColor: "#64748B",
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.1,
            shadowRadius: 20,
            elevation: 4,
          }}
        >
          <View style={{ position: "absolute", top: -36, alignSelf: "center" }}>
            <CompanyLogo
              job={listing}
              size={72}
              imageSize={52}
              borderWidth={4}
              borderColor={cardBg}
            />
          </View>

          <Text
            style={{
              marginTop: 8,
              textAlign: "center",
              fontFamily: ListifyFonts.bold,
              fontSize: 22,
              lineHeight: 28,
              color: colors.textPrimary,
            }}
          >
            {listing.title}
          </Text>

          {salaryText !== "Salary not disclosed" ? (
            <Text
              style={{
                marginTop: 8,
                textAlign: "center",
                fontFamily: ListifyFonts.regular,
                fontSize: 16,
                color: "#9CA3AF",
              }}
            >
              {salaryText}
            </Text>
          ) : null}

          <View style={{ marginTop: 16, flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 }}>
            {typeChips.map((chip) => (
              <View
                key={chip}
                style={{
                  borderRadius: 999,
                  backgroundColor: isDark ? colors.surfaceMuted : "#F3F4F6",
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                }}
              >
                <Text style={{ fontFamily: ListifyFonts.medium, fontSize: 13, color: colors.textSecondary }}>
                  {chip}
                </Text>
              </View>
            ))}
          </View>

          <View
            style={{
              marginTop: 20,
              flexDirection: "row",
              borderRadius: 999,
              backgroundColor: isDark ? colors.surfaceMuted : "#F3F4F6",
              padding: 4,
            }}
          >
            {(["description", "company"] as DetailTab[]).map((tab) => {
              const active = activeTab === tab;
              return (
                <Pressable
                  key={tab}
                  onPress={() => switchTab(tab)}
                  style={{
                    flex: 1,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    borderRadius: 999,
                    paddingVertical: 10,
                    backgroundColor: active ? cardBg : "transparent",
                    shadowColor: active ? "#000" : "transparent",
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: active ? 0.08 : 0,
                    shadowRadius: 4,
                    elevation: active ? 2 : 0,
                  }}
                >
                  <MaterialIcons
                    name={tab === "description" ? "description" : "business"}
                    size={16}
                    color={active ? JOBS_BLUE : colors.textSecondary}
                  />
                  <Text
                    style={{
                      fontFamily: ListifyFonts.semiBold,
                      fontSize: 14,
                      color: active ? colors.textPrimary : colors.textSecondary,
                    }}
                  >
                    {tab === "description" ? "Description" : "Company"}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View
            style={{
              marginTop: 20,
              flexDirection: "row",
              borderTopWidth: 1,
              borderBottomWidth: 1,
              borderColor: colors.border,
              paddingVertical: 16,
            }}
          >
            <InfoColumn
              icon="work-outline"
              iconColor="#8B5E3C"
              value={jobType}
              label="Job Type"
              textPrimary={colors.textPrimary}
              textSecondary={colors.textSecondary}
            />
            <View style={{ width: 1, backgroundColor: colors.border }} />
            <InfoColumn
              icon="schedule"
              iconColor="#8B5CF6"
              value={workingHours}
              label="Working Hours"
              textPrimary={colors.textPrimary}
              textSecondary={colors.textSecondary}
            />
            <View style={{ width: 1, backgroundColor: colors.border }} />
            <InfoColumn
              icon="apartment"
              iconColor="#2DD4BF"
              value={workMode}
              label="Workplace Type"
              textPrimary={colors.textPrimary}
              textSecondary={colors.textSecondary}
            />
          </View>

          {activeTab === "description" ? (
            <View style={{ marginTop: 20 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={{ fontFamily: ListifyFonts.bold, fontSize: 18, color: colors.textPrimary }}>
                  Job Details
                </Text>
                <Pressable onPress={() => void handleShare()} hitSlop={8}>
                  <MaterialIcons name="more-horiz" size={22} color={colors.iconMuted} />
                </Pressable>
              </View>

              <Text
                style={{
                  marginTop: 10,
                  fontFamily: ListifyFonts.regular,
                  fontSize: 14,
                  lineHeight: 22,
                  color: colors.textSecondary,
                }}
              >
                {descPreview}
                {description.length > 180 ? (
                  <Text
                    onPress={() => setDescExpanded((v) => !v)}
                    style={{ fontFamily: ListifyFonts.semiBold, color: JOBS_BLUE }}
                  >
                    {" "}
                    {descExpanded ? "Read Less" : "Read More"}
                  </Text>
                ) : null}
              </Text>

              {(experience || locationText) ? (
                <View style={{ marginTop: 16, flexDirection: "row", gap: 12 }}>
                  {experience ? (
                    <DetailMiniCard
                      icon="work-outline"
                      label="Experience"
                      value={experience}
                      isDark={isDark}
                      colors={colors}
                    />
                  ) : null}
                  {locationText ? (
                    <DetailMiniCard
                      icon="location-city"
                      label="Location"
                      value={locationText}
                      isDark={isDark}
                      colors={colors}
                    />
                  ) : null}
                </View>
              ) : null}

              {extraDetailRows.length > 0 ? (
                <View style={{ marginTop: 16, gap: 10 }}>
                  {extraDetailRows.map((row) => (
                    <View
                      key={row.label}
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        borderTopWidth: 1,
                        borderTopColor: colors.border,
                        paddingTop: 10,
                      }}
                    >
                      <Text style={{ fontFamily: ListifyFonts.regular, fontSize: 13, color: colors.textSecondary }}>
                        {row.label}
                      </Text>
                      <Text style={{ fontFamily: ListifyFonts.semiBold, fontSize: 13, color: colors.textPrimary }}>
                        {row.value}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {responsibilities ? (
                <View style={{ marginTop: 8 }}>
                  <Text style={{ fontFamily: ListifyFonts.bold, fontSize: 16, color: colors.textPrimary }}>
                    Responsibilities
                  </Text>
                  <Text style={{ marginTop: 8, fontFamily: ListifyFonts.regular, fontSize: 14, lineHeight: 22, color: colors.textSecondary }}>
                    {responsibilities}
                  </Text>
                </View>
              ) : null}

              {requirements ? (
                <View style={{ marginTop: 20 }}>
                  <Text style={{ fontFamily: ListifyFonts.bold, fontSize: 16, color: colors.textPrimary }}>
                    Requirements
                  </Text>
                  <Text style={{ marginTop: 8, fontFamily: ListifyFonts.regular, fontSize: 14, lineHeight: 22, color: colors.textSecondary }}>
                    {requirements}
                  </Text>
                </View>
              ) : null}

              {skills.length > 0 ? (
                <View style={{ marginTop: 20 }}>
                  <Text style={{ fontFamily: ListifyFonts.bold, fontSize: 16, color: colors.textPrimary }}>Skills</Text>
                  <View style={{ marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {skills.map((skill) => (
                      <View
                        key={skill}
                        style={{
                          borderRadius: 999,
                          backgroundColor: isDark ? colors.surfaceMuted : "#EAF3FF",
                          paddingHorizontal: 12,
                          paddingVertical: 6,
                        }}
                      >
                        <Text style={{ fontFamily: ListifyFonts.medium, fontSize: 12, color: JOBS_BLUE }}>{skill}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}

              {benefits.length > 0 ? (
                <View style={{ marginTop: 20 }}>
                  <Text style={{ fontFamily: ListifyFonts.bold, fontSize: 16, color: colors.textPrimary }}>Benefits</Text>
                  <View style={{ marginTop: 10, gap: 8 }}>
                    {benefits.map((benefit) => (
                      <View key={benefit} style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                        <MaterialIcons name="check-circle" size={18} color="#22C55E" style={{ marginTop: 2 }} />
                        <Text style={{ flex: 1, fontFamily: ListifyFonts.regular, fontSize: 14, color: colors.textSecondary }}>
                          {benefit}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}
            </View>
          ) : (
            <View style={{ marginTop: 20 }}>
              <Text style={{ fontFamily: ListifyFonts.bold, fontSize: 18, color: colors.textPrimary }}>
                About {companyName}
              </Text>
              <Text
                style={{
                  marginTop: 10,
                  fontFamily: ListifyFonts.regular,
                  fontSize: 14,
                  lineHeight: 22,
                  color: colors.textSecondary,
                }}
              >
                {aboutCompany || description || "Company information not provided."}
              </Text>
              {listing.industry ? (
                <Text style={{ marginTop: 12, fontFamily: ListifyFonts.medium, fontSize: 13, color: colors.textSecondary }}>
                  Industry: {listing.industry}
                </Text>
              ) : null}
              {listing.createdAt ? (
                <Text style={{ marginTop: 6, fontFamily: ListifyFonts.medium, fontSize: 13, color: colors.textSecondary }}>
                  Posted: {new Date(listing.createdAt).toLocaleDateString()}
                </Text>
              ) : null}
              {sellerId ? (
                <Pressable
                  onPress={() => router.push(`/seller-public-profile?sellerId=${sellerId}` as Href)}
                  style={{ marginTop: 16, flexDirection: "row", alignItems: "center", gap: 6 }}
                >
                  <Text style={{ fontFamily: ListifyFonts.semiBold, fontSize: 14, color: JOBS_BLUE }}>
                    View company profile
                  </Text>
                  <MaterialIcons name="chevron-right" size={18} color={JOBS_BLUE} />
                </Pressable>
              ) : null}
            </View>
          )}
        </View>

        {listing ? (
          <View style={{ paddingHorizontal: 20 }}>
            <ListingSellerContactCard
              title={getListingContactSectionTitle("jobs")}
              name={companyName}
              subtitle={sellerName !== companyName ? `Posted by ${sellerName}` : undefined}
              isVerified={isVerified}
              contactPhone={sellerContact}
              onMessagePress={handleMessageRecruiter}
              onCallPress={() => void handleCallRecruiter()}
            />
          </View>
        ) : null}

        <Pressable
          onPress={() => router.push(`/report-listing-modal?listingId=${listing._id}&category=${categorySlug}` as Href)}
          style={{ marginTop: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}
        >
          <MaterialIcons name="flag" size={16} color={colors.textTertiary} />
          <Text style={{ fontFamily: ListifyFonts.regular, fontSize: 12, color: colors.textTertiary }}>
            Report this listing
          </Text>
        </Pressable>
      </ScrollView>

      {!isOwn ? (
        <JobsApplyFooter bottomInset={insets.bottom} loading={applyLoading} onPress={() => void handleApply()} />
      ) : null}

      <AuthGateBottomSheet
        visible={authGateVisible}
        onClose={() => setAuthGateVisible(false)}
        action={authGateAction}
        onAuthenticated={handleAuthSuccess}
      />
    </View>
  );
}

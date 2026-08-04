import { MaterialIcons } from "@expo/vector-icons";
import { memo } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";

import { ProfileAvatarImage } from "@/components/profile-avatar-image";
import { SafePressable } from "@/components/safe-pressable";
import { ListifyColors } from "@/constants/listify-theme";
import { ListifyFonts } from "@/constants/typography";
import type { ListingItem } from "@/features/listing/services/listing-api";
import { formatPrice as libFormatPrice } from "@/lib/currency";
import { formatServiceExperienceLabel } from "@/lib/format-service-experience";
import { useTheme } from "@/providers/theme-provider";

const IMAGE_WIDTH = 96;
const MIN_IMAGE_HEIGHT = 96;
const PRICE_UNITS: Record<string, string> = {
  fixed: "",
  Fixed: "",
  "Fixed Quote": "",
  hourly: "/hr",
  Hourly: "/hr",
  "Per Hour": "/hr",
  daily: "/day",
  Daily: "/day",
  "Per Day": "/day",
  weekly: "/wk",
  monthly: "/mo",
  Monthly: "/mo",
  "Per Month": "/mo",
  "Per Visit": "/visit",
  project: "/project",
  "Per Project": "/project",
  Negotiable: "",
};

type ServiceProviderListCardProps = {
  item: ListingItem;
  isoCountryCode?: string | null;
  isSaved?: boolean;
  distanceLabel?: string;
  onPress: () => void;
  onToggleSave?: () => void;
  onMessage?: () => void;
  showMessage?: boolean;
};

type ServiceBadge = {
  key: string;
  label: string;
  icon: React.ComponentProps<typeof MaterialIcons>["name"];
  bg: string;
  color: string;
};

function getProviderName(item: ListingItem) {
  const user = item.userId;
  if (user && typeof user === "object" && user.name?.trim()) {
    return user.name.trim();
  }
  return item.sellerName?.trim() || item.seller?.name?.trim() || "Professional";
}

function getProfileUser(item: ListingItem) {
  const user = item.userId;
  if (user && typeof user === "object") return user;
  if (item.seller) {
    return {
      name: item.seller.name,
      profileImage: item.seller.profileImage,
    };
  }
  return null;
}

function getExperienceText(item: ListingItem) {
  return formatServiceExperienceLabel(item);
}

function getRating(item: ListingItem) {
  const stats = (item as { stats?: { rating?: number; reviewCount?: number } }).stats;
  const rating =
    stats?.rating ??
    (item as { rating?: number; averageRating?: number }).rating ??
    (item as { averageRating?: number }).averageRating;
  const reviewCount =
    stats?.reviewCount ??
    (item as { reviewCount?: number }).reviewCount ??
    (item as { reviewsCount?: number }).reviewsCount;

  return {
    rating: typeof rating === "number" && rating > 0 ? rating : null,
    reviewCount: typeof reviewCount === "number" && reviewCount > 0 ? reviewCount : null,
  };
}

function buildBadges(item: ListingItem): ServiceBadge[] {
  const badges: ServiceBadge[] = [];
  const certification = (item as { certification?: string }).certification?.trim();
  const availability = (item as { serviceAvailability?: string }).serviceAvailability?.trim();
  const featured = (item as { featured?: boolean }).featured;
  const subcategory = item.subcategory?.trim();

  const certLower = certification?.toLowerCase() ?? "";
  const isBackgroundVerified =
    featured ||
    certLower.includes("background") ||
    certLower.includes("verified") ||
    certLower.includes("police");

  if (isBackgroundVerified) {
    badges.push({
      key: "verified",
      label: "Background Verified",
      icon: "verified-user",
      bg: "rgba(39, 187, 151, 0.12)",
      color: ListifyColors.primary,
    });
  }

  if (certification && !isBackgroundVerified) {
    certification
      .split(/[,;|]/)
      .map((part) => part.trim())
      .filter(Boolean)
      .slice(0, 1)
      .forEach((label, index) => {
        badges.push({
          key: `cert-${index}-${label}`,
          label,
          icon: "workspace-premium",
          bg: "rgba(16, 185, 129, 0.1)",
          color: ListifyColors.success,
        });
      });
  }

  if (subcategory) {
    badges.push({
      key: "category",
      label: subcategory,
      icon: "home-repair-service",
      bg: "rgba(39, 187, 151, 0.1)",
      color: ListifyColors.primary,
    });
  }

  if (availability && badges.length < 3) {
    badges.push({
      key: "availability",
      label: availability,
      icon: "schedule",
      bg: "rgba(45, 125, 215, 0.1)",
      color: ListifyColors.secondaryBlue,
    });
  }

  return badges.slice(0, 3);
}

function BadgePill({ badge }: { badge: ServiceBadge }) {
  return (
    <View
      className="flex-row items-center rounded-full px-2 py-0.5"
      style={{ backgroundColor: badge.bg, maxWidth: "100%" }}
    >
      <MaterialIcons name={badge.icon} size={13} color={badge.color} />
      <Text
        numberOfLines={1}
        className="ml-1.5 text-[11px]"
        style={{
          fontFamily: ListifyFonts.medium,
          color: badge.color,
          ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
        }}
      >
        {badge.label}
      </Text>
    </View>
  );
}

function ServiceProviderListCardImpl({
  item,
  isoCountryCode,
  isSaved = false,
  distanceLabel,
  onPress,
  onToggleSave,
  onMessage,
  showMessage = true,
}: ServiceProviderListCardProps) {
  const { colors, isDark } = useTheme();
  const providerName = getProviderName(item);
  const profileUser = getProfileUser(item);
  const experience = getExperienceText(item);
  const { rating, reviewCount } = getRating(item);
  const badges = buildBadges(item);

  const pricing = (item as { pricing?: { basePrice?: number; priceType?: string } }).pricing;
  const priceType = pricing?.priceType ?? (item as { priceType?: string }).priceType;
  const priceVal = pricing?.basePrice ?? item.price ?? null;
  const priceUnit = priceType ? (PRICE_UNITS[priceType] ?? "") : "";
  const priceText =
    priceVal != null
      ? libFormatPrice(priceVal, item.currency, item.countryCode ?? isoCountryCode)
      : null;

  return (
    <SafePressable
      onPress={onPress}
      cooldownMs={700}
      style={({ pressed }) => ({
        overflow: "hidden",
        borderRadius: 16,
        backgroundColor: colors.surface,
        opacity: pressed ? 0.96 : 1,
        borderWidth: 1,
        borderColor: colors.border,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: isDark ? 0.28 : 0.06,
        shadowRadius: 8,
        elevation: 2,
        transform: [{ scale: pressed ? 0.995 : 1 }],
      })}
    >
      <View className="flex-row items-stretch p-3.5" style={{ gap: 12 }}>
        <View
          style={{ width: IMAGE_WIDTH, minHeight: MIN_IMAGE_HEIGHT, alignSelf: "stretch" }}
        >
          <View
            className="flex-1 overflow-hidden rounded-lg"
            style={{ backgroundColor: colors.surfaceMuted }}
          >
            <ProfileAvatarImage
              user={profileUser}
              fallbackName={providerName}
              className="rounded-lg"
              style={StyleSheet.absoluteFillObject}
              iconSize={36}
            />
          </View>
        </View>

        <View className="min-w-0 flex-1" style={{ gap: 4 }}>
          <View className="flex-row items-start justify-between gap-2">
            <Text
              numberOfLines={1}
              className="flex-1 text-[17px]"
              style={{ fontFamily: ListifyFonts.semiBold, color: colors.textPrimary }}
            >
              {providerName}
            </Text>

            <View className="flex-row items-center" style={{ gap: 8 }}>
              {onToggleSave ? (
                <SafePressable
                  onPress={(e) => {
                    e.stopPropagation();
                    onToggleSave();
                  }}
                  hitSlop={10}
                  cooldownMs={400}
                  respectNavigationLock={false}
                  style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                >
                  <MaterialIcons
                    name={isSaved ? "favorite" : "favorite-border"}
                    size={22}
                    color={isSaved ? ListifyColors.error : colors.iconMuted}
                  />
                </SafePressable>
              ) : null}

              {showMessage && onMessage ? (
                <SafePressable
                  onPress={(e) => {
                    e.stopPropagation();
                    onMessage();
                  }}
                  hitSlop={8}
                  cooldownMs={800}
                  className="items-center justify-center rounded-full"
                  style={({ pressed }) => ({
                    width: 34,
                    height: 34,
                    backgroundColor: pressed
                      ? colors.primarySoft
                      : colors.surface,
                    borderWidth: 1.5,
                    borderColor: colors.primary,
                  })}
                >
                  <MaterialIcons
                    name="chat-bubble-outline"
                    size={18}
                    color={colors.primary}
                  />
                </SafePressable>
              ) : null}
            </View>
          </View>

          <View className="flex-row items-center" style={{ gap: 4 }}>
            <MaterialIcons name="star" size={15} color={ListifyColors.warning} />
            <Text
              className="text-[14px]"
              style={{ fontFamily: ListifyFonts.semiBold, color: colors.textPrimary }}
            >
              {rating != null ? rating.toFixed(1) : "—"}
            </Text>
            {reviewCount != null ? (
              <Text
                className="text-[12px]"
                style={{ fontFamily: ListifyFonts.regular, color: colors.textTertiary }}
              >
                ({reviewCount} {reviewCount === 1 ? "review" : "reviews"})
              </Text>
            ) : null}
          </View>

          {experience ? (
            <Text
              numberOfLines={1}
              className="text-[13px]"
              style={{ fontFamily: ListifyFonts.regular, color: colors.textSecondary }}
            >
              {experience}
            </Text>
          ) : null}

          {badges.length > 0 ? (
            <View className="flex-row flex-wrap" style={{ gap: 4 }}>
              {badges.map((badge) => (
                <BadgePill key={badge.key} badge={badge} />
              ))}
            </View>
          ) : null}

          {priceText ? (
            <Text
              className="text-[15px]"
              style={{ fontFamily: ListifyFonts.bold, color: colors.textPrimary }}
            >
              {priceText}
              {priceUnit ? (
                <Text
                  className="text-[12px]"
                  style={{ fontFamily: ListifyFonts.regular, color: colors.textTertiary }}
                >
                  {priceUnit}
                </Text>
              ) : null}
            </Text>
          ) : null}

          {distanceLabel ? (
            <Text
              numberOfLines={1}
              className="text-[12px] text-[#9CA3AF]"
              style={{ fontFamily: ListifyFonts.medium }}
            >
              {distanceLabel}
            </Text>
          ) : null}
        </View>
      </View>
    </SafePressable>
  );
}

export const ServiceProviderListCard = memo(ServiceProviderListCardImpl);

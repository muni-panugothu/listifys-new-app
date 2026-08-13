import { MaterialIcons } from "@expo/vector-icons";
import { memo } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";

import { SafePressable } from "@/components/safe-pressable";
import { ListifyFonts } from "@/constants/typography";
import type { ListingItem } from "@/features/listing/services/listing-api";
import { formatPrice as libFormatPrice } from "@/lib/currency";
import { getListingCoverMediaUrl } from "@/lib/listing-media";
import { ProfileAvatarImage } from "@/components/profile-avatar-image";
import { Image } from "@/lib/nativewind-interop";
import { useTheme } from "@/providers/theme-provider";

const IMAGE_SIZE = 108;
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

export type HomeServiceDetailCardProps = {
  item: ListingItem;
  isoCountryCode?: string | null;
  cardWidth?: number;
  onPress: () => void;
  onMessage: () => void;
};

function getProviderName(item: ListingItem) {
  const user = item.userId;
  if (user && typeof user === "object" && user.name?.trim()) {
    return user.name.trim();
  }
  return item.sellerName?.trim() || item.seller?.name?.trim() || "Verified Professional";
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

function getAvailabilityLabel(item: ListingItem) {
  const availability = (item as { serviceAvailability?: string }).serviceAvailability?.trim();
  if (availability) return availability;

  const subcategory = item.subcategory?.trim();
  if (subcategory) return `Available · ${subcategory}`;

  return "Available Now";
}

function getServiceImage(item: ListingItem) {
  const cover = getListingCoverMediaUrl(item);
  if (cover) return cover;
  return item.images?.[0]?.trim() || null;
}

function HomeServiceDetailCardImpl({
  item,
  isoCountryCode,
  cardWidth,
  onPress,
  onMessage,
}: HomeServiceDetailCardProps) {
  const { colors, isDark } = useTheme();
  const providerName = getProviderName(item);
  const profileUser = getProfileUser(item);
  const serviceImage = getServiceImage(item);
  const availabilityLabel = getAvailabilityLabel(item);

  const pricing = (item as { pricing?: { basePrice?: number; priceType?: string } }).pricing;
  const priceType = pricing?.priceType ?? (item as { priceType?: string }).priceType;
  const priceVal = pricing?.basePrice ?? item.price ?? null;
  const priceUnit = priceType ? (PRICE_UNITS[priceType] ?? "") : "";
  const priceText =
    priceVal != null
      ? libFormatPrice(priceVal, item.currency, item.countryCode ?? isoCountryCode)
      : "Quote on request";

  const title = item.title?.trim() || item.subcategory?.trim() || "Professional Service";
  const description =
    item.description?.trim() ||
    `Trusted ${item.subcategory?.trim() || "service"} by ${providerName}. Book directly through Listify.`;

  const statusBg = colors.primarySoft;
  const statusColor = colors.primary;

  return (
    <SafePressable
      onPress={onPress}
      cooldownMs={700}
      style={({ pressed }) => ({
        width: cardWidth,
        borderRadius: 18,
        backgroundColor: colors.surface,
        opacity: pressed ? 0.97 : 1,
        borderWidth: 1,
        borderColor: colors.border,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: isDark ? 0.22 : 0.07,
        shadowRadius: 10,
        elevation: 3,
        transform: [{ scale: pressed ? 0.996 : 1 }],
      })}
    >
      <View className="flex-row items-stretch p-3.5" style={{ gap: 14 }}>
        <View
          style={{
            width: IMAGE_SIZE,
            height: IMAGE_SIZE,
            borderRadius: 14,
            overflow: "hidden",
            backgroundColor: colors.surfaceMuted,
          }}
        >
          {serviceImage ? (
            <Image
              source={{ uri: serviceImage }}
              contentFit="cover"
              style={StyleSheet.absoluteFillObject}
            />
          ) : (
            <ProfileAvatarImage
              user={profileUser}
              fallbackName={providerName}
              className="rounded-[14px]"
              style={StyleSheet.absoluteFillObject}
              iconSize={40}
            />
          )}
        </View>

        <View className="min-w-0 flex-1">
          <View>
            <View className="flex-row items-start justify-between gap-2">
              <Text
                numberOfLines={1}
                className="flex-1 text-[17px]"
                style={{
                  fontFamily: ListifyFonts.bold,
                  color: colors.textPrimary,
                  ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
                }}
              >
                {title}
              </Text>

              <View
                className="rounded-full px-2.5 py-1"
                style={{ backgroundColor: statusBg, maxWidth: "46%" }}
              >
                <Text
                  numberOfLines={1}
                  className="text-[11px]"
                  style={{
                    fontFamily: ListifyFonts.semiBold,
                    color: statusColor,
                    ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
                  }}
                >
                  {availabilityLabel}
                </Text>
              </View>
            </View>

            <Text
              numberOfLines={1}
              className="mt-1 text-[12px]"
              style={{
                fontFamily: ListifyFonts.medium,
                color: colors.textTertiary,
              }}
            >
              {providerName}
              {item.subcategory?.trim() ? ` · ${item.subcategory.trim()}` : ""}
            </Text>

            <Text
              numberOfLines={2}
              className="mt-1.5 text-[13px] leading-[18px]"
              style={{
                fontFamily: ListifyFonts.regular,
                color: colors.textSecondary,
              }}
            >
              {description}
            </Text>
          </View>

          <View className="mt-1 flex-row items-center justify-between">
            <View className="flex-1 pr-2">
              <Text
                numberOfLines={1}
                className="text-[20px]"
                style={{
                  fontFamily: ListifyFonts.bold,
                  color: colors.primary,
                  ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
                }}
              >
                {priceText}
                {priceUnit ? (
                  <Text
                    className="text-[13px]"
                    style={{
                      fontFamily: ListifyFonts.medium,
                      color: colors.textTertiary,
                    }}
                  >
                    {priceUnit}
                  </Text>
                ) : null}
              </Text>
            </View>

            <SafePressable
              onPress={(e) => {
                e.stopPropagation();
                onMessage();
              }}
              hitSlop={8}
              cooldownMs={800}
              respectNavigationLock={false}
              accessibilityLabel="Message service provider"
              style={({ pressed }) => ({
                width: 40,
                height: 40,
                borderRadius: 20,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: pressed ? colors.primaryDeep : colors.primary,
                shadowColor: colors.primary,
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.22,
                shadowRadius: 4,
                elevation: 2,
              })}
            >
              <MaterialIcons name="chat-bubble-outline" size={19} color="#FFFFFF" />
            </SafePressable>
          </View>
        </View>
      </View>
    </SafePressable>
  );
}

export const HomeServiceDetailCard = memo(HomeServiceDetailCardImpl);

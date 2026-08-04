import { MaterialIcons } from "@expo/vector-icons";
import { memo } from "react";
import { Platform, Pressable, Text, View } from "react-native";

import { ListifyFonts } from "@/constants/typography";
import { formatPrice as libFormatPrice } from "@/lib/currency";
import { Image } from "@/lib/nativewind-interop";
import { useTheme } from "@/providers/theme-provider";

export type PropertyNearbyCardProps = {
  title: string;
  location?: string | null;
  distanceLabel?: string | null;
  badge?: string | null;
  price?: number | null;
  currency?: string | null;
  isoCountryCode?: string | null;
  priceSuffix?: string;
  image?: string;
  isSaved?: boolean;
  onPress: () => void;
  onToggleSave?: () => void;
};

function PropertyNearbyCardImpl({
  title,
  location,
  distanceLabel,
  badge,
  price,
  currency,
  isoCountryCode,
  priceSuffix = "/Month",
  image,
  isSaved = false,
  onPress,
  onToggleSave,
}: PropertyNearbyCardProps) {
  const { colors, isDark } = useTheme();
  const priceLabel =
    price == null ? "On request" : libFormatPrice(price, currency, isoCountryCode);
  const badgeLabel = badge?.trim() || "Home";
  const locationLabel = location?.trim() || "Location not set";
  const thumbSize = 112;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        backgroundColor: isDark ? colors.surfaceElevated : colors.surface,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: colors.border,
        padding: 10,
        opacity: pressed ? 0.94 : 1,
        shadowColor: "#000000",
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: isDark ? 0.28 : 0.06,
        shadowRadius: 10,
        elevation: 2,
      })}
    >
      <View
        style={{
          width: thumbSize,
          height: thumbSize,
          borderRadius: 16,
          backgroundColor: colors.surfaceMuted,
          overflow: "hidden",
        }}
      >
        {image ? (
          <Image
            source={image}
            contentFit="cover"
            cachePolicy="memory-disk"
            recyclingKey={image}
            transition={120}
            style={{ width: thumbSize, height: thumbSize }}
          />
        ) : (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <MaterialIcons name="apartment" size={30} color={colors.iconMuted} />
          </View>
        )}

        {onToggleSave ? (
          <Pressable
            onPress={(e) => {
              e.stopPropagation?.();
              onToggleSave();
            }}
            hitSlop={8}
            style={({ pressed }) => ({
              position: "absolute",
              top: 8,
              right: 8,
              width: 30,
              height: 30,
              borderRadius: 15,
              backgroundColor: colors.surfaceElevated,
              borderWidth: 1,
              borderColor: colors.border,
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <MaterialIcons
              name={isSaved ? "favorite" : "favorite-border"}
              size={16}
              color={isSaved ? colors.primary : colors.textPrimary}
            />
          </Pressable>
        ) : null}
      </View>

      <View style={{ flex: 1, minWidth: 0, paddingVertical: 2 }}>
        <View
          style={{
            alignSelf: "flex-start",
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 999,
            backgroundColor: colors.primarySoft,
          }}
        >
          <Text
            style={{
              fontFamily: ListifyFonts.medium,
              fontSize: 11,
              color: colors.primary,
              ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
            }}
          >
            {badgeLabel}
          </Text>
        </View>

        <Text
          numberOfLines={1}
          style={{
            marginTop: 8,
            fontFamily: ListifyFonts.bold,
            fontSize: 15,
            lineHeight: 20,
            color: colors.textPrimary,
            ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
          }}
        >
          {title}
        </Text>

        <View style={{ marginTop: 4, flexDirection: "row", alignItems: "center", gap: 4 }}>
          <MaterialIcons name="location-on" size={13} color={colors.iconMuted} />
          <Text
            numberOfLines={1}
            style={{
              flex: 1,
              fontFamily: ListifyFonts.regular,
              fontSize: 12,
              color: colors.textTertiary,
              ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
            }}
          >
            {locationLabel}
            {distanceLabel ? ` · ${distanceLabel}` : ""}
          </Text>
        </View>

        <View style={{ marginTop: 8, flexDirection: "row", alignItems: "baseline", gap: 3 }}>
          <Text
            numberOfLines={1}
            style={{
              fontFamily: ListifyFonts.bold,
              fontSize: 16,
              color: colors.textPrimary,
              ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
            }}
          >
            {priceLabel}
          </Text>
          {price != null && priceSuffix ? (
            <Text
              style={{
                fontFamily: ListifyFonts.regular,
                fontSize: 12,
                color: colors.textTertiary,
              }}
            >
              {priceSuffix}
            </Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

export const PropertyNearbyCard = memo(PropertyNearbyCardImpl);

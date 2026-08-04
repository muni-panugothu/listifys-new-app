import { MaterialIcons } from "@expo/vector-icons";
import { memo } from "react";
import { Platform, Pressable, Text, View } from "react-native";

import { ListifyFonts } from "@/constants/typography";
import { formatPrice as libFormatPrice } from "@/lib/currency";
import { Image } from "@/lib/nativewind-interop";
import { useTheme } from "@/providers/theme-provider";

export type PropertyCardProps = {
  title: string;
  location?: string | null;
  badge?: string | null;
  price?: number | null;
  currency?: string | null;
  isoCountryCode?: string | null;
  priceSuffix?: string;
  image?: string;
  width: number;
  isSaved?: boolean;
  onPress: () => void;
  onToggleSave?: () => void;
};

function PropertyRecommendedCardImpl({
  title,
  location,
  badge,
  price,
  currency,
  isoCountryCode,
  priceSuffix = "/Month",
  image,
  width,
  isSaved = false,
  onPress,
  onToggleSave,
}: PropertyCardProps) {
  const { colors, isDark } = useTheme();
  const cardBackground = isDark ? colors.surfaceElevated : colors.card;
  const imageHeight = Math.round(width * 0.72);
  const priceLabel =
    price == null ? "On request" : libFormatPrice(price, currency, isoCountryCode);
  const badgeLabel = badge?.trim() || "Home";
  const locationLabel = location?.trim() || "Location not set";

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        width,
        opacity: pressed ? 0.94 : 1,
        backgroundColor: cardBackground,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: colors.border,
        padding: 10,
        shadowColor: "#000000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: isDark ? 0.28 : 0.06,
        shadowRadius: 12,
        elevation: 2,
      })}
    >
      <View
        style={{
          height: imageHeight,
          width: "100%",
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
            style={{ width: "100%", height: imageHeight }}
          />
        ) : (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <MaterialIcons name="apartment" size={36} color={colors.iconMuted} />
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
              top: 10,
              right: 10,
              width: 34,
              height: 34,
              borderRadius: 17,
              backgroundColor: colors.surface,
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.85 : 1,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: isDark ? 0.35 : 0.12,
              shadowRadius: 3,
              elevation: 2,
            })}
          >
            <MaterialIcons
              name={isSaved ? "favorite" : "favorite-border"}
              size={18}
              color={isSaved ? colors.danger : colors.icon}
            />
          </Pressable>
        ) : null}
      </View>

      <View
        style={{
          alignSelf: "flex-start",
          marginTop: 10,
          paddingHorizontal: 10,
          paddingVertical: 4,
          borderRadius: 999,
          backgroundColor: colors.surfaceMuted,
        }}
      >
        <Text
          style={{
            fontFamily: ListifyFonts.medium,
            fontSize: 11,
            color: colors.textSecondary,
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
          fontSize: 14,
          lineHeight: 19,
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
            fontSize: 11,
            color: colors.textTertiary,
            ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
          }}
        >
          {locationLabel}
        </Text>
      </View>

      <View style={{ marginTop: 8, flexDirection: "row", alignItems: "baseline", gap: 3 }}>
        <Text
          numberOfLines={1}
          style={{
            fontFamily: ListifyFonts.bold,
            fontSize: 15,
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
              fontSize: 11,
              color: colors.textTertiary,
            }}
          >
            {priceSuffix}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export const PropertyRecommendedCard = memo(PropertyRecommendedCardImpl);

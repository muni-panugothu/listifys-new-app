import { MaterialIcons } from "@expo/vector-icons";
import { memo } from "react";
import { Platform, Pressable, Text, View } from "react-native";

import { ListifyFonts } from "@/constants/typography";
import { formatPrice as libFormatPrice } from "@/lib/currency";
import { Image } from "@/lib/nativewind-interop";
import { useTheme } from "@/providers/theme-provider";

type CategoryGridTileProps = {
  title: string;
  /** Grey subtext under the title (condition, subcategory, short description). */
  subtitle?: string;
  /** Distance / radius label (e.g. "2.4 km") on the bottom-right. */
  distanceLabel?: string;
  price?: number | null;
  currency?: string | null;
  isoCountryCode?: string | null;
  image?: string;
  width: number;
  isSaved?: boolean;
  onPress: () => void;
  onToggleSave?: () => void;
};

/**
 * Catalog product card: plus/check on image top-right, price + distance on bottom.
 */
function CategoryGridTileImpl({
  title,
  subtitle,
  distanceLabel,
  price,
  currency,
  isoCountryCode,
  image,
  width,
  isSaved = false,
  onPress,
  onToggleSave,
}: CategoryGridTileProps) {
  const { colors, isDark } = useTheme();
  const cardBackground = isDark ? colors.surfaceElevated : colors.card;
  const imageHeight = Math.round(width * 0.92);
  const priceLabel =
    price == null
      ? "On request"
      : libFormatPrice(price, currency, isoCountryCode);
  const subtext = subtitle?.trim() || undefined;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        width,
        opacity: pressed ? 0.92 : 1,
        backgroundColor: cardBackground,
        borderRadius: 16,
        paddingTop: 14,
        paddingHorizontal: 14,
        paddingBottom: 14,
        borderWidth: 1,
        borderColor: colors.border,
        shadowColor: "#000000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: isDark ? 0.28 : 0.08,
        shadowRadius: 12,
        elevation: 3,
      })}
    >
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
            zIndex: 2,
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: isSaved ? colors.primary : isDark ? "#3F3F46" : "#2D2D2D",
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <MaterialIcons
            name={isSaved ? "check" : "add"}
            size={20}
            color={colors.textOnPrimary}
          />
        </Pressable>
      ) : null}

      <View
        style={{
          height: imageHeight,
          width: "100%",
          borderRadius: 12,
          backgroundColor: colors.surfaceMuted,
          overflow: "hidden",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {image ? (
          <Image
            source={image}
            contentFit="contain"
            cachePolicy="memory-disk"
            recyclingKey={image}
            transition={120}
            style={{ width: "100%", height: imageHeight }}
          />
        ) : (
          <MaterialIcons name="image" size={40} color={colors.iconMuted} />
        )}
      </View>

      <Text
        numberOfLines={2}
        style={{
          marginTop: 12,
          minHeight: 40,
          fontFamily: ListifyFonts.bold,
          fontSize: 15,
          lineHeight: 20,
          color: colors.textPrimary,
          ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
        }}
      >
        {title}
      </Text>

      <Text
        numberOfLines={1}
        style={{
          marginTop: 2,
          minHeight: 16,
          fontFamily: ListifyFonts.regular,
          fontSize: 12,
          lineHeight: 16,
          color: colors.textTertiary,
          ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
        }}
      >
        {subtext ?? " "}
      </Text>

      <View
        style={{
          marginTop: 12,
          flexDirection: "row",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
          style={{
            flex: 1,
            minWidth: 0,
            fontFamily: ListifyFonts.bold,
            fontSize: 16,
            lineHeight: 22,
            color: colors.textPrimary,
            ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
          }}
        >
          {priceLabel}
        </Text>

        {distanceLabel ? (
          <Text
            numberOfLines={1}
            style={{
              flexShrink: 0,
              paddingBottom: 2,
              fontFamily: ListifyFonts.medium,
              fontSize: 12,
              lineHeight: 16,
              color: colors.textSecondary,
              ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
            }}
          >
            {distanceLabel}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export const CategoryGridTile = memo(CategoryGridTileImpl);

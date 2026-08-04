import { MaterialIcons } from "@expo/vector-icons";
import { memo, useEffect } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { ListingTimeBadge } from "@/components/listing-time-badge";
import { ListifyFonts, ListifyTypography } from "@/constants/typography";
import { formatPrice as libFormatPrice } from "@/lib/currency";
import { Image } from "@/lib/nativewind-interop";
import { useTheme } from "@/providers/theme-provider";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type ListingItemsGridCardProps = {
  title: string;
  subtitle?: string;
  price?: number | null;
  currency?: string | null;
  isoCountryCode?: string | null;
  image?: string;
  width: number;
  distanceLabel?: string;
  createdAt?: string | null;
  isSaved?: boolean;
  /** Horizontal scroll rows — same card height, tight 2-line title slot */
  layout?: "default" | "carousel";
  onPress: () => void;
  onToggleSave?: () => void;
};

function formatPrice(
  price?: number | null,
  currency?: string | null,
  isoCountryCode?: string | null,
) {
  if (price == null) return "On request";
  return libFormatPrice(price, currency, isoCountryCode);
}

const CAROUSEL_TITLE_LINE_HEIGHT = 20;
const CAROUSEL_TITLE_HEIGHT = CAROUSEL_TITLE_LINE_HEIGHT * 2;

export function getListingGridCarouselHeight(width: number) {
  return width + 12 + CAROUSEL_TITLE_HEIGHT + 10 + 24 + 16;
}

function ListingItemsGridCardImpl({
  title,
  subtitle,
  price,
  currency,
  isoCountryCode,
  image,
  width,
  distanceLabel,
  createdAt,
  isSaved = false,
  layout = "default",
  onPress,
  onToggleSave,
}: ListingItemsGridCardProps) {
  const { colors, isDark } = useTheme();
  const cardBackground = isDark ? colors.surfaceElevated : colors.card;
  const imageSize = width;
  const isCarousel = layout === "carousel";
  const cardHeight = isCarousel ? getListingGridCarouselHeight(width) : undefined;
  const savedProgress = useSharedValue(isSaved ? 1 : 0);
  const priceTextBase = {
    fontFamily: ListifyFonts.bold,
    color: colors.textPrimary,
    lineHeight: 24,
    ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
  } as const;

  useEffect(() => {
    savedProgress.value = withSpring(isSaved ? 1 : 0, {
      damping: 14,
      stiffness: 220,
    });
  }, [isSaved, savedProgress]);

  const idleSaveBg = isDark ? "#3F3F46" : "#2D2D2D";
  const buttonBgStyle = useAnimatedStyle(() => ({
    backgroundColor: savedProgress.value > 0.5 ? colors.primary : idleSaveBg,
    transform: [
      {
        scale: interpolate(savedProgress.value, [0, 0.5, 1], [1, 1.12, 1]),
      },
    ],
  }));

  const plusIconStyle = useAnimatedStyle(() => ({
    opacity: interpolate(savedProgress.value, [0, 0.4], [1, 0]),
    transform: [
      { scale: interpolate(savedProgress.value, [0, 1], [1, 0.4]) },
      { rotate: `${interpolate(savedProgress.value, [0, 1], [0, -90])}deg` },
    ],
  }));

  const checkIconStyle = useAnimatedStyle(() => ({
    opacity: savedProgress.value,
    transform: [
      { scale: interpolate(savedProgress.value, [0, 1], [0.3, 1]) },
    ],
  }));

  return (
    <Pressable
      onPress={onPress}
      style={{
        width,
        paddingHorizontal: 14,
        paddingBottom: 16,
        backgroundColor: cardBackground,
        ...(cardHeight != null ? { height: cardHeight } : null),
        borderRadius: 24,
        borderWidth: 1,
        borderColor: colors.border,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: isDark ? 0.28 : 0.06,
        shadowRadius: 12,
        elevation: 3,
      }}
    >
      <View
        className="overflow-hidden rounded-2xl"
        style={{
          height: imageSize,
          width: imageSize,
          alignSelf: "center",
          backgroundColor: colors.surfaceMuted,
        }}
      >
        {image ? (
          <Image
            source={image}
            contentFit="contain"
            cachePolicy="memory-disk"
            recyclingKey={image}
            transition={120}
            style={{
              width: imageSize,
              height: imageSize,
            }}
          />
        ) : (
          <View className="h-full w-full items-center justify-center">
            <MaterialIcons name="image" size={36} color={colors.iconMuted} />
          </View>
        )}

        <ListingTimeBadge date={createdAt} />

        {onToggleSave ? (
          <AnimatedPressable
            onPress={(e) => {
              e.stopPropagation();
              onToggleSave();
            }}
            hitSlop={8}
            className="absolute right-2 top-2 h-9 w-9 items-center justify-center rounded-full"
            style={buttonBgStyle}
          >
            <Animated.View
              style={[{ position: "absolute" }, plusIconStyle]}
              pointerEvents="none"
            >
              <MaterialIcons name="add" size={20} color="#FFFFFF" />
            </Animated.View>
            <Animated.View
              style={[{ position: "absolute" }, checkIconStyle]}
              pointerEvents="none"
            >
              <MaterialIcons name="check" size={20} color="#FFFFFF" />
            </Animated.View>
          </AnimatedPressable>
        ) : null}
      </View>

      <Text
        className="mt-3 text-[15px]"
        style={{
          fontFamily: ListifyFonts.medium,
          color: colors.textPrimary,
          lineHeight: isCarousel ? CAROUSEL_TITLE_LINE_HEIGHT : undefined,
          minHeight: isCarousel ? CAROUSEL_TITLE_HEIGHT : undefined,
          ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
        }}
        numberOfLines={2}
      >
        {title}
      </Text>

      {subtitle ? (
        <Text
          className="mt-0.5 text-[12px]"
          style={{ ...ListifyTypography.label, color: colors.textSecondary }}
          numberOfLines={1}
        >
          {subtitle}
        </Text>
      ) : null}

      <View className="mt-2.5 w-full flex-row items-end justify-between gap-2">
        <Text
          className="min-w-0 flex-1 text-[16px]"
          style={priceTextBase}
          adjustsFontSizeToFit
          minimumFontScale={0.72}
          numberOfLines={isCarousel ? 1 : 2}
        >
          {formatPrice(price, currency, isoCountryCode)}
        </Text>
        {distanceLabel ? (
          <Text
            className="shrink-0 pb-0.5 text-[12px]"
            style={{
              fontFamily: ListifyFonts.medium,
              color: colors.textSecondary,
              lineHeight: 16,
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

// Memoized: avoids re-rendering every grid card when only one row's state changes.
export const ListingItemsGridCard = memo(ListingItemsGridCardImpl);

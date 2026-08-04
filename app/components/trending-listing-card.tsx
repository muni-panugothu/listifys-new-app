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
import { ListifyTypography } from "@/constants/typography";
import { formatPrice as libFormatPrice } from "@/lib/currency";
import { Image } from "@/lib/nativewind-interop";
import { useTheme } from "@/providers/theme-provider";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type TrendingListingCardProps = {
  id: string;
  title: string;
  price?: number | null;
  currency?: string | null;
  isoCountryCode?: string | null;
  image: string;
  cardWidth: number;
  distanceLabel?: string;
  createdAt?: string | null;
  isSaved: boolean;
  isOffline?: boolean;
  onPress: () => void;
  onToggleSave: () => void;
};

function formatPrice(
  price?: number | null,
  currency?: string | null,
  isoCountryCode?: string | null,
) {
  if (price == null) return "Price on request";
  return libFormatPrice(price, currency, isoCountryCode);
}

function TrendingListingCardImpl({
  title,
  price,
  currency,
  isoCountryCode,
  image,
  cardWidth,
  distanceLabel,
  createdAt,
  isSaved,
  isOffline,
  onPress,
  onToggleSave,
}: TrendingListingCardProps) {
  const { colors } = useTheme();
  const imageHeight = cardWidth * 1.15;
  const savedProgress = useSharedValue(isSaved ? 1 : 0);

  useEffect(() => {
    savedProgress.value = withSpring(isSaved ? 1 : 0, {
      damping: 14,
      stiffness: 220,
    });
  }, [isSaved, savedProgress]);

  const buttonBgStyle = useAnimatedStyle(() => ({
    backgroundColor: savedProgress.value > 0.5 ? "#27BB97" : "#2D2D2D",
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
    <Pressable onPress={onPress} style={{ width: cardWidth }}>
      <View
        className="overflow-hidden rounded-[28px]"
        style={{
          height: imageHeight,
          backgroundColor: colors.surface,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.1,
          shadowRadius: 14,
          elevation: 5,
        }}
      >
        <Image
          source={image}
          contentFit="cover"
          transition={120}
          cachePolicy="memory-disk"
          recyclingKey={typeof image === "string" ? image : undefined}
          className="h-full w-full"
        />
        <ListingTimeBadge date={createdAt} />
        <AnimatedPressable
          onPress={(e) => {
            e.stopPropagation();
            if (!isOffline) onToggleSave();
          }}
          hitSlop={10}
          disabled={isOffline}
          className="absolute right-3 top-3 h-9 w-9 items-center justify-center rounded-full"
          style={[
            buttonBgStyle,
            { opacity: isOffline ? 0.45 : 1 },
          ]}
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
      </View>
      <Text
        className="mt-3 text-[15px]"
        style={{
          ...ListifyTypography.sectionTitle,
          color: colors.textPrimary,
          ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
        }}
        numberOfLines={1}
      >
        {title}
      </Text>
      <View className="mt-1 w-full">
        <View className="flex-row items-start justify-between gap-2">
          <Text
            className="flex-1 text-[16px]"
            style={{
              ...ListifyTypography.accent,
              color: colors.primary,
              lineHeight: 24,
              ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
            }}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
            numberOfLines={2}
          >
            {formatPrice(price, currency, isoCountryCode)}
          </Text>
          {distanceLabel ? (
            <Text
              className="shrink-0 pt-0.5 text-[13px]"
              style={{
                ...ListifyTypography.label,
                color: colors.textSecondary,
                lineHeight: 18,
                ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
              }}
            >
              {distanceLabel}
            </Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

// Memoized: scrolling the home feed should not re-render every card when an
// unrelated piece of state (e.g. unread counts) updates.
export const TrendingListingCard = memo(TrendingListingCardImpl);

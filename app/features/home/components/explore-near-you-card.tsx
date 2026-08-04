import { MaterialIcons } from "@expo/vector-icons";
import { memo, useEffect } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { ListifyTypography } from "@/constants/typography";
import { Image } from "@/lib/nativewind-interop";
import { useTheme } from "@/providers/theme-provider";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type ExploreNearYouCardProps = {
  id: string;
  image: string;
  location: string;
  title: string;
  dateTime: string;
  cardWidth: number;
  isSaved: boolean;
  onPress: () => void;
  onToggleSave: () => void;
};

function ExploreNearYouCardImpl({
  image,
  location,
  title,
  dateTime,
  cardWidth,
  isSaved,
  onPress,
  onToggleSave,
}: ExploreNearYouCardProps) {
  const { colors } = useTheme();
  const imageHeight = cardWidth * 1.15;
  const savedProgress = useSharedValue(isSaved ? 1 : 0);

  useEffect(() => {
    savedProgress.value = withSpring(isSaved ? 1 : 0, {
      damping: 14,
      stiffness: 220,
    });
  }, [isSaved, savedProgress]);

  const bookmarkStyle = useAnimatedStyle(() => ({
    transform: [
      {
        scale: interpolate(savedProgress.value, [0, 0.5, 1], [1, 1.15, 1]),
      },
    ],
  }));

  return (
    <Pressable onPress={onPress} style={{ width: cardWidth }}>
      <View
        className="overflow-hidden rounded-[20px]"
        style={{
          height: imageHeight,
          backgroundColor: colors.skeleton,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.08,
          shadowRadius: 10,
          elevation: 3,
        }}
      >
        <Image
          source={image}
          contentFit="cover"
          transition={140}
          cachePolicy="memory-disk"
          recyclingKey={image}
          className="h-full w-full"
        />

        {/* Bookmark button (top-right) */}
        <AnimatedPressable
          onPress={(e) => {
            e.stopPropagation();
            onToggleSave();
          }}
          hitSlop={10}
          className="absolute right-3 top-3 h-9 w-9 items-center justify-center rounded-full"
          style={[
            bookmarkStyle,
            {
              backgroundColor: "rgba(255,255,255,0.92)",
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.12,
              shadowRadius: 4,
              elevation: 3,
            },
          ]}
        >
          <MaterialIcons
            name={isSaved ? "bookmark" : "bookmark-border"}
            size={20}
            color={isSaved ? colors.primary : "#1B3022"}
          />
        </AnimatedPressable>
      </View>

      {/* Location with pin icon */}
      <View className="mt-2 flex-row items-center gap-1">
        <MaterialIcons name="location-on" size={14} color={colors.primary} />
        <Text
          className="flex-1 text-[12px]"
          style={{
            ...ListifyTypography.label,
            color: colors.textSecondary,
            ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
          }}
          numberOfLines={1}
        >
          {location}
        </Text>
      </View>

      {/* Title */}
      <Text
        className="mt-1 text-[15px]"
        style={{
          ...ListifyTypography.sectionTitle,
          color: colors.textPrimary,
          lineHeight: 20,
          ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
        }}
        numberOfLines={2}
      >
        {title}
      </Text>

      {/* Date & Time */}
      <Text
        className="mt-1 text-[12px]"
        style={{
          ...ListifyTypography.caption,
          color: colors.textSecondary,
          ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
        }}
        numberOfLines={1}
      >
        {dateTime}
      </Text>
    </Pressable>
  );
}

export const ExploreNearYouCard = memo(ExploreNearYouCardImpl);

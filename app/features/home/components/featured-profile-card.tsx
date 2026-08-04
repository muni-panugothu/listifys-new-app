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

export type FeaturedProfileStat = {
  icon: keyof typeof MaterialIcons.glyphMap;
  value: string;
};

export type FeaturedProfileCardProps = {
  id: string;
  name: string;
  subtitle: string;
  avatar: string;
  stats: FeaturedProfileStat[];
  eventDate: string;
  cardWidth: number;
  isSaved: boolean;
  onPress: () => void;
  onToggleSave: () => void;
};

function FeaturedProfileCardImpl({
  name,
  subtitle,
  avatar,
  stats,
  eventDate,
  cardWidth,
  isSaved,
  onPress,
  onToggleSave,
}: FeaturedProfileCardProps) {
  const { colors } = useTheme();
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

  const AVATAR_SIZE = 78;

  return (
    <Pressable
      onPress={onPress}
      style={{ width: cardWidth, paddingTop: AVATAR_SIZE / 2 }}
    >
      <View
        className="rounded-[22px]"
        style={{
          backgroundColor: colors.surfaceMuted,
          paddingTop: AVATAR_SIZE / 2 + 14,
          paddingBottom: 16,
          paddingHorizontal: 14,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 3 },
          shadowOpacity: 0.05,
          shadowRadius: 8,
          elevation: 2,
        }}
      >
        {/* Circular avatar overlapping the top edge */}
        <View
          className="absolute self-center overflow-hidden rounded-full border-[3px]"
          style={{
            width: AVATAR_SIZE,
            height: AVATAR_SIZE,
            top: -AVATAR_SIZE / 2,
            left: cardWidth / 2 - AVATAR_SIZE / 2,
            borderColor: colors.surface,
            backgroundColor: colors.surface,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.15,
            shadowRadius: 8,
            elevation: 5,
          }}
        >
          <Image
            source={avatar}
            contentFit="cover"
            transition={140}
            cachePolicy="memory-disk"
            recyclingKey={avatar}
            className="h-full w-full"
          />
        </View>

        {/* Bookmark button (top-right) */}
        <AnimatedPressable
          onPress={(e) => {
            e.stopPropagation();
            onToggleSave();
          }}
          hitSlop={10}
          className="absolute right-3 top-3 h-8 w-8 items-center justify-center rounded-full"
          style={[
            bookmarkStyle,
            {
              backgroundColor: colors.surface,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.08,
              shadowRadius: 4,
              elevation: 2,
            },
          ]}
        >
          <MaterialIcons
            name={isSaved ? "bookmark" : "bookmark-border"}
            size={18}
            color={isSaved ? colors.primary : colors.icon}
          />
        </AnimatedPressable>

        {/* Name */}
        <Text
          className="mt-1 text-center text-[16px]"
          style={{
            ...ListifyTypography.sectionTitle,
            color: colors.textPrimary,
            ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
          }}
          numberOfLines={1}
        >
          {name}
        </Text>

        {/* Subtitle */}
        <Text
          className="mt-0.5 text-center text-[12px]"
          style={{
            ...ListifyTypography.label,
            color: colors.textSecondary,
            ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
          }}
          numberOfLines={1}
        >
          {subtitle}
        </Text>

        {/* Stats pill */}
        <View
          className="mt-3 flex-row items-center justify-around rounded-[14px] px-2 py-2"
          style={{ backgroundColor: colors.surfaceElevated }}
        >
          {stats.map((stat, idx) => (
            <View
              key={`${stat.icon}-${idx}`}
              className="flex-1 items-center"
              style={{
                borderRightWidth: idx < stats.length - 1 ? 1 : 0,
                borderRightColor: colors.border,
              }}
            >
              <MaterialIcons
                name={stat.icon}
                size={16}
                color={colors.icon}
              />
              <Text
                className="mt-0.5 text-[11px]"
                style={{
                  ...ListifyTypography.caption,
                  color: colors.textPrimary,
                  ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
                }}
                numberOfLines={1}
              >
                {stat.value}
              </Text>
            </View>
          ))}
        </View>

        {/* Event date */}
        <Text
          className="mt-3 text-center text-[12px]"
          style={{
            ...ListifyTypography.caption,
            color: colors.textSecondary,
            ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
          }}
          numberOfLines={1}
        >
          {eventDate}
        </Text>
      </View>
    </Pressable>
  );
}

export const FeaturedProfileCard = memo(FeaturedProfileCardImpl);

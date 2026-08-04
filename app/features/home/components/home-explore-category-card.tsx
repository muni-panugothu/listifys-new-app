import { LinearGradient } from "expo-linear-gradient";
import { memo } from "react";
import { Platform, Pressable, Text, View } from "react-native";

import { ListifyFonts } from "@/constants/typography";
import type { HomeExploreCategory } from "@/features/home/data/home-explore-categories";
import { Image } from "@/lib/nativewind-interop";
import { useTheme } from "@/providers/theme-provider";

type HomeExploreCategoryCardProps = {
  category: HomeExploreCategory;
  width: number;
  /** Card body height (icon overflow is added on top). */
  height: number;
  onPress: () => void;
};

/** How far the 3D icon pops above the card top edge. */
export const HOME_EXPLORE_ICON_OVERFLOW = 20;

function HomeExploreCategoryCardImpl({
  category,
  width,
  height,
  onPress,
}: HomeExploreCategoryCardProps) {
  const { isDark } = useTheme();
  const iconSize = Math.min(width * 0.72, 68);
  const totalHeight = height + HOME_EXPLORE_ICON_OVERFLOW;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        width,
        height: totalHeight,
        opacity: pressed ? 0.94 : 1,
      })}
    >
      <View
        style={{
          marginTop: HOME_EXPLORE_ICON_OVERFLOW,
          height,
          borderRadius: 16,
          overflow: "hidden",
          borderWidth: 1,
          borderColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.06)",
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 3 },
          shadowOpacity: isDark ? 0.28 : 0.06,
          shadowRadius: 8,
          elevation: 2,
          backgroundColor: isDark ? "#1C1C1F" : "#FFFFFF",
        }}
      >
        <LinearGradient
          colors={
            isDark ? ["#2A2430", "#1C1A1E", "#141216"] : category.gradient
          }
          start={{ x: 0.3, y: 0 }}
          end={{ x: 0.7, y: 1 }}
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "flex-end",
            paddingBottom: 8,
            paddingHorizontal: 4,
            paddingTop: iconSize * 0.08,
          }}
        >
          <Text
            numberOfLines={1}
            style={{
              fontFamily: ListifyFonts.bold,
              fontSize: category.label.length > 10 ? 11 : 12,
              textAlign: "center",
              color: isDark ? "#F9FAFB" : "#111827",
              ...(Platform.OS === "android"
                ? { includeFontPadding: false }
                : {}),
            }}
          >
            {category.label}
          </Text>
        </LinearGradient>
      </View>

      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          alignItems: "center",
          zIndex: 3,
          elevation: 6,
        }}
      >
        <Image
          source={category.icon}
          contentFit="contain"
          transition={120}
          cachePolicy="memory-disk"
          recyclingKey={`home-cat-${category.id}-v2`}
          style={{
            width: iconSize,
            height: iconSize,
            backgroundColor: "transparent",
          }}
        />
      </View>
    </Pressable>
  );
}

export const HomeExploreCategoryCard = memo(HomeExploreCategoryCardImpl);

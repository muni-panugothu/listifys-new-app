import { LinearGradient } from "expo-linear-gradient";
import { memo } from "react";
import { Dimensions, Platform, Text } from "react-native";

import { ListifyFonts } from "@/constants/typography";
import type { EventsCategoryConfig } from "@/features/events/data/events-category-config";
import { getCategoryHeroGradient, useEventsTheme } from "@/features/events/theme/events-theme";
import { Image } from "@/lib/nativewind-interop";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const H_PAD = 16;

type EventsCategoryHeroProps = {
  config: EventsCategoryConfig;
};

function EventsCategoryHeroImpl({ config }: EventsCategoryHeroProps) {
  const { isDark, colors, heroTitleText } = useEventsTheme();
  const gradient = getCategoryHeroGradient(
    config.heroGradient,
    config.heroGradientLight,
    isDark,
    colors,
  );

  return (
    <LinearGradient
      colors={gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        paddingHorizontal: H_PAD,
        paddingTop: 8,
        paddingBottom: 20,
        minHeight: 120,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <Text
        style={{
          flex: 1,
          fontFamily: ListifyFonts.bold,
          fontSize: 42,
          lineHeight: 46,
          color: heroTitleText,
          letterSpacing: -0.5,
          ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
        }}
      >
        {config.label}
      </Text>

      <Image
        source={config.icon}
        contentFit="contain"
        cachePolicy="memory-disk"
        recyclingKey={`hero-${config.id}-${isDark ? "d" : "l"}`}
        style={{
          width: SCREEN_WIDTH * 0.34,
          height: SCREEN_WIDTH * 0.34,
          marginRight: -4,
        }}
      />
    </LinearGradient>
  );
}

export const EventsCategoryHero = memo(EventsCategoryHeroImpl);

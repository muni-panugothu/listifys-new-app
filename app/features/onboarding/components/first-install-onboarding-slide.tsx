import { Image } from "@/lib/nativewind-interop";
import { LinearGradient } from "expo-linear-gradient";
import { useMemo } from "react";
import {
  type ImageSourcePropType,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";

import { ListifyColors } from "@/constants/listify-theme";
import { ListifyFonts } from "@/constants/typography";
import { type FirstInstallSlide } from "@/features/onboarding/data/first-install-slides";

type FirstInstallOnboardingSlideProps = {
  slide: FirstInstallSlide;
  width: number;
  isDark: boolean;
};

const HERO_HEIGHT_RATIO = 0.74;
const HERO_WIDTH_SCALE = 1.08;
const HERO_HEIGHT_SCALE = 1.14;
const TITLE_FONT_SIZE = 30;
const TITLE_LINE_HEIGHT = 38;
const BODY_FONT_SIZE = 17;
const BODY_LINE_HEIGHT = 26;

export function FirstInstallOnboardingSlide({
  slide,
  width,
  isDark,
}: FirstInstallOnboardingSlideProps) {
  const { height } = useWindowDimensions();
  const heroHeight = Math.min(height * HERO_HEIGHT_RATIO, width * 1.45);

  const colors = useMemo(
    () => ({
      bg: isDark ? "#0F1412" : "#FFFFFF",
      heading: isDark ? "#F3F4F6" : "#111827",
      body: isDark ? "#9CA3AF" : "#6B7280",
      accent: ListifyColors.primary,
      dotMap: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.035)",
    }),
    [isDark],
  );

  return (
    <View style={[styles.slide, { width, backgroundColor: colors.bg }]}>
      <DottedMapBackground color={colors.dotMap} />

      <View style={styles.heroWrap}>
        <Image
          source={slide.illustration as ImageSourcePropType}
          contentFit="contain"
          contentPosition="bottom"
          style={{
            width: width * HERO_WIDTH_SCALE,
            height: heroHeight * HERO_HEIGHT_SCALE,
            maxHeight: height * 0.68,
          }}
        />
        <LinearGradient
          colors={[
            "transparent",
            isDark ? "rgba(15,20,18,0.35)" : "rgba(255,255,255,0.4)",
            colors.bg,
          ]}
          locations={[0.68, 0.9, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      </View>

      <View style={styles.copyBlock}>
        <Text style={styles.title} accessibilityRole="header">
          {slide.titleParts.map((part, index) => (
            <Text
              key={`${slide.id}-title-${index}`}
              style={{
                fontFamily: ListifyFonts.bold,
                fontSize: TITLE_FONT_SIZE,
                lineHeight: TITLE_LINE_HEIGHT,
                color: part.accent ? colors.accent : colors.heading,
              }}
            >
              {part.text}
            </Text>
          ))}
        </Text>
        <Text
          style={{
            fontFamily: ListifyFonts.regular,
            fontSize: BODY_FONT_SIZE,
            lineHeight: BODY_LINE_HEIGHT,
            color: colors.body,
            textAlign: "center",
            marginTop: 10,
            paddingHorizontal: 4,
          }}
        >
          {slide.body}
        </Text>
      </View>
    </View>
  );
}

function DottedMapBackground({ color }: { color: string }) {
  const dots = useMemo(() => {
    const rows = 14;
    const cols = 10;
    const items: { key: string; top: `${number}%`; left: `${number}%` }[] = [];
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        if ((r + c) % 3 !== 0) continue;
        items.push({
          key: `${r}-${c}`,
          top: `${6 + r * 6.5}%`,
          left: `${4 + c * 9.5}%`,
        });
      }
    }
    return items;
  }, []);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {dots.map((dot) => (
        <View
          key={dot.key}
          style={{
            position: "absolute",
            top: dot.top,
            left: dot.left,
            width: 3,
            height: 3,
            borderRadius: 1.5,
            backgroundColor: color,
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  slide: {
    flex: 1,
    alignItems: "center",
  },
  heroWrap: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  copyBlock: {
    width: "100%",
    paddingHorizontal: 24,
    paddingTop: 0,
    paddingBottom: 32,
    marginTop: -16,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  title: {
    textAlign: "center",
  },
});

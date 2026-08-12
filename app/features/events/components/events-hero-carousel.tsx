import { MaterialIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";

import { ListifyFonts } from "@/constants/typography";
import {
  EVENTS_HERO_SLIDES,
  type EventsHeroSlide,
} from "@/features/events/data/events-discovery";
import { Image } from "@/lib/nativewind-interop";
import { useTheme } from "@/providers/theme-provider";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const H_PAD = 16;
const CARD_WIDTH = SCREEN_WIDTH - H_PAD * 2;
const CARD_HEIGHT = CARD_WIDTH * 0.52;
const AUTO_SCROLL_MS = 4200;

type EventsHeroCarouselProps = {
  onExplore: () => void;
};

function EventsHeroCarouselImpl({ onExplore }: EventsHeroCarouselProps) {
  const { colors } = useTheme();
  const listRef = useRef<FlatList<EventsHeroSlide>>(null);
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);

  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  useEffect(() => {
    if (EVENTS_HERO_SLIDES.length <= 1) return;
    const timer = setInterval(() => {
      const next = (indexRef.current + 1) % EVENTS_HERO_SLIDES.length;
      listRef.current?.scrollToIndex({ index: next, animated: true });
      setIndex(next);
    }, AUTO_SCROLL_MS);
    return () => clearInterval(timer);
  }, []);

  const onMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      const next = Math.round(x / (CARD_WIDTH + 12));
      if (next >= 0 && next < EVENTS_HERO_SLIDES.length) setIndex(next);
    },
    [],
  );

  const renderItem = useCallback(
    ({ item }: { item: EventsHeroSlide }) => (
      <Pressable
        onPress={onExplore}
        style={{
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
          marginRight: 12,
          borderRadius: 22,
          overflow: "hidden",
        }}
      >
        <Image
          source={item.image}
          contentFit="cover"
          transition={160}
          cachePolicy="memory-disk"
          recyclingKey={item.id}
          style={{ position: "absolute", inset: 0 }}
        />
        <LinearGradient
          colors={[item.gradient[0], item.gradient[1], item.gradient[2]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ position: "absolute", inset: 0, opacity: 0.78 }}
        />
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.55)"]}
          style={{ position: "absolute", inset: 0 }}
        />
        <View
          style={{
            flex: 1,
            paddingHorizontal: 20,
            paddingTop: 22,
            paddingBottom: 18,
            justifyContent: "space-between",
          }}
        >
          <View>
            <Text
              style={{
                fontFamily: ListifyFonts.medium,
                fontSize: 22,
                color: "#FFFFFF",
                fontStyle: Platform.OS === "ios" ? "italic" : "normal",
                ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
              }}
            >
              {item.eyebrow}
            </Text>
            <Text
              style={{
                fontFamily: ListifyFonts.bold,
                fontSize: 34,
                lineHeight: 38,
                color: "#FDE047",
                letterSpacing: 1,
                marginTop: 2,
                textShadowColor: "rgba(34,197,94,0.65)",
                textShadowOffset: { width: 2, height: 2 },
                textShadowRadius: 0,
                ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
              }}
            >
              {item.title}
            </Text>
            <Text
              style={{
                fontFamily: ListifyFonts.regular,
                fontSize: 13,
                color: "rgba(255,255,255,0.9)",
                marginTop: 8,
                ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
              }}
            >
              ✦ {item.subtitle} ✦
            </Text>
          </View>

          <Pressable
            onPress={onExplore}
            style={({ pressed }) => ({
              alignSelf: "flex-start",
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              backgroundColor: "#3B82F6",
              borderRadius: 999,
              paddingHorizontal: 16,
              paddingVertical: 10,
              opacity: pressed ? 0.88 : 1,
            })}
          >
            <Text
              style={{
                fontFamily: ListifyFonts.semiBold,
                fontSize: 13,
                color: "#FFFFFF",
                ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
              }}
            >
              {item.ctaLabel}
            </Text>
            <MaterialIcons name="chevron-right" size={18} color="#FFFFFF" />
          </Pressable>
        </View>
      </Pressable>
    ),
    [onExplore],
  );

  return (
    <View style={{ marginBottom: 8 }}>
      <FlatList
        ref={listRef}
        horizontal
        data={EVENTS_HERO_SLIDES}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: H_PAD }}
        decelerationRate="fast"
        snapToInterval={CARD_WIDTH + 12}
        snapToAlignment="start"
        onMomentumScrollEnd={onMomentumEnd}
        getItemLayout={(_, i) => ({
          length: CARD_WIDTH + 12,
          offset: (CARD_WIDTH + 12) * i,
          index: i,
        })}
        removeClippedSubviews
        initialNumToRender={2}
        windowSize={3}
      />

      {/* Pagination dots */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "center",
          gap: 6,
          marginTop: 12,
        }}
      >
        {EVENTS_HERO_SLIDES.map((slide, i) => (
          <View
            key={slide.id}
            style={{
              width: i === index ? 18 : 6,
              height: 6,
              borderRadius: 3,
              backgroundColor:
                i === index ? colors.accentPurple : `${colors.accentPurple}59`,
            }}
          />
        ))}
      </View>
    </View>
  );
}

export const EventsHeroCarousel = memo(EventsHeroCarouselImpl);

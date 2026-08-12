import { MaterialIcons } from "@expo/vector-icons";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";

import { ListifyFonts } from "@/constants/typography";
import { Image } from "@/lib/nativewind-interop";
import { useTheme } from "@/providers/theme-provider";

export type HomeSpotlightItem = {
  id: string;
  title: string;
  image: string;
  category: string;
  distanceLabel?: string;
  priceLabel?: string;
  isSaved?: boolean;
};

type HomeSpotlightCarouselProps = {
  items: HomeSpotlightItem[];
  onPressItem: (item: HomeSpotlightItem) => void;
  onToggleSave?: (item: HomeSpotlightItem) => void;
  onSeeAll?: () => void;
};

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_WIDTH = SCREEN_WIDTH * 0.66;
const CARD_GAP = 4;
const SIDE_PAD = (SCREEN_WIDTH - CARD_WIDTH) / 2;
const IMAGE_HEIGHT = CARD_WIDTH * 1.16;
const META_HEIGHT = 52;
const CARD_HEIGHT = IMAGE_HEIGHT + META_HEIGHT;
const ITEM_SIZE = CARD_WIDTH + CARD_GAP;
const AUTO_MS = 2800;
const RESUME_MS = 3200;
const SIDE_SCALE = 0.88;

function badgeForCategory(category: string) {
  const c = category.toLowerCase();
  if (c.includes("event") || c.includes("music")) return "🎵 Music Event";
  if (c.includes("comed")) return "🎤 Comedy Show";
  if (c.includes("theater") || c.includes("theatre") || c.includes("perform"))
    return "🎭 Live Performance";
  if (c.includes("sport")) return "🏃 Sports Event";
  if (c.includes("fest")) return "🎉 Festival";
  if (c.includes("food") || c.includes("dining") || c.includes("drink"))
    return "🍽️ Dining Experience";
  if (c.includes("famil") || c.includes("kid") || c.includes("toy"))
    return "🎪 Family Event";
  if (c.includes("movie") || c.includes("film")) return "🎬 Now in Theatres";
  if (c.includes("propert") || c.includes("real")) return "🏠 Featured Stay";
  if (c.includes("job")) return "💼 Hiring Now";
  if (c.includes("service")) return "✨ Top Service";
  if (c.includes("fashion") || c.includes("electronic") || c.includes("mobil"))
    return "🛍️ Hot Deal";
  if (c.includes("vehicle") || c.includes("car")) return "🚗 Featured Ride";
  return "✨ Featured";
}

function metaLine(item: HomeSpotlightItem) {
  return [item.distanceLabel, item.priceLabel].filter(Boolean).join(" · ");
}

type SpotlightCardProps = {
  item: HomeSpotlightItem;
  index: number;
  scrollX: SharedValue<number>;
  onPress: () => void;
  onToggleSave?: () => void;
  isDark: boolean;
  textPrimary: string;
  textSecondary: string;
  iconMuted: string;
};

function SpotlightCardImpl({
  item,
  index,
  scrollX,
  onPress,
  onToggleSave,
  isDark,
  textPrimary,
  textSecondary,
  iconMuted,
}: SpotlightCardProps) {
  const animatedStyle = useAnimatedStyle(() => {
    const input = [
      (index - 1) * ITEM_SIZE,
      index * ITEM_SIZE,
      (index + 1) * ITEM_SIZE,
    ];
    const scale = interpolate(
      scrollX.value,
      input,
      [SIDE_SCALE, 1, SIDE_SCALE],
      Extrapolation.CLAMP,
    );
    const opacity = interpolate(
      scrollX.value,
      input,
      [0.72, 1, 0.72],
      Extrapolation.CLAMP,
    );
    return {
      transform: [{ scale }],
      opacity,
    };
  });

  const sideVeilStyle = useAnimatedStyle(() => {
    const input = [
      (index - 1) * ITEM_SIZE,
      index * ITEM_SIZE,
      (index + 1) * ITEM_SIZE,
    ];
    const veil = interpolate(
      scrollX.value,
      input,
      [0.28, 0, 0.28],
      Extrapolation.CLAMP,
    );
    return { opacity: veil };
  });

  const line = metaLine(item);

  return (
    <Animated.View
      style={[
        {
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
          marginRight: CARD_GAP,
          justifyContent: "flex-start",
        },
        animatedStyle,
      ]}
    >
      <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.96 : 1 })}>
        <View
          style={{
            width: CARD_WIDTH,
            height: IMAGE_HEIGHT,
            borderRadius: 20,
            overflow: "hidden",
            backgroundColor: isDark ? "#1F1F23" : "#E5E7EB",
          }}
        >
          {item.image ? (
            <Image
              source={item.image}
              contentFit="cover"
              transition={160}
              cachePolicy="memory-disk"
              recyclingKey={item.id}
              style={{ width: "100%", height: "100%" }}
            />
          ) : (
            <View
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <MaterialIcons name="image" size={36} color={iconMuted} />
            </View>
          )}

          {/* Soft veil on side cards to mimic light blur */}
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: isDark
                  ? "rgba(10,10,12,0.55)"
                  : "rgba(255,255,255,0.45)",
              },
              sideVeilStyle,
            ]}
          />

          <View
            style={{
              position: "absolute",
              top: 12,
              left: 12,
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: 999,
              backgroundColor: "rgba(30,30,34,0.72)",
              maxWidth: CARD_WIDTH * 0.68,
            }}
          >
            <Text
              numberOfLines={1}
              style={{
                fontFamily: ListifyFonts.medium,
                fontSize: 11,
                color: "#FFFFFF",
                ...(Platform.OS === "android"
                  ? { includeFontPadding: false }
                  : {}),
              }}
            >
              {badgeForCategory(item.category)}
            </Text>
          </View>

          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              onToggleSave?.();
            }}
            hitSlop={8}
            style={{
              position: "absolute",
              top: 10,
              right: 10,
              width: 32,
              height: 32,
              borderRadius: 16,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(255,255,255,0.95)",
            }}
          >
            <MaterialIcons
              name={item.isSaved ? "bookmark" : "local-fire-department"}
              size={16}
              color="#111827"
            />
          </Pressable>
        </View>

        <Text
          numberOfLines={1}
          style={{
            marginTop: 8,
            fontFamily: ListifyFonts.bold,
            fontSize: 14,
            color: textPrimary,
            ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
          }}
        >
          {item.title}
        </Text>

        {line ? (
          <Text
            numberOfLines={1}
            style={{
              marginTop: 3,
              fontFamily: ListifyFonts.medium,
              fontSize: 12,
              color: textSecondary,
              ...(Platform.OS === "android"
                ? { includeFontPadding: false }
                : {}),
            }}
          >
            {line}
          </Text>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

const SpotlightCard = memo(SpotlightCardImpl);

function HomeSpotlightCarouselImpl({
  items,
  onPressItem,
  onToggleSave,
  onSeeAll,
}: HomeSpotlightCarouselProps) {
  const { colors, isDark } = useTheme();
  const listRef = useRef<Animated.FlatList<HomeSpotlightItem>>(null);
  const indexRef = useRef(0);
  const pausedRef = useRef(false);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollX = useSharedValue(0);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  useEffect(() => {
    if (items.length <= 1) return;
    const timer = setInterval(() => {
      if (pausedRef.current) return;
      const next = (indexRef.current + 1) % items.length;
      try {
        listRef.current?.scrollToOffset({
          offset: next * ITEM_SIZE,
          animated: true,
        });
        setIndex(next);
      } catch {
        // ignore
      }
    }, AUTO_MS);
    return () => clearInterval(timer);
  }, [items.length]);

  useEffect(
    () => () => {
      if (resumeTimer.current) clearTimeout(resumeTimer.current);
    },
    [],
  );

  const pauseAuto = useCallback(() => {
    pausedRef.current = true;
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
  }, []);

  const scheduleResume = useCallback(() => {
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => {
      pausedRef.current = false;
    }, RESUME_MS);
  }, []);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollX.value = e.contentOffset.x;
    },
  });

  const onMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      const next = Math.round(x / ITEM_SIZE);
      if (next >= 0 && next < items.length) setIndex(next);
      scheduleResume();
    },
    [items.length, scheduleResume],
  );

  const renderItem = useCallback(
    ({ item, index: i }: { item: HomeSpotlightItem; index: number }) => (
      <SpotlightCard
        item={item}
        index={i}
        scrollX={scrollX}
        isDark={isDark}
        textPrimary={colors.textPrimary}
        textSecondary={colors.textSecondary}
        iconMuted={colors.iconMuted}
        onPress={() => onPressItem(item)}
        onToggleSave={() => onToggleSave?.(item)}
      />
    ),
    [
      colors.iconMuted,
      colors.textPrimary,
      colors.textSecondary,
      isDark,
      onPressItem,
      onToggleSave,
      scrollX,
    ],
  );

  if (items.length === 0) return null;

  return (
    <View style={{ marginBottom: 8 }}>
      <View
        style={{
          paddingHorizontal: 16,
          marginBottom: 10,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text
          style={{
            fontFamily: ListifyFonts.bold,
            fontSize: 22,
            color: colors.textPrimary,
            ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
          }}
        >
          In the spotlight
        </Text>
        {onSeeAll ? (
          <Pressable onPress={onSeeAll} hitSlop={8}>
            <Text
              style={{
                fontFamily: ListifyFonts.medium,
                fontSize: 12,
                color: colors.primary,
              }}
            >
              See all
            </Text>
          </Pressable>
        ) : null}
      </View>

      <Animated.FlatList
        ref={listRef}
        horizontal
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={ITEM_SIZE}
        snapToAlignment="start"
        disableIntervalMomentum
        contentContainerStyle={{
          paddingHorizontal: SIDE_PAD,
          paddingVertical: 6,
        }}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onScrollBeginDrag={pauseAuto}
        onMomentumScrollEnd={onMomentumEnd}
        getItemLayout={(_, i) => ({
          length: ITEM_SIZE,
          offset: ITEM_SIZE * i,
          index: i,
        })}
        removeClippedSubviews
        initialNumToRender={3}
        maxToRenderPerBatch={3}
        windowSize={5}
      />

      <View
        style={{
          marginTop: 8,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
        }}
      >
        {items.map((item, i) => {
          const activeDot = i === index;
          return (
            <View
              key={item.id}
              style={{
                height: 6,
                width: activeDot ? 18 : 6,
                borderRadius: 999,
                backgroundColor: activeDot
                  ? isDark
                    ? "#D1D5DB"
                    : "#6B7280"
                  : isDark
                    ? "rgba(255,255,255,0.22)"
                    : "#D1D5DB",
              }}
            />
          );
        })}
      </View>
    </View>
  );
}

export const HomeSpotlightCarousel = memo(HomeSpotlightCarouselImpl);

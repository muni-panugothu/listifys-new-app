import { memo, useMemo } from "react";
import {
  Dimensions,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { ListifyFonts } from "@/constants/typography";
import {
  EVENTS_EXPLORE_CATEGORIES,
  type EventsExploreCategory,
} from "@/features/events/data/events-discovery";
import { Image } from "@/lib/nativewind-interop";
import { useEventsTheme } from "@/features/events/theme/events-theme";
import { useTheme } from "@/providers/theme-provider";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const H_PAD = 16;
const GAP = 12;
const COLS_VISIBLE = 2.7;
const CARD_WIDTH = (SCREEN_WIDTH - H_PAD * 2 - GAP * 2) / COLS_VISIBLE;
const CARD_HEIGHT = CARD_WIDTH * 1.28;
const ICON_SIZE = CARD_WIDTH * 0.96;

type Column = {
  id: string;
  items: EventsExploreCategory[];
};

type EventsExploreGridProps = {
  selectedId: string | null;
  onSelect: (category: EventsExploreCategory) => void;
};

function chunkIntoColumns(items: EventsExploreCategory[]): Column[] {
  const columns: Column[] = [];
  for (let i = 0; i < items.length; i += 2) {
    const pair = items.slice(i, i + 2);
    columns.push({ id: `col-${pair[0].id}`, items: pair });
  }
  return columns;
}

function CategoryCard({
  item,
  active,
  onPress,
  isDark,
  labelColor,
  borderIdle,
  gradientColors,
}: {
  item: EventsExploreCategory;
  active: boolean;
  onPress: () => void;
  isDark: boolean;
  labelColor: string;
  borderIdle: string;
  gradientColors: [string, string, string];
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        borderRadius: 22,
        overflow: "hidden",
        opacity: pressed ? 0.92 : 1,
        borderWidth: 1,
        borderColor: active
          ? isDark
            ? "rgba(232,121,249,0.7)"
            : "rgba(192,38,211,0.55)"
          : borderIdle,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: isDark ? 0.28 : 0.08,
        shadowRadius: 10,
        elevation: isDark ? 4 : 2,
      })}
    >
      <LinearGradient
        colors={gradientColors}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={{
          flex: 1,
          paddingTop: 12,
          paddingHorizontal: 8,
          alignItems: "center",
        }}
      >
        <Text
          numberOfLines={1}
          style={{
            fontFamily: ListifyFonts.semiBold,
            fontSize: 14,
            color: labelColor,
            textAlign: "center",
            ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
          }}
        >
          {item.label}
        </Text>

        <View
          style={{
            flex: 1,
            width: "100%",
            alignItems: "center",
            justifyContent: "flex-end",
            paddingBottom: 6,
          }}
        >
          <Image
            source={item.icon}
            contentFit="contain"
            transition={120}
            cachePolicy="memory-disk"
            recyclingKey={`${item.id}-nobg`}
            style={{
              width: ICON_SIZE,
              height: ICON_SIZE,
              backgroundColor: "transparent",
            }}
          />
        </View>
      </LinearGradient>
    </Pressable>
  );
}

function EventsExploreGridImpl({
  selectedId,
  onSelect,
}: EventsExploreGridProps) {
  const { colors, isDark } = useTheme();
  const { border: borderIdle } = useEventsTheme();
  const columns = useMemo(
    () => chunkIntoColumns(EVENTS_EXPLORE_CATEGORIES),
    [],
  );

  const gradientColors = useMemo(
    (): [string, string, string] =>
      isDark
        ? ["#2C2C30", "#1A1A1D", "#0E0E10"]
        : [colors.surface, colors.surfaceElevated, colors.background],
    [colors.background, colors.surface, colors.surfaceElevated, isDark],
  );

  const labelColor = colors.textPrimary;

  return (
    <View style={{ marginTop: 8 }}>
      <Text
        style={{
          fontFamily: ListifyFonts.bold,
          fontSize: 22,
          color: colors.textPrimary,
          paddingHorizontal: H_PAD,
          marginBottom: 16,
          ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
        }}
      >
        Explore events
      </Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: H_PAD,
          paddingBottom: 4,
        }}
        decelerationRate="fast"
        snapToInterval={CARD_WIDTH + GAP}
        snapToAlignment="start"
      >
        {columns.map((col) => (
          <View key={col.id} style={{ gap: GAP, marginRight: GAP }}>
            {col.items.map((cat) => (
              <CategoryCard
                key={cat.id}
                item={cat}
                active={selectedId === cat.id}
                onPress={() => onSelect(cat)}
                isDark={isDark}
                labelColor={labelColor}
                borderIdle={borderIdle}
                gradientColors={gradientColors}
              />
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

export const EventsExploreGrid = memo(EventsExploreGridImpl);

import { MaterialIcons } from "@expo/vector-icons";
import { memo, useCallback, useRef } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

import { ListifyFonts } from "@/constants/typography";
import {
  EVENTS_WEEK_CATEGORIES,
  type EventsWeekCategory,
} from "@/features/events/data/events-discovery";
import { Image } from "@/lib/nativewind-interop";
import { useTheme } from "@/providers/theme-provider";

const CIRCLE = 78;
const RING = 3;
const ITEM_WIDTH = CIRCLE + 20;

type EventsWeekCategoryStripProps = {
  selectedId: string | null;
  onSelect: (category: EventsWeekCategory) => void;
  periodLabel?: string;
  menuOpen?: boolean;
  onPressTitle?: (anchorBottom: number) => void;
};

function CategoryItem({
  item,
  active,
  onSelect,
  surfaceMuted,
  textPrimary,
}: {
  item: EventsWeekCategory;
  active: boolean;
  onSelect: (category: EventsWeekCategory) => void;
  surfaceMuted: string;
  textPrimary: string;
}) {
  return (
    <Pressable
      onPress={() => onSelect(item)}
      style={{
        width: ITEM_WIDTH,
        alignItems: "center",
        marginRight: 10,
      }}
    >
      <View
        style={{
          width: CIRCLE + RING * 2,
          height: CIRCLE + RING * 2,
          borderRadius: (CIRCLE + RING * 2) / 2,
          padding: RING,
          borderWidth: 2.5,
          borderColor: active ? "#E879F9" : "#C026D3",
          shadowColor: "#E879F9",
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: active ? 0.55 : 0.25,
          shadowRadius: active ? 10 : 6,
          elevation: active ? 6 : 2,
        }}
      >
        <View
          style={{
            width: CIRCLE,
            height: CIRCLE,
            borderRadius: CIRCLE / 2,
            overflow: "hidden",
            backgroundColor: surfaceMuted,
          }}
        >
          <Image
            source={item.image}
            contentFit="cover"
            transition={140}
            cachePolicy="memory-disk"
            recyclingKey={item.id}
            style={{ width: CIRCLE, height: CIRCLE }}
          />
        </View>
      </View>
      <Text
        numberOfLines={2}
        style={{
          marginTop: 8,
          fontFamily: ListifyFonts.medium,
          fontSize: 12,
          lineHeight: 15,
          textAlign: "center",
          color: textPrimary,
          width: ITEM_WIDTH,
          ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
        }}
      >
        {item.label}
      </Text>
    </Pressable>
  );
}

function EventsWeekCategoryStripImpl({
  selectedId,
  onSelect,
  periodLabel = "this week",
  menuOpen = false,
  onPressTitle,
}: EventsWeekCategoryStripProps) {
  const { colors } = useTheme();
  const titleRef = useRef<View>(null);

  const handleTitlePress = useCallback(() => {
    titleRef.current?.measureInWindow((_x, y, _w, h) => {
      onPressTitle?.(y + h + 6);
    });
  }, [onPressTitle]);

  return (
    <View style={{ marginTop: 20, marginBottom: 8 }}>
      <Pressable
        ref={titleRef}
        onPress={handleTitlePress}
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
          marginBottom: 14,
          gap: 2,
        }}
      >
        <Text
          style={{
            fontFamily: ListifyFonts.regular,
            fontSize: 20,
            color: colors.textPrimary,
            ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
          }}
        >
          What's happening{" "}
          <Text
            style={{
              fontFamily: ListifyFonts.bold,
              textDecorationLine: "underline",
            }}
          >
            {periodLabel}
          </Text>
        </Text>
        <MaterialIcons
          name={menuOpen ? "keyboard-arrow-up" : "keyboard-arrow-down"}
          size={24}
          color={colors.icon}
          style={{ marginTop: 2 }}
        />
      </Pressable>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 4 }}
      >
        {EVENTS_WEEK_CATEGORIES.map((item) => (
          <CategoryItem
            key={item.id}
            item={item}
            active={selectedId === item.id}
            onSelect={onSelect}
            surfaceMuted={colors.surfaceMuted}
            textPrimary={colors.textPrimary}
          />
        ))}
      </ScrollView>
    </View>
  );
}

export const EventsWeekCategoryStrip = memo(EventsWeekCategoryStripImpl);

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

import { ListifyFonts } from "@/constants/typography";
import { useTheme } from "@/providers/theme-provider";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const ITEM_WIDTH = 128;
const SIDE_PADDING = (SCREEN_WIDTH - ITEM_WIDTH) / 2;

type CategorySnapSubcategoryPickerProps = {
  items: string[];
  selected: string;
  onSelect: (item: string) => void;
};

export function CategorySnapSubcategoryPicker({
  items,
  selected,
  onSelect,
}: CategorySnapSubcategoryPickerProps) {
  const { colors } = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  const [centerIndex, setCenterIndex] = useState(() =>
    Math.max(0, items.indexOf(selected)),
  );

  const scrollToIndex = useCallback(
    (index: number, animated = true) => {
      const clamped = Math.max(0, Math.min(items.length - 1, index));
      scrollRef.current?.scrollTo({
        x: clamped * ITEM_WIDTH,
        animated,
      });
      setCenterIndex(clamped);
    },
    [items.length],
  );

  useEffect(() => {
    const idx = items.indexOf(selected);
    if (idx >= 0) {
      setCenterIndex(idx);
      scrollRef.current?.scrollTo({ x: idx * ITEM_WIDTH, animated: false });
    }
  }, [selected, items]);

  const handleMomentumEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / ITEM_WIDTH);
    const clamped = Math.max(0, Math.min(items.length - 1, index));
    setCenterIndex(clamped);
    if (items[clamped] !== selected) {
      onSelect(items[clamped]);
    }
  };

  return (
    <View style={{ height: 56, justifyContent: "center" }}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={ITEM_WIDTH}
        snapToAlignment="center"
        decelerationRate="fast"
        contentContainerStyle={{
          paddingHorizontal: SIDE_PADDING,
          alignItems: "center",
        }}
        onMomentumScrollEnd={handleMomentumEnd}
      >
        {items.map((label, index) => {
          const distance = Math.abs(index - centerIndex);
          const isActive = distance === 0;
          const isAdjacent = distance === 1;

          return (
            <Pressable
              key={label}
              onPress={() => {
                scrollToIndex(index);
                onSelect(label);
              }}
              style={{
                width: ITEM_WIDTH,
                alignItems: "center",
                justifyContent: "center",
                paddingVertical: 8,
              }}
            >
              <Text
                numberOfLines={1}
                style={{
                  fontFamily: isActive ? ListifyFonts.bold : ListifyFonts.regular,
                  fontSize: isActive ? 22 : isAdjacent ? 17 : 15,
                  color: isActive ? colors.textPrimary : colors.textTertiary,
                  textAlign: "center",
                }}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

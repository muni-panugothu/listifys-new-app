import { memo, useCallback } from "react";
import {
  FlatList,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";

import { ListifyFonts } from "@/constants/typography";
import type { CategorySubTab } from "@/features/events/data/events-category-config";
import { useEventsTheme } from "@/features/events/theme/events-theme";

type EventsCategoryTabsProps = {
  tabs: CategorySubTab[];
  activeTabId: string;
  accentColor: string;
  onSelect: (tab: CategorySubTab) => void;
};

function EventsCategoryTabsImpl({
  tabs,
  activeTabId,
  accentColor,
  onSelect,
}: EventsCategoryTabsProps) {
  const { background, divider, tabActiveText, tabInactiveText } = useEventsTheme();
  const keyExtractor = useCallback((item: CategorySubTab) => item.id, []);

  const renderItem = useCallback(
    ({ item }: { item: CategorySubTab }) => {
      const active = item.id === activeTabId;
      return (
        <Pressable
          onPress={() => onSelect(item)}
          style={({ pressed }) => ({
            marginRight: 22,
            paddingBottom: 10,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Text
            style={{
              fontFamily: active ? ListifyFonts.bold : ListifyFonts.medium,
              fontSize: 15,
              color: active ? tabActiveText : tabInactiveText,
              ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
            }}
          >
            {item.label}
          </Text>
          {active ? (
            <View
              style={{
                marginTop: 8,
                height: 2,
                borderRadius: 1,
                backgroundColor: accentColor,
                width: "100%",
              }}
            />
          ) : (
            <View style={{ marginTop: 8, height: 2 }} />
          )}
        </Pressable>
      );
    },
    [accentColor, activeTabId, onSelect, tabActiveText, tabInactiveText],
  );

  return (
    <View
      style={{
        backgroundColor: background,
        borderBottomWidth: 1,
        borderBottomColor: divider,
      }}
    >
      <FlatList
        horizontal
        data={tabs}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4 }}
        decelerationRate="fast"
      />
    </View>
  );
}

export const EventsCategoryTabs = memo(EventsCategoryTabsImpl);

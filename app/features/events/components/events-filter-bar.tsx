import { MaterialIcons } from "@expo/vector-icons";
import { memo, useCallback } from "react";
import {
  FlatList,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";

import { ListifyFonts } from "@/constants/typography";
import {
  EVENTS_ALL_FILTER_CHIPS,
  type EventsAllFilterChip,
  type EventsAllFilterId,
} from "@/features/events/data/events-all-filters";
import { useTheme } from "@/providers/theme-provider";

type EventsFilterBarProps = {
  selectedId: EventsAllFilterId;
  onSelect: (id: EventsAllFilterId) => void;
};

function EventsFilterBarImpl({ selectedId, onSelect }: EventsFilterBarProps) {
  const { colors, isDark } = useTheme();

  const keyExtractor = useCallback(
    (item: EventsAllFilterChip) => item.id,
    [],
  );

  const renderItem = useCallback(
    ({ item }: { item: EventsAllFilterChip }) => {
      const active = selectedId === item.id;
      return (
        <Pressable
          onPress={() => onSelect(item.id)}
          style={({ pressed }) => ({
            marginRight: 8,
            height: 36,
            paddingHorizontal: 14,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: active
              ? colors.textPrimary
              : isDark
                ? colors.borderStrong
                : "#D1D5DB",
            backgroundColor: active
              ? isDark
                ? colors.surfaceElevated
                : "#FFFFFF"
              : isDark
                ? colors.surface
                : "#FFFFFF",
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          {item.icon ? (
            <MaterialIcons
              name={item.icon}
              size={16}
              color={colors.textPrimary}
            />
          ) : null}
          <Text
            style={{
              fontFamily: active ? ListifyFonts.semiBold : ListifyFonts.medium,
              fontSize: 13,
              color: colors.textPrimary,
              ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
            }}
          >
            {item.label}
          </Text>
          {item.chevron ? (
            <MaterialIcons
              name="keyboard-arrow-down"
              size={18}
              color={colors.icon}
            />
          ) : null}
        </Pressable>
      );
    },
    [colors, isDark, onSelect, selectedId],
  );

  return (
    <View
      style={{
        backgroundColor: colors.background,
        paddingTop: 8,
        paddingBottom: 10,
        borderBottomWidth: StyleHairline,
        borderBottomColor: isDark ? colors.border : "#ECEEF1",
      }}
    >
      <FlatList
        horizontal
        data={EVENTS_ALL_FILTER_CHIPS}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16 }}
        decelerationRate="fast"
        keyboardShouldPersistTaps="handled"
      />
    </View>
  );
}

const StyleHairline = Platform.OS === "ios" ? 0.5 : 1;

export const EventsFilterBar = memo(EventsFilterBarImpl);

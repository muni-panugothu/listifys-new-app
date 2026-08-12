import { MaterialIcons } from "@expo/vector-icons";
import { memo, useCallback, useMemo } from "react";
import {
  FlatList,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";

import { ListifyFonts } from "@/constants/typography";
import type {
  CategoryDateFilterId,
  CategorySortId,
} from "@/features/events/data/events-category-config";
import { useEventsTheme } from "@/features/events/theme/events-theme";

export type CategoryFilterChip = {
  id: string;
  label: string;
  chevron?: boolean;
  icon?: "place";
  kind: "sort" | "date" | "dateFilter" | "proximity";
  dateFilter?: CategoryDateFilterId;
};

export const CATEGORY_FILTER_CHIPS: CategoryFilterChip[] = [
  { id: "sort", label: "Sort by", chevron: true, kind: "sort" },
  { id: "date-menu", label: "Date", chevron: true, kind: "date" },
  { id: "today", label: "Today", kind: "dateFilter", dateFilter: "today" },
  { id: "tomorrow", label: "Tomorrow", kind: "dateFilter", dateFilter: "tomorrow" },
  {
    id: "weekend",
    label: "This Weekend",
    kind: "dateFilter",
    dateFilter: "weekend",
  },
  { id: "under-10km", label: "Under 10km", icon: "place", kind: "proximity" },
];

type EventsCategoryFilterBarProps = {
  sort: CategorySortId;
  dateFilter: CategoryDateFilterId;
  under10km: boolean;
  onSortPress: () => void;
  onDatePress: () => void;
  onDateFilterSelect: (filter: CategoryDateFilterId) => void;
  onToggleUnder10km: () => void;
  onClearSort: () => void;
  onClearDateFilter: () => void;
  onClearUnder10km: () => void;
};

function isChipActive(
  item: CategoryFilterChip,
  sort: CategorySortId,
  dateFilter: CategoryDateFilterId,
  under10km: boolean,
): boolean {
  if (item.kind === "dateFilter") return item.dateFilter === dateFilter;
  if (item.kind === "proximity") return under10km;
  if (item.kind === "sort") return sort !== "newest";
  return false;
}

function canClearChip(item: CategoryFilterChip): boolean {
  return (
    item.kind === "dateFilter" ||
    item.kind === "proximity" ||
    item.kind === "sort"
  );
}

function buildOrderedChips(
  chips: CategoryFilterChip[],
  sort: CategorySortId,
  dateFilter: CategoryDateFilterId,
  under10km: boolean,
): CategoryFilterChip[] {
  const active: CategoryFilterChip[] = [];
  const rest: CategoryFilterChip[] = [];

  for (const chip of chips) {
    if (isChipActive(chip, sort, dateFilter, under10km) && canClearChip(chip)) {
      active.push(chip);
    } else {
      rest.push(chip);
    }
  }

  return [...active, ...rest];
}

function EventsCategoryFilterBarImpl({
  sort,
  dateFilter,
  under10km,
  onSortPress,
  onDatePress,
  onDateFilterSelect,
  onToggleUnder10km,
  onClearSort,
  onClearDateFilter,
  onClearUnder10km,
}: EventsCategoryFilterBarProps) {
  const {
    background,
    chipBg,
    chipBorder,
    chipText,
    chipActiveBg,
    chipActiveBorder,
    chipIconMuted,
  } = useEventsTheme();

  const orderedChips = useMemo(
    () => buildOrderedChips(CATEGORY_FILTER_CHIPS, sort, dateFilter, under10km),
    [dateFilter, sort, under10km],
  );

  const keyExtractor = useCallback((item: CategoryFilterChip) => item.id, []);

  const handleClear = useCallback(
    (item: CategoryFilterChip) => {
      if (item.kind === "sort") onClearSort();
      else if (item.kind === "proximity") onClearUnder10km();
      else if (item.kind === "dateFilter") onClearDateFilter();
    },
    [onClearDateFilter, onClearSort, onClearUnder10km],
  );

  const renderItem = useCallback(
    ({ item }: { item: CategoryFilterChip }) => {
      const active = isChipActive(item, sort, dateFilter, under10km);
      const showClear = active && canClearChip(item);

      const onPress = () => {
        if (item.kind === "sort") onSortPress();
        else if (item.kind === "date") onDatePress();
        else if (item.kind === "proximity") onToggleUnder10km();
        else if (item.dateFilter) onDateFilterSelect(item.dateFilter);
      };

      const label =
        item.kind === "sort" && sort === "nearby"
          ? "Nearby"
          : item.kind === "sort" && sort === "date"
            ? "By Date"
            : item.label;

      return (
        <View
          style={{
            marginRight: 8,
            height: 36,
            paddingLeft: 14,
            paddingRight: showClear ? 6 : 14,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: active ? chipActiveBorder : chipBorder,
            backgroundColor: active ? chipActiveBg : chipBg,
            flexDirection: "row",
            alignItems: "center",
          }}
        >
          <Pressable
            onPress={onPress}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              opacity: pressed ? 0.85 : 1,
              paddingRight: showClear ? 2 : 0,
            })}
          >
            {item.icon ? (
              <MaterialIcons
                name={item.icon}
                size={15}
                color={active ? chipText : chipIconMuted}
              />
            ) : null}
            <Text
              style={{
                fontFamily: active ? ListifyFonts.semiBold : ListifyFonts.medium,
                fontSize: 13,
                color: chipText,
                ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
              }}
            >
              {label}
            </Text>
            {!showClear && item.chevron ? (
              <MaterialIcons
                name="keyboard-arrow-down"
                size={18}
                color={chipIconMuted}
              />
            ) : null}
          </Pressable>
          {showClear ? (
            <Pressable
              onPress={() => handleClear(item)}
              hitSlop={8}
              style={({ pressed }) => ({
                width: 24,
                height: 24,
                alignItems: "center",
                justifyContent: "center",
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <MaterialIcons name="close" size={16} color={chipText} />
            </Pressable>
          ) : null}
        </View>
      );
    },
    [
      chipActiveBg,
      chipActiveBorder,
      chipBg,
      chipBorder,
      chipIconMuted,
      chipText,
      dateFilter,
      handleClear,
      onDateFilterSelect,
      onDatePress,
      onSortPress,
      onToggleUnder10km,
      sort,
      under10km,
    ],
  );

  return (
    <View style={{ paddingTop: 10, paddingBottom: 12, backgroundColor: background }}>
      <FlatList
        horizontal
        data={orderedChips}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16 }}
        decelerationRate="fast"
        extraData={`${sort}-${dateFilter}-${under10km}-${orderedChips.map((c) => c.id).join(",")}`}
      />
    </View>
  );
}

export const EventsCategoryFilterBar = memo(EventsCategoryFilterBarImpl);

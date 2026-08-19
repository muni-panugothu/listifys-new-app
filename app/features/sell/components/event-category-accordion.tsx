import { MaterialIcons } from "@expo/vector-icons";
import { memo, useCallback, useEffect, useRef } from "react";
import {
  AccessibilityInfo,
  Dimensions,
  Pressable,
  ScrollView,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { ListifyFonts } from "@/constants/typography";
import {
  EVENT_MAIN_CATEGORY_LIST,
  getSubcategoriesForMain,
  type EventSubcategoryDef,
} from "@/features/events/data/events-form-schema";
import { useTheme } from "@/providers/theme-provider";

const ANIM_MS = 250;
const SUBCATEGORY_ROW_HEIGHT = 48;
const SUBCATEGORY_MAX_HEIGHT = Math.min(
  Dimensions.get("window").height * 0.36,
  300,
);

export type EventCategoryAccordionSelection = {
  selectedCategory: string;
  selectedSubcategory: string;
  expandedCategory: string;
  apiSubcategory: string;
};

type EventCategoryAccordionProps = {
  selectedCategory: string;
  selectedSubcategory: string;
  expandedCategory: string;
  onMainCategoryPress: (slug: string) => void;
  onSubcategoryPress: (
    mainSlug: string,
    eventTypeSlug: string,
    apiSubcategory: string,
  ) => void;
  onRowLayout?: (slug: string, y: number) => void;
};

type SubcategoryRowProps = {
  label: string;
  selected: boolean;
  isLast: boolean;
  onPress: () => void;
};

const SubcategoryRow = memo(function SubcategoryRow({
  label,
  selected,
  isLast,
  onPress,
}: SubcategoryRowProps) {
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        minHeight: SUBCATEGORY_ROW_HEIGHT,
        paddingLeft: 28,
        paddingRight: 16,
        paddingVertical: 12,
        backgroundColor: pressed
          ? colors.surfaceMuted
          : selected
            ? colors.primarySoft
            : "transparent",
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: colors.border,
      })}
    >
      <Text
        style={{
          flex: 1,
          fontFamily: selected ? ListifyFonts.semiBold : ListifyFonts.regular,
          fontSize: 14,
          color: selected ? colors.primary : colors.textSecondary,
        }}
      >
        {label}
      </Text>
      {selected ? (
        <MaterialIcons name="check-circle" size={18} color={colors.primary} />
      ) : null}
    </Pressable>
  );
});

type AccordionItemProps = {
  slug: string;
  label: string;
  isExpanded: boolean;
  isMainActive: boolean;
  hasSubcategorySelected: boolean;
  selectedSubcategory: string;
  isLast: boolean;
  onMainPress: (slug: string) => void;
  onSubcategoryPress: (
    mainSlug: string,
    eventTypeSlug: string,
    apiSubcategory: string,
  ) => void;
  onRowLayout?: (slug: string, y: number) => void;
};

const AccordionItem = memo(function AccordionItem({
  slug,
  label,
  isExpanded,
  isMainActive,
  hasSubcategorySelected,
  selectedSubcategory,
  isLast,
  onMainPress,
  onSubcategoryPress,
  onRowLayout,
}: AccordionItemProps) {
  const { colors } = useTheme();
  const progress = useSharedValue(isExpanded ? 1 : 0);
  const reduceMotionRef = useRef(false);
  const subcategories = getSubcategoriesForMain(slug);
  const contentHeight = Math.min(
    subcategories.length * SUBCATEGORY_ROW_HEIGHT,
    SUBCATEGORY_MAX_HEIGHT,
  );
  const needsInnerScroll = subcategories.length * SUBCATEGORY_ROW_HEIGHT > SUBCATEGORY_MAX_HEIGHT;

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      reduceMotionRef.current = enabled;
    });
  }, []);

  useEffect(() => {
    const duration = reduceMotionRef.current ? 0 : ANIM_MS;
    progress.value = withTiming(isExpanded ? 1 : 0, {
      duration,
      easing: Easing.out(Easing.cubic),
    });
  }, [isExpanded, progress]);

  const panelStyle = useAnimatedStyle(() => ({
    maxHeight: interpolate(progress.value, [0, 1], [0, contentHeight]),
    opacity: interpolate(progress.value, [0, 0.35, 1], [0, 0.6, 1]),
  }));

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [
      {
        rotate: `${interpolate(progress.value, [0, 1], [0, 90])}deg`,
      },
    ],
  }));

  const handleMainLayout = useCallback(
    (event: LayoutChangeEvent) => {
      onRowLayout?.(slug, event.nativeEvent.layout.y);
    },
    [onRowLayout, slug],
  );

  const renderSubcategory = useCallback(
    (item: { slug: string; label: string; apiSubcategory: string }, index: number) => (
      <SubcategoryRow
        key={item.slug}
        label={item.label}
        selected={isMainActive && selectedSubcategory === item.slug}
        isLast={index === subcategories.length - 1}
        onPress={() => onSubcategoryPress(slug, item.slug, item.apiSubcategory)}
      />
    ),
    [isMainActive, onSubcategoryPress, selectedSubcategory, slug, subcategories.length],
  );

  const subcategoryPanel =
    subcategories.length === 0 ? (
      <View style={{ paddingHorizontal: 28, paddingVertical: 14 }}>
        <Text
          style={{
            fontFamily: ListifyFonts.regular,
            fontSize: 13,
            color: colors.textTertiary,
          }}
        >
          No event types available for this category.
        </Text>
      </View>
    ) : needsInnerScroll ? (
      <ScrollView
        nestedScrollEnabled
        showsVerticalScrollIndicator
        keyboardShouldPersistTaps="handled"
        style={{ maxHeight: SUBCATEGORY_MAX_HEIGHT }}
        bounces={false}
      >
        {subcategories.map(renderSubcategory)}
      </ScrollView>
    ) : (
      <View>{subcategories.map(renderSubcategory)}</View>
    );

  return (
    <View onLayout={handleMainLayout}>
      <Pressable
        onPress={() => onMainPress(slug)}
        accessibilityRole="button"
        accessibilityState={{ expanded: isExpanded, selected: isMainActive }}
        accessibilityLabel={`${label}${isExpanded ? ", expanded" : ""}${hasSubcategorySelected ? ", type selected" : ""}`}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          minHeight: 52,
          paddingHorizontal: 16,
          paddingVertical: 14,
          backgroundColor: isExpanded
            ? colors.primarySoft
            : pressed
              ? colors.surfaceMuted
              : "transparent",
          borderBottomWidth: isExpanded || !isLast ? 1 : 0,
          borderBottomColor: colors.border,
        })}
      >
        <Text
          style={{
            flex: 1,
            fontFamily: isMainActive ? ListifyFonts.semiBold : ListifyFonts.regular,
            fontSize: 15,
            color: isMainActive ? colors.primary : colors.textPrimary,
          }}
        >
          {label}
        </Text>
        {hasSubcategorySelected && !isExpanded ? (
          <MaterialIcons
            name="check-circle"
            size={20}
            color={colors.primary}
            style={{ marginRight: 6 }}
          />
        ) : null}
        <Animated.View style={chevronStyle}>
          <MaterialIcons
            name="chevron-right"
            size={22}
            color={isMainActive ? colors.primary : colors.iconMuted}
          />
        </Animated.View>
      </Pressable>

      <Animated.View
        style={[
          panelStyle,
          {
            overflow: "hidden",
            backgroundColor: colors.surfaceMuted,
            borderBottomWidth: isExpanded && !isLast ? 1 : 0,
            borderBottomColor: colors.border,
          },
        ]}
        accessibilityElementsHidden={!isExpanded}
        importantForAccessibility={isExpanded ? "yes" : "no-hide-descendants"}
      >
        {isExpanded ? subcategoryPanel : null}
      </Animated.View>
    </View>
  );
});

export const EventCategoryAccordion = memo(function EventCategoryAccordion({
  selectedCategory,
  selectedSubcategory,
  expandedCategory,
  onMainCategoryPress,
  onSubcategoryPress,
  onRowLayout,
}: EventCategoryAccordionProps) {
  const { colors } = useTheme();

  return (
    <View
      className="overflow-hidden rounded-2xl"
      style={{
        backgroundColor: colors.surface,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
        elevation: 2,
      }}
    >
      {EVENT_MAIN_CATEGORY_LIST.map((item, index) => {
        const isExpanded = expandedCategory === item.slug;
        const isMainActive = selectedCategory === item.slug;
        const hasSubcategorySelected =
          isMainActive && Boolean(selectedSubcategory);

        return (
          <AccordionItem
            key={item.slug}
            slug={item.slug}
            label={item.label}
            isExpanded={isExpanded}
            isMainActive={isMainActive}
            hasSubcategorySelected={hasSubcategorySelected}
            selectedSubcategory={selectedSubcategory}
            isLast={index === EVENT_MAIN_CATEGORY_LIST.length - 1}
            onMainPress={onMainCategoryPress}
            onSubcategoryPress={onSubcategoryPress}
            onRowLayout={onRowLayout}
          />
        );
      })}
    </View>
  );
});

export function getSubcategoryApiValue(
  mainSlug: string,
  eventTypeSlug: string,
): string | null {
  const subs = getSubcategoriesForMain(mainSlug);
  return subs.find((s) => s.slug === eventTypeSlug)?.apiSubcategory ?? null;
}

export type { EventSubcategoryDef };

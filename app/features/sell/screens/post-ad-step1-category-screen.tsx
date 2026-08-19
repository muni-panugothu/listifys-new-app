import { MaterialIcons } from "@expo/vector-icons";
import { type Href, useLocalSearchParams, useRouter } from "@/lib/safe-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BackHandler, Pressable, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import { SellFlowLayout, SellSectionCard } from "@/components/sell-flow-layout";
import { CATEGORY_MAP, type CategorySlug } from "@/constants/categories";
import { ListifyFonts } from "@/constants/typography";
import {
  resolveEventCategoryLabel,
  resolveEventTypeLabel,
} from "@/features/events/data/events-form-schema";
import { EventCategoryAccordion } from "@/features/sell/components/event-category-accordion";
import {
  EVENT_SUBCATEGORY_HINTS,
  sortEventSubcategories,
} from "@/features/events/data/events-subcategory-meta";
import type { KeyboardAwareScrollView } from "@/lib/safe-keyboard-controller";
import { useTheme } from "@/providers/theme-provider";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  setCategory,
  setEventCategory,
  setEventCategorySelection,
  setSubcategory as setSubcategoryAction,
} from "@/store/slices/post-form-slice";

const defaultCategorySlug: CategorySlug = "electronics";

const getCategoryParam = (value?: string | string[]) =>
  typeof value === "string" ? value : value?.[0];

const getValidCategorySlug = (value?: string | string[]): CategorySlug => {
  const slug = getCategoryParam(value);
  if (slug && slug in CATEGORY_MAP) return slug as CategorySlug;
  return defaultCategorySlug;
};

export function PostAdStep1CategoryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ category?: string | string[] }>();
  const dispatch = useAppDispatch();
  const { colors } = useTheme();
  const scrollRef = useRef<React.ElementRef<typeof KeyboardAwareScrollView>>(null);
  const rowOffsetsRef = useRef<Record<string, number>>({});
  const accordionTopRef = useRef(0);
  const navigatingRef = useRef(false);

  const categorySlug = getValidCategorySlug(params.category);
  const categoryConfig = CATEGORY_MAP[categorySlug];
  const subcategories = useMemo(() => {
    const list = categoryConfig?.subcategories ?? [];
    if (categorySlug === "events") return sortEventSubcategories(list);
    return list;
  }, [categoryConfig?.subcategories, categorySlug]);
  const isEventCategory = categorySlug === "events";
  const showSubcategorySearch = subcategories.length >= 3;

  const reduxSubcategory = useAppSelector((s) => s.postForm.subcategory);
  const reduxEventCategory = useAppSelector((s) => s.postForm.eventCategory);
  const reduxEventType = useAppSelector((s) => s.postForm.eventType);

  const [selectedCategory, setSelectedCategory] = useState(() => reduxEventCategory || "");
  const [selectedSubcategory, setSelectedSubcategory] = useState(() => reduxEventType || "");
  const [expandedCategory, setExpandedCategory] = useState(() => reduxEventCategory || "");
  const [apiSubcategory, setApiSubcategory] = useState(() => reduxSubcategory || "");

  const [selectedLegacySubcategory, setSelectedLegacySubcategory] = useState(() => {
    if (reduxSubcategory && subcategories.includes(reduxSubcategory)) {
      return reduxSubcategory;
    }
    return subcategories[0] ?? "";
  });
  const [searchQuery, setSearchQuery] = useState("");

  const scrollCategoryIntoView = useCallback((slug: string) => {
    requestAnimationFrame(() => {
      setTimeout(() => {
        const rowY = rowOffsetsRef.current[slug];
        if (rowY == null) return;
        scrollRef.current?.scrollTo({
          y: Math.max(0, accordionTopRef.current + rowY - 16),
          animated: true,
        });
      }, 260);
    });
  }, []);

  const handleBack = useCallback(() => {
    router.replace("/sell-entry" as Href);
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      const onHardwareBack = () => {
        handleBack();
        return true;
      };
      const sub = BackHandler.addEventListener("hardwareBackPress", onHardwareBack);
      return () => sub.remove();
    }, [handleBack]),
  );

  useEffect(() => {
    dispatch(setCategory(categorySlug));
    if (!isEventCategory) return;

    if (reduxEventCategory) {
      setSelectedCategory(reduxEventCategory);
      setExpandedCategory(reduxEventCategory);
    }
    if (reduxEventType) {
      setSelectedSubcategory(reduxEventType);
    }
    if (reduxSubcategory) {
      setApiSubcategory(reduxSubcategory);
    }
  }, [categorySlug, dispatch, isEventCategory, reduxEventCategory, reduxEventType, reduxSubcategory]);

  useEffect(() => {
    if (isEventCategory) return;

    const isValidForCategory = subcategories.includes(reduxSubcategory);
    if (isValidForCategory) {
      setSelectedLegacySubcategory(reduxSubcategory);
      dispatch(setSubcategoryAction(reduxSubcategory));
    } else {
      const firstSub = subcategories[0] ?? "";
      setSelectedLegacySubcategory(firstSub);
      dispatch(setSubcategoryAction(firstSub));
    }
  }, [dispatch, isEventCategory, reduxSubcategory, subcategories]);

  const handleMainCategoryPress = useCallback(
    (slug: string) => {
      if (expandedCategory === slug) {
        setExpandedCategory("");
        return;
      }

      const switching = selectedCategory !== "" && selectedCategory !== slug;
      setExpandedCategory(slug);
      setSelectedCategory(slug);

      if (switching) {
        setSelectedSubcategory("");
        setApiSubcategory("");
        dispatch(setEventCategory(slug));
      } else if (selectedCategory !== slug) {
        dispatch(setEventCategory(slug));
      }

      scrollCategoryIntoView(slug);
    },
    [dispatch, expandedCategory, scrollCategoryIntoView, selectedCategory],
  );

  const handleSubcategoryPress = useCallback(
    (mainSlug: string, eventTypeSlug: string, legacySubcategory: string) => {
      setSelectedCategory(mainSlug);
      setSelectedSubcategory(eventTypeSlug);
      setApiSubcategory(legacySubcategory);
      setExpandedCategory(mainSlug);
      dispatch(
        setEventCategorySelection({
          eventCategory: mainSlug,
          eventType: eventTypeSlug,
          subcategory: legacySubcategory,
        }),
      );
    },
    [dispatch],
  );

  const handleLegacySubcategorySelect = (sub: string) => {
    setSelectedLegacySubcategory(sub);
    dispatch(setSubcategoryAction(sub));
  };

  const filteredSubcategories = searchQuery.trim()
    ? subcategories.filter((s) =>
        s.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : subcategories;

  const eventFooterMeta = useMemo(() => {
    const main = resolveEventCategoryLabel(selectedCategory);
    const type = resolveEventTypeLabel(selectedCategory, selectedSubcategory);
    if (main && type) return `${main} › ${type}`;
    if (main) return `${main} › Select type`;
    return "Select category";
  }, [selectedCategory, selectedSubcategory]);

  const canContinueEvents =
    Boolean(selectedCategory) && Boolean(selectedSubcategory) && Boolean(apiSubcategory);

  const handleContinue = useCallback(() => {
    if (navigatingRef.current) return;

    if (isEventCategory) {
      if (!canContinueEvents) return;
      navigatingRef.current = true;
      dispatch(
        setEventCategorySelection({
          eventCategory: selectedCategory,
          eventType: selectedSubcategory,
          subcategory: apiSubcategory,
        }),
      );
      router.push("/post-ad-step2-details");
      setTimeout(() => {
        navigatingRef.current = false;
      }, 600);
      return;
    }

    if (!selectedLegacySubcategory.trim()) return;
    navigatingRef.current = true;
    dispatch(setSubcategoryAction(selectedLegacySubcategory));
    router.push("/post-ad-step2-details");
    setTimeout(() => {
      navigatingRef.current = false;
    }, 600);
  }, [
    apiSubcategory,
    canContinueEvents,
    dispatch,
    isEventCategory,
    router,
    selectedCategory,
    selectedLegacySubcategory,
    selectedSubcategory,
  ]);

  const handleRowLayout = useCallback((slug: string, y: number) => {
    rowOffsetsRef.current[slug] = y;
  }, []);

  return (
    <SellFlowLayout
      step={1}
      title={categoryConfig?.name ?? "Category"}
      subtitle={
        isEventCategory
          ? "Choose main category, then event type"
          : "Choose a subcategory"
      }
      keyboardPersistTaps="always"
      scrollRef={scrollRef}
      onBack={handleBack}
      rightAction={
        <Pressable
          onPress={() => router.replace("/sell-entry")}
          hitSlop={8}
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        >
          <Text
            style={{
              fontFamily: ListifyFonts.medium,
              fontSize: 13,
              color: colors.textSecondary,
            }}
          >
            Change
          </Text>
        </Pressable>
      }
      footerLabel="Selected"
      footerMeta={
        isEventCategory
          ? eventFooterMeta
          : `${categoryConfig?.name} › ${selectedLegacySubcategory}`
      }
      primaryLabel="Continue"
      primaryDisabled={isEventCategory ? !canContinueEvents : !selectedLegacySubcategory.trim()}
      onPrimaryPress={handleContinue}
    >
      {isEventCategory ? (
        <View
          style={{ marginBottom: 8 }}
          onLayout={(event) => {
            accordionTopRef.current = event.nativeEvent.layout.y;
          }}
        >
          <Text
            className="mb-3 text-[13px] uppercase tracking-wide"
            style={{ fontFamily: ListifyFonts.semiBold, color: colors.textTertiary }}
          >
            Main category
          </Text>
          <EventCategoryAccordion
            selectedCategory={selectedCategory}
            selectedSubcategory={selectedSubcategory}
            expandedCategory={expandedCategory}
            onMainCategoryPress={handleMainCategoryPress}
            onSubcategoryPress={handleSubcategoryPress}
            onRowLayout={handleRowLayout}
          />
        </View>
      ) : (
        <>
          {showSubcategorySearch ? (
            <View
              style={{
                marginBottom: 16,
                height: 48,
                flexDirection: "row",
                alignItems: "center",
                borderRadius: 16,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.inputBackground,
                paddingHorizontal: 16,
              }}
            >
              <MaterialIcons name="search" size={20} color={colors.iconMuted} />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder={`Search ${categoryConfig?.name ?? "subcategories"}...`}
                placeholderTextColor={colors.inputPlaceholder}
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="search"
                clearButtonMode="while-editing"
                style={{
                  flex: 1,
                  marginLeft: 8,
                  fontFamily: ListifyFonts.regular,
                  fontSize: 14,
                  color: colors.textPrimary,
                  paddingVertical: 0,
                }}
              />
              {searchQuery.length > 0 ? (
                <Pressable onPress={() => setSearchQuery("")} hitSlop={8}>
                  <MaterialIcons name="close" size={18} color={colors.iconMuted} />
                </Pressable>
              ) : null}
            </View>
          ) : null}

          <SellSectionCard>
            {filteredSubcategories.length === 0 ? (
              <View style={{ alignItems: "center", paddingVertical: 32 }}>
                <MaterialIcons name="search-off" size={36} color={colors.borderStrong} />
                <Text
                  style={{
                    marginTop: 8,
                    fontFamily: ListifyFonts.regular,
                    fontSize: 14,
                    color: colors.textSecondary,
                  }}
                >
                  No subcategories match &quot;{searchQuery}&quot;
                </Text>
              </View>
            ) : null}
            {filteredSubcategories.map((sub, index) => {
              const isSelected = sub === selectedLegacySubcategory;
              const hint = EVENT_SUBCATEGORY_HINTS[sub];
              return (
                <Pressable
                  key={sub}
                  onPress={() => handleLegacySubcategorySelect(sub)}
                  style={({ pressed }) => ({
                    flexDirection: "row",
                    alignItems: "center",
                    paddingHorizontal: 16,
                    paddingVertical: hint ? 13 : 15,
                    backgroundColor: pressed ? colors.surfaceMuted : "transparent",
                    borderBottomWidth:
                      index < filteredSubcategories.length - 1 ? 1 : 0,
                    borderBottomColor: colors.border,
                  })}
                >
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text
                      style={{
                        fontFamily: isSelected
                          ? ListifyFonts.semiBold
                          : ListifyFonts.regular,
                        fontSize: 15,
                        color: isSelected ? colors.textPrimary : colors.textSecondary,
                      }}
                    >
                      {sub}
                    </Text>
                    {hint ? (
                      <Text
                        style={{
                          marginTop: 3,
                          fontFamily: ListifyFonts.regular,
                          fontSize: 12,
                          lineHeight: 16,
                          color: colors.textTertiary,
                        }}
                      >
                        {hint}
                      </Text>
                    ) : null}
                  </View>
                  <View
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      borderWidth: 2,
                      borderColor: isSelected ? colors.textPrimary : colors.borderStrong,
                      backgroundColor: isSelected ? colors.textPrimary : "transparent",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {isSelected ? (
                      <View
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 4,
                          backgroundColor: colors.background,
                        }}
                      />
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </SellSectionCard>
        </>
      )}
    </SellFlowLayout>
  );
}

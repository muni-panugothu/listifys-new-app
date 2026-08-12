import { MaterialIcons } from "@expo/vector-icons";
import { type Href, useLocalSearchParams, useRouter } from "@/lib/safe-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BackHandler, Pressable, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import { SellFlowLayout, SellSectionCard } from "@/components/sell-flow-layout";
import { CATEGORY_MAP, type CategorySlug } from "@/constants/categories";
import { ListifyFonts } from "@/constants/typography";
import { useTheme } from "@/providers/theme-provider";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  setCategory,
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

  const categorySlug = getValidCategorySlug(params.category);
  const categoryConfig = CATEGORY_MAP[categorySlug];
  const subcategories = useMemo(
    () => categoryConfig?.subcategories ?? [],
    [categorySlug],
  );
  const showSubcategorySearch = subcategories.length >= 3;

  // Read the current Redux subcategory so we can restore it when this screen
  // remounts (e.g. user pressed Back from step 2 via router.replace).
  const reduxSubcategory = useAppSelector((s) => s.postForm.subcategory);
  // Keep a stable ref so the useEffect below can read the latest value without
  // adding it as a dependency (which would reset on every user selection).
  const reduxSubcategoryRef = useRef(reduxSubcategory);
  reduxSubcategoryRef.current = reduxSubcategory;

  const [selectedSubcategory, setSelectedSubcategoryLocal] = useState(() => {
    // On first render, prefer a valid existing Redux selection over the default.
    if (reduxSubcategory && subcategories.includes(reduxSubcategory)) {
      return reduxSubcategory;
    }
    return subcategories[0] ?? "";
  });
  const [searchQuery, setSearchQuery] = useState("");

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
    const currentSub = reduxSubcategoryRef.current;
    const isValidForCategory = subcategories.includes(currentSub);
    if (isValidForCategory) {
      // Restore the user's previous selection (e.g. coming back from step 2).
      setSelectedSubcategoryLocal(currentSub);
      // Redux already has the correct value — no dispatch needed.
    } else {
      // No valid selection for this category — default to the first subcategory.
      const firstSub = subcategories[0] ?? "";
      setSelectedSubcategoryLocal(firstSub);
      dispatch(setSubcategoryAction(firstSub));
    }
  }, [categorySlug, dispatch, subcategories]);

  const handleSubcategorySelect = (sub: string) => {
    setSelectedSubcategoryLocal(sub);
    dispatch(setSubcategoryAction(sub));
  };

  const filteredSubcategories = searchQuery.trim()
    ? subcategories.filter((s) =>
        s.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : subcategories;

  return (
    <SellFlowLayout
      step={1}
      title={categoryConfig?.name ?? "Category"}
      subtitle="Choose a subcategory"
      keyboardPersistTaps="always"
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
      footerMeta={`${categoryConfig?.name} › ${selectedSubcategory}`}
      primaryLabel="Continue"
      onPrimaryPress={() => router.push("/post-ad-step2-details")}
    >
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
          const isSelected = sub === selectedSubcategory;
          return (
            <Pressable
              key={sub}
              onPress={() => handleSubcategorySelect(sub)}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 16,
                paddingVertical: 15,
                backgroundColor: pressed ? colors.surfaceMuted : "transparent",
                borderBottomWidth:
                  index < filteredSubcategories.length - 1 ? 1 : 0,
                borderBottomColor: colors.border,
              })}
            >
              <Text
                style={{
                  flex: 1,
                  fontFamily: isSelected
                    ? ListifyFonts.semiBold
                    : ListifyFonts.regular,
                  fontSize: 15,
                  color: isSelected ? colors.textPrimary : colors.textSecondary,
                }}
              >
                {sub}
              </Text>
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
    </SellFlowLayout>
  );
}

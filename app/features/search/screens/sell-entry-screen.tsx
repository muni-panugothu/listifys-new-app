import { MaterialIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "@/lib/safe-router";
import { useCallback, useMemo } from "react";
import {
  BackHandler,
  Dimensions,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SellStepPreview } from "@/components/sell-step-indicator";
import { FLOATING_BOTTOM_NAV_OFFSET } from "@/constants/bottom-nav-tabs";
import { type CategorySlug } from "@/constants/categories";
import { SearchCategoryTile } from "@/features/search/components/search-category-tile";
import { SELL_CATEGORIES_ORDERED } from "@/lib/sell-categories";
import { ListifyFonts } from "@/constants/typography";
import { useTabNavigation } from "@/lib/use-tab-navigation";
import { useTheme } from "@/providers/theme-provider";
import { useAppDispatch } from "@/store/hooks";
import { setCategory } from "@/store/slices/post-form-slice";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const H_PADDING = 16;
const GRID_GAP = 10;
const GRID_COLS = 4;
const CATEGORY_SIZE =
  (SCREEN_WIDTH - H_PADDING * 2 - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS;

export function SellEntryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const { colors } = useTheme();
  const handleBottomTabPress = useTabNavigation();

  const bottomPadding = useMemo(
    () => FLOATING_BOTTOM_NAV_OFFSET + Math.max(insets.bottom, 10) + 20,
    [insets.bottom],
  );

  const openCategoryFlow = useCallback(
    (slug: CategorySlug) => {
      dispatch(setCategory(slug));
      router.push({
        pathname: "/post-ad-step1-category",
        params: { category: slug },
      });
    },
    [dispatch, router],
  );

  useFocusEffect(
    useCallback(() => {
      const onHardwareBack = () => {
        handleBottomTabPress("home");
        return true;
      };
      const sub = BackHandler.addEventListener("hardwareBackPress", onHardwareBack);
      return () => sub.remove();
    }, [handleBottomTabPress]),
  );

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        contentContainerStyle={{
          paddingTop: insets.top + 12,
          paddingBottom: bottomPadding,
          paddingHorizontal: H_PADDING,
        }}
      >
        <Text
          className="text-[26px]"
          style={{ fontFamily: ListifyFonts.bold, color: colors.textPrimary }}
        >
          What are you selling?
        </Text>
        <Text
          className="mt-1 text-[15px]"
          style={{ fontFamily: ListifyFonts.regular, color: colors.textSecondary }}
        >
          Pick a category to start your listing
        </Text>

        <SellStepPreview />

        <View className="mt-5 flex-row flex-wrap" style={{ gap: GRID_GAP }}>
          {SELL_CATEGORIES_ORDERED.map((category) => (
            <SearchCategoryTile
              key={category.slug}
              slug={category.slug}
              label={category.name}
              size={CATEGORY_SIZE}
              onPress={() => openCategoryFlow(category.slug)}
            />
          ))}
        </View>

        <Pressable
          onPress={() => router.push("/my-listings-active")}
          className="mt-8 flex-row items-center rounded-2xl px-4 py-4"
          style={({ pressed }) => ({
            opacity: pressed ? 0.9 : 1,
            backgroundColor: colors.surface,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.04,
            shadowRadius: 8,
            elevation: 2,
          })}
        >
          <View
            className="h-11 w-11 items-center justify-center rounded-2xl"
            style={{ backgroundColor: colors.primarySoft }}
          >
            <MaterialIcons name="inventory-2" size={22} color={colors.primary} />
          </View>
          <View className="ml-3 flex-1">
            <Text
              className="text-[15px]"
              style={{
                fontFamily: ListifyFonts.semiBold,
                color: colors.textPrimary,
              }}
            >
              My listings
            </Text>
          </View>
          <MaterialIcons name="chevron-right" size={24} color={colors.iconMuted} />
        </Pressable>
      </ScrollView>
    </View>
  );
}

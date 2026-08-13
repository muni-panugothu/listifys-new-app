import { MaterialIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "@/lib/safe-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BackHandler,
  Dimensions,
  Keyboard,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { VoiceSearchModal } from "@/components/voice-search-modal";
import { CATEGORIES, type CategorySlug } from "@/constants/categories";
import { ListifyFonts } from "@/constants/typography";
import { SearchCategoryTile } from "@/features/search/components/search-category-tile";
import { fetchSavedListings } from "@/features/listing/services/listing-api";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { getCategoryHref } from "@/lib/navigate-to-category";
import { useTheme } from "@/providers/theme-provider";
import { useTabNavigation } from "@/lib/use-tab-navigation";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  hydrateAppLocation,
  selectHomeLocationHeader,
} from "@/store/slices/location-slice";
import type { Href } from "@/lib/safe-router";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const GRID_GAP = 10;
const GRID_H_PADDING = 16;
const SEARCH_GRID_COLS = 4;
const CATEGORY_CARD_SIZE =
  (SCREEN_WIDTH - GRID_H_PADDING * 2 - GRID_GAP * (SEARCH_GRID_COLS - 1)) /
  SEARCH_GRID_COLS;

/** All categories with Others last (after Toys). */
const searchCategoriesOrdered = [
  ...CATEGORIES.filter((c) => c.slug !== "others"),
  ...CATEGORIES.filter((c) => c.slug === "others"),
].map((c) => ({
  id: c.slug as CategorySlug,
  label: c.name,
}));

export function SearchHomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const { colors } = useTheme();
  const user = useAppSelector((s) => s.auth.user);
  const isAuthenticated = useAppSelector((s) => s.auth.isAuthenticated);
  const locationHeader = useAppSelector(selectHomeLocationHeader);
  const displayLocationText = isAuthenticated
    ? locationHeader.primary
    : "Select Location";
  const displayLocationSubtext = isAuthenticated
    ? locationHeader.secondary || "Tap to change location"
    : "Tap to choose location";
  const [query, setQuery] = useState("");
  const [savedCount, setSavedCount] = useState(0);
  const [voiceVisible, setVoiceVisible] = useState(false);
  const { refreshing, onRefresh } = usePullToRefresh();

  const bottomNavPadding = Math.max(insets.bottom, 8);

  const loadSavedCount = useCallback(async () => {
    try {
      const res = await fetchSavedListings();
      setSavedCount(res.listings?.length ?? 0);
    } catch {
      setSavedCount(0);
    }
  }, []);

  useEffect(() => {
    void loadSavedCount();
  }, [loadSavedCount]);

  useEffect(() => {
    if (!isAuthenticated) return;
    void dispatch(hydrateAppLocation());
  }, [dispatch, isAuthenticated]);

  const handleQueryChange = useCallback((text: string) => {
    setQuery(text);
  }, []);

  const navigateToCategory = useCallback(
    (catId: CategorySlug) => {
      router.push(getCategoryHref(catId));
    },
    [router],
  );

  const openSearchResults = async (value?: string) => {
    const text = value?.trim() || query.trim();
    if (!text) return;

    Keyboard.dismiss();

    router.push({
      pathname: "/search-results-entity-tabs",
      params: { q: text },
    });
  };

  const handleVoiceResult = useCallback(
    (text: string) => {
      setQuery(text);
      void openSearchResults(text);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  /**
   * Real-time voice streaming: partial transcripts update the search bar
   * and trigger live autocomplete suggestions — exactly like Google / OLX.
   * Debounced at 150 ms so we don't fire on every spoken syllable.
   */
  const handleVoicePartial = useCallback(
    (partial: string) => {
      setQuery(partial);
    },
    [],
  );

  const handleBottomTabPress = useTabNavigation();

  const handleRefresh = useCallback(async () => {
    await loadSavedCount();
    await onRefresh();
  }, [loadSavedCount, onRefresh]);

  useFocusEffect(
    useCallback(() => {
      void loadSavedCount();
      const onHardwareBack = () => {
        handleBottomTabPress("home");
        return true;
      };

      const sub = BackHandler.addEventListener("hardwareBackPress", onHardwareBack);
      return () => sub.remove();
    }, [handleBottomTabPress, loadSavedCount]),
  );

  const formattedSavedCount = useMemo(
    () => (savedCount < 10 ? `0${savedCount}` : String(savedCount)),
    [savedCount],
  );

  return (
    <View className="flex-1" style={{ backgroundColor: colors.tabCanvas }}>
      <VoiceSearchModal
        visible={voiceVisible}
        onResult={handleVoiceResult}
        onPartialResult={handleVoicePartial}
        onClose={() => setVoiceVisible(false)}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
        contentContainerStyle={{
          paddingTop: insets.top + 12,
          paddingBottom: 84 + bottomNavPadding,
          paddingHorizontal: GRID_H_PADDING,
        }}
      >
        {/* Address + saved */}
        <View className="mb-4 flex-row items-center justify-between ">
          <Pressable
            onPress={() => router.push("/location-picker" as Href)}
            className="flex-1 pr-3"
            style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
          >
            <View className="flex-row items-center gap-0.5">
              <MaterialIcons name="location-on" size={16} color={colors.primary} />
              <Text
                className="flex-1 text-[16px]"
                style={{
                  fontFamily: ListifyFonts.bold,
                  color: colors.textPrimary,
                }}
                numberOfLines={1}
              >
                {displayLocationText}
              </Text>
              <MaterialIcons
                name="keyboard-arrow-down"
                size={20}
                color={colors.iconMuted}
              />
            </View>
            <Text
              className="mt-0.5 text-[13px]"
              style={{
                fontFamily: ListifyFonts.regular,
                color: colors.textTertiary,
              }}
            >
              {displayLocationSubtext}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => router.push("/saved-items" as Href)}
            className="flex-row items-center gap-1.5 rounded-full border px-3 py-2"
            style={({ pressed }) => ({
              opacity: pressed ? 0.85 : 1,
              backgroundColor: colors.surface,
              borderColor: colors.border,
            })}
          >
            <MaterialIcons name="bookmark-outline" size={18} color={colors.icon} />
            <Text
              className="text-[14px]"
              style={{
                fontFamily: ListifyFonts.semiBold,
                color: colors.textPrimary,
              }}
            >
              {formattedSavedCount}
            </Text>
          </Pressable>
        </View>

        {/* Search bar */}
        <View
          className="mb-6 h-17 shadow-xl flex-row items-center rounded-full border px-4"
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.04,
            shadowRadius: 4,
            elevation: 1,
          }}
        >
          <TextInput
            value={query}
            onChangeText={handleQueryChange}
            onSubmitEditing={() => void openSearchResults()}
            placeholder="Search"
            placeholderTextColor={colors.inputPlaceholder}
            className="flex-1 text-[15px]"
            style={{
              fontFamily: ListifyFonts.regular,
              paddingVertical: 0,
              color: colors.textPrimary,
            }}
          />
          <Pressable
            onPress={() => setVoiceVisible(true)}
            hitSlop={8}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, marginRight: 6 })}
          >
            <MaterialIcons name="mic" size={22} color={colors.iconMuted} />
          </Pressable>
          <Pressable
            onPress={() => void openSearchResults()}
            hitSlop={8}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          >
            <MaterialIcons name="search" size={22} color={colors.iconMuted} />
          </Pressable>
        </View>

        {/* Categories grid */}
        <Text
          className="mb-4 text-[18px]"
          style={{
            fontFamily: ListifyFonts.bold,
            color: colors.textPrimary,
          }}
        >
          Categories
        </Text>

        <View className="flex-row flex-wrap" style={{ gap: GRID_GAP }}>
          {searchCategoriesOrdered.map((cat) => (
            <SearchCategoryTile
              key={cat.id}
              slug={cat.id}
              label={cat.label}
              size={CATEGORY_CARD_SIZE}
              onPress={() => navigateToCategory(cat.id)}
            />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

import { StatusBar } from "expo-status-bar";
import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "@/lib/safe-router";
import { useCallback, useMemo, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ListifyFonts } from "@/constants/typography";
import {
  EventsFloatingNav,
  type EventsFloatingNavTab,
} from "@/features/events/components/events-floating-nav";
import { EventsHubSwitcherModal } from "@/features/events/components/events-hub-switcher-modal";
import { EventsSearchExploreGrid } from "@/features/events/components/events-search-explore-grid";
import { FEATURED_EVENTS_DUMMY } from "@/features/events/data/events-discovery";
import type { MarketplaceHubTab } from "@/features/home/data/home-hub-tabs";
import { navigateFromHubTab } from "@/lib/navigate-from-hub-tab";
import {
  EVENTS_SEARCH_ARTISTS,
  type EventsSearchArtist,
  type EventsSearchCategory,
} from "@/features/events/data/events-search-discovery";
import { Image } from "@/lib/nativewind-interop";
import type { Href } from "@/lib/safe-router";
import { useTabNavigation } from "@/lib/use-tab-navigation";
import { useEventsTheme } from "@/features/events/theme/events-theme";
import { useTheme } from "@/providers/theme-provider";
import { useAppSelector } from "@/store/hooks";
import { selectLocationLabel } from "@/store/slices/location-slice";

const H_PAD = 16;
const ARTIST_SIZE = 86;

export function EventsSearchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const et = useEventsTheme();
  const locationLabel = useAppSelector(selectLocationLabel);
  const navCollapse = useSharedValue(0);
  const lastY = useSharedValue(0);

  const [query, setQuery] = useState("");
  const [activeNavTab, setActiveNavTab] =
    useState<EventsFloatingNavTab>("search");
  const [hubVisible, setHubVisible] = useState(false);
  const handleTabPress = useTabNavigation();

  const cityName = useMemo(() => {
    const label = locationLabel?.trim() ?? "";
    if (!label || label === "Set location" || label.startsWith("Detecting")) {
      return null;
    }
    return label.split(",")[0]?.trim() || null;
  }, [locationLabel]);

  const trendingTitle = cityName
    ? `Trending in ${cityName}`
    : "Trending in your city";

  const recentChips = useMemo(
    () =>
      FEATURED_EVENTS_DUMMY.slice(0, 6).filter((e) =>
        query.trim()
          ? e.title.toLowerCase().includes(query.trim().toLowerCase())
          : true,
      ),
    [query],
  );

  const artists = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return EVENTS_SEARCH_ARTISTS;
    return EVENTS_SEARCH_ARTISTS.filter((a) =>
      a.name.toLowerCase().includes(q),
    );
  }, [query]);

  const handleNavPress = useCallback(
    (tab: EventsFloatingNavTab) => {
      if (tab === "events") {
        setActiveNavTab("events");
        setHubVisible(true);
        return;
      }
      setActiveNavTab("search");
    },
    [],
  );

  const handleHubSelect = useCallback(
    (tab: MarketplaceHubTab) => {
      setHubVisible(false);
      if (tab.id === "events") {
        if (router.canGoBack()) router.back();
        else router.replace("/events-listing");
        return;
      }
      navigateFromHubTab(tab, router, handleTabPress);
    },
    [handleTabPress, router],
  );

  const handleExploreSelect = useCallback(
    (cat: EventsSearchCategory) => {
      router.push({
        pathname: "/events-category",
        params: {
          categoryId: cat.id,
          categoryLabel: cat.label,
        },
      } as Href);
    },
    [router],
  );

  const handleScroll = useCallback(
    (y: number) => {
      const dy = y - lastY.value;
      if (y <= 16) navCollapse.value = withTiming(0, { duration: 220 });
      else if (dy > 6) navCollapse.value = withTiming(1, { duration: 220 });
      else if (dy < -6) navCollapse.value = withTiming(0, { duration: 220 });
      lastY.value = y;
    },
    [lastY, navCollapse],
  );

  return (
    <View style={{ flex: 1, backgroundColor: et.background }}>
      <StatusBar style={et.colors.statusBarStyle} backgroundColor={et.headerBg} />
      <EventsHubSwitcherModal
        visible={hubVisible}
        activeTab="events"
        onClose={() => {
          setHubVisible(false);
          setActiveNavTab("search");
        }}
        onSelect={handleHubSelect}
      />

      <View
        style={{
          paddingTop: insets.top + 8,
          paddingHorizontal: H_PAD,
          paddingBottom: 10,
          backgroundColor: et.headerBg,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            marginBottom: 14,
          }}
        >
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={({ pressed }) => ({
              width: 36,
              height: 36,
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <MaterialIcons name="arrow-back" size={24} color={colors.icon} />
          </Pressable>
          <Text
            style={{
              fontFamily: ListifyFonts.bold,
              fontSize: 28,
              color: colors.textPrimary,
              ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
            }}
          >
            Search
          </Text>
        </View>

        <View
          style={{
            height: 48,
            borderRadius: 24,
            borderWidth: 1,
            borderColor: isDark ? et.chipBorder : colors.border,
            backgroundColor: colors.surface,
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 16,
          }}
        >
          <MaterialIcons name="search" size={22} color={colors.iconMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            autoFocus
            returnKeyType="search"
            placeholder={`Search for 'Gorillaz'`}
            placeholderTextColor={colors.inputPlaceholder}
            style={{
              marginLeft: 10,
              flex: 1,
              fontSize: 15,
              fontFamily: ListifyFonts.regular,
              color: colors.textPrimary,
              paddingVertical: 0,
            }}
          />
          {query.length > 0 ? (
            <Pressable onPress={() => setQuery("")} hitSlop={8}>
              <MaterialIcons name="close" size={20} color={colors.iconMuted} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <ScrollView
        style={{ flex: 1, backgroundColor: et.background }}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={(e) => handleScroll(e.nativeEvent.contentOffset.y)}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingBottom: Math.max(insets.bottom, 16) + 110,
        }}
      >
        {recentChips.length > 0 ? (
          <View style={{ marginTop: 8 }}>
            <Text
              style={{
                fontFamily: ListifyFonts.bold,
                fontSize: 18,
                color: colors.textPrimary,
                paddingHorizontal: H_PAD,
                marginBottom: 12,
                ...(Platform.OS === "android"
                  ? { includeFontPadding: false }
                  : {}),
              }}
            >
              {trendingTitle}
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{
                paddingHorizontal: H_PAD,
                paddingBottom: 8,
                gap: 10,
              }}
            >
              {recentChips.map((chip) => (
                <Pressable
                  key={chip.id}
                  style={({ pressed }) => ({
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    paddingVertical: 7,
                    paddingLeft: 7,
                    paddingRight: 12,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: et.chipBorder,
                    backgroundColor: et.chipBg,
                    maxWidth: 220,
                    opacity: pressed ? 0.85 : 1,
                  })}
                >
                  <Image
                    source={chip.image}
                    contentFit="cover"
                    transition={120}
                    cachePolicy="memory-disk"
                    recyclingKey={chip.id}
                    style={{ width: 34, height: 34, borderRadius: 8 }}
                  />
                  <Text
                    numberOfLines={1}
                    style={{
                      flexShrink: 1,
                      fontFamily: ListifyFonts.medium,
                      fontSize: 13,
                      color: colors.textPrimary,
                      ...(Platform.OS === "android"
                        ? { includeFontPadding: false }
                        : {}),
                    }}
                  >
                    {chip.title}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {artists.length > 0 ? (
          <View style={{ marginTop: 18 }}>
            <Text
              style={{
                fontFamily: ListifyFonts.bold,
                fontSize: 20,
                color: colors.textPrimary,
                paddingHorizontal: H_PAD,
                marginBottom: 14,
                ...(Platform.OS === "android"
                  ? { includeFontPadding: false }
                  : {}),
              }}
            >
              Artists in your District
            </Text>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{
                paddingHorizontal: H_PAD,
                gap: 18,
              }}
            >
              {artists.map((artist: EventsSearchArtist) => (
                <View
                  key={artist.id}
                  style={{ width: ARTIST_SIZE + 8, alignItems: "center" }}
                >
                  <View
                    style={{
                      width: ARTIST_SIZE,
                      height: ARTIST_SIZE,
                      borderRadius: ARTIST_SIZE / 2,
                      overflow: "hidden",
                      backgroundColor: colors.surfaceMuted,
                    }}
                  >
                    <Image
                      source={artist.avatar}
                      contentFit="cover"
                      transition={140}
                      cachePolicy="memory-disk"
                      recyclingKey={artist.avatar}
                      style={{ width: "100%", height: "100%" }}
                    />
                  </View>
                  <Text
                    numberOfLines={1}
                    style={{
                      marginTop: 8,
                      fontFamily: ListifyFonts.medium,
                      fontSize: 13,
                      color: colors.textPrimary,
                      textAlign: "center",
                      ...(Platform.OS === "android"
                        ? { includeFontPadding: false }
                        : {}),
                    }}
                  >
                    {artist.name}
                  </Text>
                </View>
              ))}
            </ScrollView>
          </View>
        ) : null}

        <EventsSearchExploreGrid onSelect={handleExploreSelect} />
      </ScrollView>

      <EventsFloatingNav
        activeTab={activeNavTab}
        onTabPress={handleNavPress}
        collapseProgress={navCollapse}
      />
    </View>
  );
}

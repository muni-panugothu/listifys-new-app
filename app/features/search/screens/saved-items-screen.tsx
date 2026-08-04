import { MaterialIcons } from "@expo/vector-icons";
import { type Href, useFocusEffect, useRouter } from "@/lib/safe-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FloatingBottomNav } from "@/components/floating-bottom-nav";
import { ListingItemsGridCard } from "@/components/listing-items-grid-card";
import { ProfileSubScreenLayout } from "@/components/profile-sub-screen-layout";
import { FLOATING_BOTTOM_NAV_OFFSET } from "@/constants/bottom-nav-tabs";
import { ListifyFonts } from "@/constants/typography";
import {
  fetchSavedListings,
  toggleSaveListing,
  type ListingItem,
} from "@/features/listing/services/listing-api";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { getListingDistanceLabel } from "@/lib/listing-distance";
import { useTabNavigation } from "@/lib/use-tab-navigation";
import { useTheme } from "@/providers/theme-provider";
import { useAppSelector } from "@/store/hooks";
import {
  selectCanShowDistanceOnCards,
  selectIsoCountryCode,
  selectLocationCoords,
} from "@/store/slices/location-slice";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const GRID_GUTTER = 14;
const CARD_WIDTH = (SCREEN_WIDTH - 20 * 2 - GRID_GUTTER) / 2;

const SPECIAL_DETAIL_ROUTES: Record<string, string> = {
  events: "/event-detail",
  properties: "/property-detail",
  jobs: "/job-detail",
  services: "/service-detail",
};

export function SavedItemsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const handleBottomTabPress = useTabNavigation();
  const { colors } = useTheme();
  const locationCoords = useAppSelector(selectLocationCoords);
  const isoCountryCode = useAppSelector(selectIsoCountryCode);
  const canShowDistanceOnCards = useAppSelector(selectCanShowDistanceOnCards);
  const [items, setItems] = useState<ListingItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadSaved = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchSavedListings();
      setItems(res.listings || []);
    } catch {
      // keep existing
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadSaved();
    }, [loadSaved]),
  );

  const { refreshing, onRefresh } = usePullToRefresh(loadSaved);

  const openDetail = useCallback(
    (item: ListingItem) => {
      const cat = (item as ListingItem & { _source?: string })._source ?? item.category;
      const specialRoute = SPECIAL_DETAIL_ROUTES[cat];
      if (specialRoute) {
        router.push(`${specialRoute}?id=${item._id}&category=${cat}` as Href);
      } else {
        router.push(`/listing-detail-template?category=${cat}&id=${item._id}` as Href);
      }
    },
    [router],
  );

  const handleUnsave = useCallback(async (item: ListingItem) => {
    try {
      const category =
        (item as ListingItem & { _source?: string })._source ?? item.category ?? "electronics";
      await toggleSaveListing(category, item._id);
      setItems((prev) => prev.filter((i) => i._id !== item._id));
    } catch {
      // silently fail
    }
  }, []);

  return (
    <View className="flex-1">
      <ProfileSubScreenLayout
        title="Hotlists"
        fallbackRoute={"/(tabs)/home-feed-root" as Href}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={["#27BB97"]}
            tintColor="#27BB97"
          />
        }
        contentContainerStyle={{
          paddingBottom:
            FLOATING_BOTTOM_NAV_OFFSET + Math.max(insets.bottom, 10) + 24,
        }}
      >
        <Text
          className="mb-4 text-[14px]"
          style={{ fontFamily: ListifyFonts.regular, color: colors.textSecondary }}
        >
          <Text style={{ fontFamily: ListifyFonts.bold, color: colors.primary }}>
            {items.length}
          </Text>{" "}
          saved {items.length === 1 ? "item" : "items"}
        </Text>

        {loading && items.length === 0 ? (
          <View className="items-center py-16">
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : null}

        {!loading && items.length === 0 ? (
          <View
            className="items-center rounded-2xl px-6 py-14"
            style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
          >
            <MaterialIcons name="favorite-border" size={48} color={colors.iconMuted} />
            <Text
              className="mt-3 text-[16px]"
              style={{ fontFamily: ListifyFonts.semiBold, color: colors.textPrimary }}
            >
              No saved items yet
            </Text>
            <Text
              className="mt-1 text-center text-[13px]"
              style={{ fontFamily: ListifyFonts.regular, color: colors.textSecondary }}
            >
              Tap the heart on listings to save them here
            </Text>
          </View>
        ) : null}

        {items.length > 0 ? (
          <View
            className="flex-row flex-wrap"
            style={{ columnGap: GRID_GUTTER, rowGap: GRID_GUTTER }}
          >
            {items.map((item) => {
              const category =
                (item as ListingItem & { _source?: string })._source ??
                item.category;
              const distanceLabel = canShowDistanceOnCards
                ? getListingDistanceLabel(
                    {
                      _id: item._id,
                      category,
                      countryCode: item.countryCode,
                      currency: item.currency,
                      coordinates: item.coordinates,
                      distance: (item as { distance?: number }).distance,
                    },
                    { lat: locationCoords.lat!, lng: locationCoords.lng! },
                    isoCountryCode,
                  )
                : undefined;

              return (
                <ListingItemsGridCard
                  key={item._id}
                  width={CARD_WIDTH}
                  title={item.title}
                  subtitle={
                    item.condition ||
                    (typeof item.location === "string"
                      ? item.location
                      : item.location?.address ??
                        item.location?.city ??
                        undefined)
                  }
                  price={item.price}
                  currency={item.currency}
                  isoCountryCode={item.countryCode ?? isoCountryCode}
                  image={item.images?.[0]}
                  createdAt={item.createdAt}
                  distanceLabel={distanceLabel}
                  isSaved
                  onPress={() => openDetail(item)}
                  onToggleSave={() => void handleUnsave(item)}
                />
              );
            })}
          </View>
        ) : null}
      </ProfileSubScreenLayout>

      <FloatingBottomNav
        activeTabId="hotlists"
        onTabPress={handleBottomTabPress}
      />
    </View>
  );
}

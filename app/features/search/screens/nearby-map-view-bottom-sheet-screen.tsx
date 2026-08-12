import { MaterialIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "@/lib/safe-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Animated,
    Dimensions,
    PanResponder,
    Pressable,
    RefreshControl,
    ScrollView,
    Text,
    TextInput,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { Image } from "@/lib/nativewind-interop";
import { useLocale } from "@/providers/locale-provider";
import { useFloatingNavPress } from "@/hooks/use-floating-nav-press";
import { FloatingBottomNav } from "@/components/floating-bottom-nav";
import { useAppSelector } from "@/store/hooks";
import { selectLocationCoords, selectIsoCountryCode } from "@/store/slices/location-slice";
import { fetchNearbyListings, type NearbyListingsResponse } from "@/features/listing/services/listing-api";
import { formatPrice } from "@/lib/currency";
import { formatDistance, formatRadiusLabel } from "@/lib/listing-distance";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

const NEARBY_RADIUS = 50;

const mapBackgroundImage =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuAKVZlC-TyqExGtIWEdUMKO7pl85Pw8XEo_B5x6FEDH-KjV1RQERm14jNlyFb5AIVl9_Q7fr0xHghNonRnFivXQS3Srrs8_iA2g4b26fuFJYn43fBWw2_ZEc4D7E-aHD31BjHataW9ilcK_oZY1knyNtcd1aPSQedeXQGlBUzo-Mbf9gNDu6v7PSFWXUj7r_n8DrDjOf7v7B8Rtk4NRx62PJaBR2Q_y-6Od0OiFGatp7Yik_9EsP3O5f58NhznQNBDWbJPxXnHvwWM";

function parseQueryParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value ?? "";
}

function MapPin({
  iconName,
  active = false,
}: {
  iconName: keyof typeof MaterialIcons.glyphMap;
  active?: boolean;
}) {
  return (
    <View style={{ transform: [{ rotate: "-45deg" }] }}>
      <View
        className="h-10 w-10 items-center justify-center rounded-full rounded-bl-sm border-2 border-white bg-[#27BB97]"
        style={{
          shadowColor: "#000",
          shadowOffset: { width: 0, height: active ? 5 : 3 },
          shadowOpacity: active ? 0.22 : 0.15,
          shadowRadius: active ? 8 : 5,
          elevation: active ? 8 : 5,
        }}
      >
        <View style={{ transform: [{ rotate: "45deg" }] }}>
          <MaterialIcons
            name={iconName}
            size={active ? 20 : 18}
            color="#FFFFFF"
          />
        </View>
      </View>
    </View>
  );
}

export function NearbyMapViewBottomSheetScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ q?: string | string[] }>();
  const insets = useSafeAreaInsets();
  const { isoCountryCode: localeCountryCode } = useLocale();
  const [query, setQuery] = useState(() => parseQueryParam(params.q));
  const [isSheetExpanded, setIsSheetExpanded] = useState(false);

  const locationCoords = useAppSelector(selectLocationCoords);
  const rawCountryCode = useAppSelector(selectIsoCountryCode);
  const isoCountryCode = (rawCountryCode ?? localeCountryCode ?? null)?.toUpperCase() ?? null;

  type NearbyListing = NearbyListingsResponse["listings"][number];
  const [listings, setListings] = useState<NearbyListing[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);

  const sheetTranslateY = useRef(new Animated.Value(0)).current;
  const sheetTranslateRef = useRef(0);

  const topOverlayPadding = useMemo(() => insets.top + 8, [insets.top]);
  const bottomNavPadding = Math.max(insets.bottom, 8);
  const bottomNavHeight = bottomNavPadding + 76;
  const sheetTopInset = insets.top + 92;
  const sheetHeight = Math.max(
    320,
    SCREEN_HEIGHT - sheetTopInset - bottomNavHeight,
  );
  const collapsedVisibleHeight = Math.min(
    300,
    Math.max(210, SCREEN_HEIGHT * 0.33),
  );
  const collapsedTranslateY = Math.max(0, sheetHeight - collapsedVisibleHeight);
  const bottomSheetListPadding = bottomNavPadding + 24;

  const loadNearby = useCallback(async (searchQuery: string) => {
    if (locationCoords.lat == null || locationCoords.lng == null) return;
    setLoading(true);
    try {
      const result = await fetchNearbyListings({
        lat: locationCoords.lat,
        lng: locationCoords.lng,
        radius: NEARBY_RADIUS,
        search: searchQuery.trim() || undefined,
        sort: "nearest",
        limit: 30,
        countryCode: isoCountryCode,
      });
      setListings(result.listings ?? []);
      setTotalCount(result.pagination?.total ?? result.listings?.length ?? 0);
    } catch {
      setListings([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [locationCoords.lat, locationCoords.lng, isoCountryCode]);

  // Load on mount and when location is ready
  useEffect(() => {
    void loadNearby(query);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationCoords.lat, locationCoords.lng]);

  // Search with debounce
  useEffect(() => {
    const t = setTimeout(() => { void loadNearby(query); }, 500);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const { refreshing, onRefresh: baseOnRefresh } = usePullToRefresh();
  const onRefresh = useCallback(async () => {
    baseOnRefresh();
    await loadNearby(query);
  }, [baseOnRefresh, loadNearby, query]);

  useEffect(() => {
    const listener = sheetTranslateY.addListener(({ value }) => {
      sheetTranslateRef.current = value;
    });

    return () => {
      sheetTranslateY.removeListener(listener);
    };
  }, [sheetTranslateY]);

  useEffect(() => {
    sheetTranslateY.setValue(collapsedTranslateY);
    sheetTranslateRef.current = collapsedTranslateY;
    setIsSheetExpanded(false);
  }, [collapsedTranslateY, sheetTranslateY]);

  const snapSheetTo = (toValue: number) => {
    Animated.spring(sheetTranslateY, {
      toValue,
      useNativeDriver: true,
      damping: 24,
      stiffness: 240,
      mass: 0.45,
    }).start(() => {
      const expandedThreshold = collapsedTranslateY * 0.4;
      setIsSheetExpanded(toValue <= expandedThreshold);
    });
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          Math.abs(gestureState.dy) > 4,
        onPanResponderGrant: () => {
          sheetTranslateY.stopAnimation((value) => {
            sheetTranslateRef.current = value;
          });
        },
        onPanResponderMove: (_, gestureState) => {
          const nextValue = Math.min(
            Math.max(0, sheetTranslateRef.current + gestureState.dy),
            collapsedTranslateY,
          );
          sheetTranslateY.setValue(nextValue);
        },
        onPanResponderRelease: (_, gestureState) => {
          const projected = Math.min(
            Math.max(0, sheetTranslateRef.current + gestureState.dy),
            collapsedTranslateY,
          );
          const shouldExpand =
            projected < collapsedTranslateY / 2 || gestureState.vy < -0.45;
          snapSheetTo(shouldExpand ? 0 : collapsedTranslateY);
        },
        onPanResponderTerminate: () => {
          const shouldExpand =
            sheetTranslateRef.current < collapsedTranslateY / 2;
          snapSheetTo(shouldExpand ? 0 : collapsedTranslateY);
        },
      }),
    [collapsedTranslateY],
  );

  const handleBottomTabPress = useFloatingNavPress();

  const radiusLabel = formatRadiusLabel(NEARBY_RADIUS, isoCountryCode);

  const subtitleText = useMemo(() => {
    if (locationCoords.lat == null) return "Enable location to see nearby items";
    if (loading && listings.length === 0) return "Loading...";
    if (totalCount === 0) return `No listings found within ${radiusLabel}`;
    return `${totalCount} item${totalCount !== 1 ? "s" : ""} within ${radiusLabel}`;
  }, [locationCoords.lat, loading, listings.length, radiusLabel, totalCount]);

  return (
    <View className="flex-1 bg-[#F6F7F8]">
      <View className="absolute inset-0">
        <Image
          source={mapBackgroundImage}
          contentFit="cover"
          transition={150}
          className="h-full w-full"
          style={{ opacity: 0.62 }}
        />
      </View>

      <View className="absolute left-[25%] top-[35%] z-20">
        <MapPin iconName="weekend" />
      </View>

      <View className="absolute left-[50%] top-[42%] z-20">
        <MapPin iconName="electric-bike" />
      </View>

      <View
        className="absolute left-[65%] top-[55%] z-30"
        style={{ transform: [{ scale: 1.08 }] }}
      >
        <MapPin iconName="laptop-mac" active />
      </View>

      <View
        className="absolute inset-x-0 z-40 px-4"
        style={{ top: topOverlayPadding }}
      >
        <View className="flex-row items-center gap-3">
          <Pressable
            onPress={() => router.back()}
            className="h-12 w-12 items-center justify-center rounded-full bg-white/85"
            style={{
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.1,
              shadowRadius: 4,
              elevation: 3,
            }}
          >
            <MaterialIcons name="arrow-back" size={22} color="#3C4A44" />
          </Pressable>

          <View
            className="h-12 flex-1 flex-row items-center gap-3 rounded-full border border-slate-100 bg-white/85 px-4"
            style={{
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.1,
              shadowRadius: 4,
              elevation: 3,
            }}
          >
            <MaterialIcons name="search" size={20} color="#27BB97" />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search furniture, electronics..."
              placeholderTextColor="#6C7A74"
              className="flex-1 text-[14px] text-[#161D1A]"
              style={{ paddingVertical: 0 }}
            />
            {query.length > 0 && (
              <Pressable onPress={() => setQuery("")}>
                <MaterialIcons name="close" size={18} color="#6C7A74" />
              </Pressable>
            )}
          </View>
        </View>
      </View>

      <View className="absolute right-4 top-[45%] z-40 gap-3">
        <Pressable
          className="h-12 w-12 items-center justify-center rounded-xl bg-white/90"
          style={{
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.12,
            shadowRadius: 8,
            elevation: 4,
          }}
        >
          <MaterialIcons name="my-location" size={22} color="#161D1A" />
        </Pressable>

        <Pressable
          className="h-12 w-12 items-center justify-center rounded-xl bg-white/90"
          style={{
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.12,
            shadowRadius: 8,
            elevation: 4,
          }}
        >
          <MaterialIcons name="layers" size={22} color="#161D1A" />
        </Pressable>
      </View>

      <Animated.View
        className="absolute inset-x-0 z-50"
        style={{
          height: sheetHeight,
          bottom: bottomNavHeight,
          transform: [{ translateY: sheetTranslateY }],
        }}
      >
        <View
          className="h-full rounded-t-4xl border-t border-slate-100 bg-white pt-3"
          style={{
            shadowColor: "#000",
            shadowOffset: { width: 0, height: -10 },
            shadowOpacity: 0.12,
            shadowRadius: 20,
            elevation: 12,
          }}
        >
          <View className="items-center pb-2" {...panResponder.panHandlers}>
            <Pressable
              onPress={() =>
                snapSheetTo(isSheetExpanded ? collapsedTranslateY : 0)
              }
              hitSlop={8}
              className="mb-4 h-7 w-24 items-center justify-center"
            >
              <View className="h-1.5 w-12 rounded-full bg-slate-200" />
            </Pressable>

            <View className="mb-4 w-full flex-row items-center justify-between px-4">
              <View>
                <Text className="text-[20px] font-semibold text-[#161D1A]">
                  Nearby Listings
                </Text>
                <Text className="text-[12px] text-[#6C7A74]">
                  {subtitleText}
                </Text>
              </View>

              <Pressable
                onPress={() => router.push("/search-results-entity-tabs")}
                className="rounded-full bg-[#27BB97]/10 px-4 py-2"
              >
                <Text className="text-[12px] font-medium text-[#27BB97]">
                  List View
                </Text>
              </Pressable>
            </View>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            scrollEnabled={isSheetExpanded}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={["#27BB97"]}
                tintColor="#27BB97"
              />
            }
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingBottom: bottomSheetListPadding,
            }}
          >
            {loading && listings.length === 0 ? (
              <View className="items-center py-10">
                <ActivityIndicator size="large" color="#27BB97" />
                <Text className="mt-3 text-[13px] text-[#6C7A74]">
                  Finding listings near you...
                </Text>
              </View>
            ) : listings.length === 0 ? (
              <View className="items-center py-10">
                <MaterialIcons name="location-off" size={40} color="#CBD5E1" />
                <Text className="mt-3 text-[14px] font-semibold text-[#3C4A44]">
                  {locationCoords.lat == null
                    ? "Location not set"
                    : "No listings nearby"}
                </Text>
                <Text className="mt-1 text-center text-[12px] text-[#6C7A74]">
                  {locationCoords.lat == null
                    ? "Set your location to see items near you"
                    : `No listings found within ${radiusLabel} of your location`}
                </Text>
              </View>
            ) : (
              <View className="gap-4 pb-4">
                {listings.map((item) => {
                  const firstImage = item.images?.[0];
                  const distanceText =
                    item.distance != null
                      ? formatDistance(item.distance, isoCountryCode) ?? ""
                      : "";
                  const locationText = item.location ?? "";
                  const priceDisplay = formatPrice(item.price, item.currency, item.countryCode ?? isoCountryCode);
                  return (
                    <Pressable
                      key={String(item._id)}
                      onPress={() =>
                        router.push(
                          `/listing-detail-template?category=${item._entity ?? item.category}&id=${item._id}`,
                        )
                      }
                      className="flex-row gap-4 rounded-2xl border border-[#F1F5F9] bg-white p-3"
                      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
                    >
                      <View className="h-24 w-24 overflow-hidden rounded-xl bg-slate-100">
                        {firstImage ? (
                          <Image
                            source={firstImage}
                            contentFit="cover"
                            transition={150}
                            className="h-full w-full"
                          />
                        ) : (
                          <View className="h-full w-full items-center justify-center">
                            <MaterialIcons name="image" size={28} color="#CBD5E1" />
                          </View>
                        )}
                      </View>

                      <View className="flex-1 justify-between py-0.5">
                        <View>
                          <Text
                            numberOfLines={2}
                            className="text-[15px] font-semibold leading-5 text-[#161D1A]"
                          >
                            {item.title}
                          </Text>
                          <Text className="mt-1 text-[12px] text-[#6C7A74]">
                            {[locationText, distanceText]
                              .filter(Boolean)
                              .join(" â€¢ ")}
                          </Text>
                        </View>

                        <View className="flex-row items-end justify-between">
                          <Text className="text-[16px] font-bold text-[#27BB97]">
                            {priceDisplay}
                          </Text>
                          {item.condition ? (
                            <View className="rounded-md bg-[#E9EFEB] px-2 py-0.5">
                              <Text className="text-[10px] font-bold uppercase text-[#3C4A44]">
                                {item.condition}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </ScrollView>
        </View>
      </Animated.View>

      <FloatingBottomNav activeTabId="search" onTabPress={handleBottomTabPress} />
    </View>
  );
}

/**
 * LocationPickerScreen
 *
 * Google Maps / Uber-style location picker powered by Google Places API.
 *
 * Architecture:
 *   - usePlacesAutocomplete hook  → debounced API calls + session token
 *   - google-places.service       → Autocomplete + Place Details REST calls
 *   - HighlightedText component   → exact bold matches via Google offsets
 *   - PlacePredictionItem         → prediction row
 *   - RecentLocationItem          → recent-history row
 *   - setLocationDirect action    → Redux update with exact lat/lng (no re-geocode)
 */

import { MaterialIcons } from "@expo/vector-icons";
import { type Href, useRouter } from "@/lib/safe-router";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Keyboard,
  Linking,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
  type ListRenderItem,
} from "react-native";
import * as Location from "expo-location";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  PlacePredictionItem,
  RecentLocationItem,
} from "@/components/location-suggestion-item";
import {
  LocationPermissionSheet,
  type LocationPermissionSheetReason,
} from "@/components/location-permission-sheet";
import { ListifyFonts } from "@/constants/typography";
import { useTheme } from "@/providers/theme-provider";
import type { ThemeColors } from "@/theme/theme-tokens";
import {
  extractIsoCountryCode,
  fetchPlaceDetails,
  saveRecentLocation,
  type PlacePrediction,
  type RecentLocation,
} from "@/lib/google-places.service";
import { reverseGeocodeDetails, saveStoredLocation } from "@/lib/location-service";
import { showErrorToast } from "@/lib/toast";
import { usePlacesAutocomplete } from "@/hooks/usePlacesAutocomplete";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  setLocationDirect,
  useCurrentDeviceLocation,
} from "@/store/slices/location-slice";


type ListRow =
  | { kind: "prediction"; data: PlacePrediction }
  | { kind: "recent"; data: RecentLocation }
  | { kind: "skeleton"; id: string }
  | { kind: "section_header"; label: string };

// ── Skeleton row ───────────────────────────────────────────────────────────────

function SkeletonRow({
  shimmer,
  borderColor,
  skeletonColor,
}: {
  shimmer: Animated.Value;
  borderColor: string;
  skeletonColor: string;
}) {
  const opacity = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [0.4, 0.9],
  });
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: borderColor,
      }}
    >
      <Animated.View
        style={{
          width: 38,
          height: 38,
          borderRadius: 19,
          backgroundColor: skeletonColor,
          marginRight: 13,
          opacity,
        }}
      />
      <View style={{ flex: 1, gap: 8 }}>
        <Animated.View
          style={{
            height: 13,
            width: "65%",
            borderRadius: 6,
            backgroundColor: skeletonColor,
            opacity,
          }}
        />
        <Animated.View
          style={{
            height: 11,
            width: "80%",
            borderRadius: 6,
            backgroundColor: skeletonColor,
            opacity,
          }}
        />
      </View>
    </View>
  );
}

// ── Section header ─────────────────────────────────────────────────────────────

function SectionHeader({ label, colors }: { label: string; colors: ThemeColors }) {
  return (
    <View
      style={{
        paddingHorizontal: 16,
        paddingTop: 14,
        paddingBottom: 6,
        backgroundColor: colors.surfaceMuted,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}
    >
      <Text
        style={{
          fontSize: 11,
          fontFamily: ListifyFonts.semiBold,
          color: colors.textTertiary,
          textTransform: "uppercase",
          letterSpacing: 0.8,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

// ── Main Screen ────────────────────────────────────────────────────────────────

export function LocationPickerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const { colors, resolvedMode } = useTheme();

  const locationLat = useAppSelector((s) => s.location.lat);
  const locationLng = useAppSelector((s) => s.location.lng);
  const currentLabel = useAppSelector((s) => s.location.label);
  const locationStatus = useAppSelector((s) => s.location.status);

  const [query, setQuery] = useState("");
  const [selecting, setSelecting] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [permissionSheet, setPermissionSheet] = useState<{
    visible: boolean;
    reason: LocationPermissionSheetReason;
  }>({ visible: false, reason: "permanently_denied" });

  const inputRef = useRef<TextInput>(null);
  const listRef = useRef<FlatList<ListRow>>(null);

  // Shimmer animation for skeleton
  const shimmer = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(shimmer, {
          toValue: 0,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [shimmer]);

  // Dropdown entrance animation
  const listOpacity = useRef(new Animated.Value(0)).current;
  const listTranslateY = useRef(new Animated.Value(8)).current;

  const {
    predictions,
    recentLocations,
    loading: predictionsLoading,
    error: predictionsError,
    sessionToken,
    resetSession,
    refreshRecent,
  } = usePlacesAutocomplete(query, locationLat, locationLng);

  const isQueryActive = query.trim().length >= 2;
  const busy = selecting || locationStatus === "loading";

  // Animate list in whenever data changes
  useEffect(() => {
    listOpacity.setValue(0);
    listTranslateY.setValue(8);
    Animated.parallel([
      Animated.timing(listOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(listTranslateY, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [isQueryActive, predictions.length, recentLocations.length]);

  // ── Navigation ───────────────────────────────────────────────────────────────

  const handleBack = useCallback(() => {
    Keyboard.dismiss();
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)/home-feed-root" as Href);
    }
  }, [router]);

  // ── Selection handlers ───────────────────────────────────────────────────────

  const handlePredictionPress = useCallback(
    async (prediction: PlacePrediction) => {
      Keyboard.dismiss();
      setSelecting(true);
      try {
        const details = await fetchPlaceDetails(prediction.place_id, sessionToken);
        const { lat, lng } = details.geometry.location;
        const isoCountryCode = extractIsoCountryCode(details);

        // Build a clean label: "Main Text, City" style
        const main = prediction.structured_formatting.main_text;
        const secondary = prediction.structured_formatting.secondary_text;
        const label = secondary ? `${main}, ${secondary.split(",")[0]?.trim()}` : main;

        // Persist to AsyncStorage + update Redux (no extra geocode call)
        await saveStoredLocation({
          label,
          lat,
          lng,
          isoCountryCode,
          source: "manual",
          updatedAt: Date.now(),
        });

        dispatch(
          setLocationDirect({ label, lat, lng, isoCountryCode }),
        );

        // Save to recent searches (include isoCountryCode so repeat picks preserve locale)
        await saveRecentLocation({
          place_id: prediction.place_id,
          title: main,
          subtitle: secondary ?? "",
          lat,
          lng,
          savedAt: Date.now(),
          isoCountryCode,
        });

        resetSession();
        handleBack();
      } catch (err) {
        showErrorToast(
          "Location unavailable",
          err instanceof Error ? err.message : "Could not load place details.",
        );
      } finally {
        setSelecting(false);
      }
    },
    [dispatch, handleBack, resetSession, sessionToken],
  );

  const handleRecentPress = useCallback(
    async (item: RecentLocation) => {
      Keyboard.dismiss();
      setSelecting(true);
      try {
        // Use stored isoCountryCode when available; fall back to reverse-geocode
        // for older cached entries saved before this field was added.
        let isoCountryCode: string | null = item.isoCountryCode ?? null;
        if (isoCountryCode == null) {
          isoCountryCode = await reverseGeocodeDetails(item.lat, item.lng)
            .then((r) => r.isoCountryCode ?? null)
            .catch(() => null);
        }

        await saveStoredLocation({
          label: item.title,
          lat: item.lat,
          lng: item.lng,
          isoCountryCode,
          source: "manual",
          updatedAt: Date.now(),
        });

        dispatch(
          setLocationDirect({ label: item.title, lat: item.lat, lng: item.lng, isoCountryCode }),
        );

        handleBack();
      } catch (err) {
        showErrorToast(
          "Error",
          err instanceof Error ? err.message : "Could not set location.",
        );
      } finally {
        setSelecting(false);
      }
    },
    [dispatch, handleBack],
  );

  // ── Open device Settings (app permissions page) ─────────────────────────────
  const openSettings = useCallback(() => {
    Linking.openSettings().catch(() => {
      Alert.alert(
        "Open Settings",
        "Go to Settings → Apps → Listifys → Permissions → Location and enable it.",
        [{ text: "OK" }],
      );
    });
  }, []);

  const handleUseCurrentLocation = useCallback(async () => {
    Keyboard.dismiss();
    setGpsLoading(true);

    try {
      // ── Step 1: Check whether GPS (location services) is enabled ──────────
      const servicesEnabled = await Location.hasServicesEnabledAsync();

      if (!servicesEnabled) {
        if (Platform.OS === "android") {
          // Android: trigger the native system dialog —
          // "For a better experience, turn on device location"
          // Same dialog shown by Google Maps / Uber / Swiggy
          try {
            await Location.enableNetworkProviderAsync();
          } catch {
            // User tapped "No thanks" — fall through to services_disabled sheet
          }

          const nowEnabled = await Location.hasServicesEnabledAsync();
          if (!nowEnabled) {
            setGpsLoading(false);
            setPermissionSheet({ visible: true, reason: "services_disabled" });
            return;
          }
          // GPS is now on — continue
        } else {
          // iOS has no programmatic GPS toggle — send user to Settings
          setGpsLoading(false);
          setPermissionSheet({ visible: true, reason: "services_disabled" });
          return;
        }
      }

      // ── Step 2: Check / request location permission ───────────────────────
      const { status: existingStatus, canAskAgain } =
        await Location.getForegroundPermissionsAsync();

      if (existingStatus !== Location.PermissionStatus.GRANTED) {
        if (!canAskAgain) {
          // Permanently denied — user must go to app settings
          setGpsLoading(false);
          setPermissionSheet({ visible: true, reason: "permanently_denied" });
          return;
        }

        // Show native OS permission dialog
        const { status: newStatus, canAskAgain: canStillAsk } =
          await Location.requestForegroundPermissionsAsync();

        if (newStatus !== Location.PermissionStatus.GRANTED) {
          setGpsLoading(false);
          if (!canStillAsk) {
            setPermissionSheet({ visible: true, reason: "permanently_denied" });
          } else {
            showErrorToast(
              "Location denied",
              "Tap \"Use current location\" again to grant access.",
            );
          }
          return;
        }
      }

      // ── Step 3: Fetch GPS coordinates and update location ─────────────────
      await dispatch(useCurrentDeviceLocation()).unwrap();
      handleBack();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";

      if (msg === "GPS_TIMEOUT") {
        showErrorToast(
          "GPS timed out",
          "Weak signal. Move outdoors or to a window and try again.",
        );
      } else if (msg === "SERVICES_DISABLED") {
        setPermissionSheet({ visible: true, reason: "services_disabled" });
      } else {
        showErrorToast(
          "Could not get location",
          "Make sure GPS is on and try again.",
        );
      }
    } finally {
      setGpsLoading(false);
    }
  }, [dispatch, handleBack]);

  const handlePermissionSheetSettings = useCallback(() => {
    setPermissionSheet((s) => ({ ...s, visible: false }));
    openSettings();
  }, [openSettings]);

  const handlePermissionSheetCancel = useCallback(() => {
    setPermissionSheet((s) => ({ ...s, visible: false }));
  }, []);

  // ── List data ────────────────────────────────────────────────────────────────

  const listData = useMemo((): ListRow[] => {
    // Loading skeleton
    if (isQueryActive && predictionsLoading) {
      return Array.from({ length: 5 }, (_, i) => ({
        kind: "skeleton" as const,
        id: `skeleton-${i}`,
      }));
    }

    // Predictions
    if (isQueryActive && predictions.length > 0) {
      return predictions.map((p) => ({ kind: "prediction" as const, data: p }));
    }

    // Recent searches (no query)
    if (!isQueryActive && recentLocations.length > 0) {
      const header: ListRow = { kind: "section_header", label: "Recent searches" };
      const items: ListRow[] = recentLocations.map((r) => ({
        kind: "recent" as const,
        data: r,
      }));
      return [header, ...items];
    }

    return [];
  }, [isQueryActive, predictionsLoading, predictions, recentLocations]);

  // ── FlatList renderer ────────────────────────────────────────────────────────

  const renderItem: ListRenderItem<ListRow> = useCallback(
    ({ item, index }) => {
      if (item.kind === "skeleton") {
        return (
          <SkeletonRow
            shimmer={shimmer}
            borderColor={colors.border}
            skeletonColor={colors.skeleton}
          />
        );
      }

      if (item.kind === "section_header") {
        return <SectionHeader label={item.label} colors={colors} />;
      }

      if (item.kind === "prediction") {
        const isLast =
          index === listData.length - 1 ||
          (listData[index + 1] as ListRow | undefined)?.kind !== "prediction";
        return (
          <PlacePredictionItem
            prediction={item.data}
            onPress={handlePredictionPress}
            isLast={isLast}
          />
        );
      }

      if (item.kind === "recent") {
        const isLast = index === listData.length - 1;
        return (
          <RecentLocationItem
            item={item.data}
            onPress={handleRecentPress}
            isLast={isLast}
          />
        );
      }

      return null;
    },
    [listData, handlePredictionPress, handleRecentPress, shimmer, colors],
  );

  const keyExtractor = useCallback((item: ListRow, index: number): string => {
    if (item.kind === "prediction") return `pred-${item.data.place_id}`;
    if (item.kind === "recent") return `recent-${item.data.place_id}`;
    if (item.kind === "skeleton") return item.id;
    return `header-${index}`;
  }, []);

  const getItemLayout = useCallback(
    (_: ArrayLike<ListRow> | null | undefined, index: number) => ({
      length: 66,
      offset: 66 * index,
      index,
    }),
    [],
  );

  // ── Render ───────────────────────────────────────────────────────────────────

  const showEmptyState =
    isQueryActive && !predictionsLoading && predictions.length === 0 && !predictionsError;
  const showErrorState = isQueryActive && !!predictionsError && !predictionsLoading;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* ── Header ── */}
      <View
        style={{
          paddingTop: insets.top + 8,
          paddingHorizontal: 20,
          paddingBottom: 12,
          backgroundColor: colors.background,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Pressable
            onPress={handleBack}
            hitSlop={12}
            style={({ pressed }) => ({
              opacity: pressed ? 0.7 : 1,
              marginRight: 4,
              width: 40,
              height: 40,
              alignItems: "center",
              justifyContent: "center",
            })}
          >
            <MaterialIcons name="chevron-left" size={32} color={colors.icon} />
          </Pressable>
          <Text
            style={{
              fontSize: 22,
              fontFamily: ListifyFonts.bold,
              color: colors.textPrimary,
            }}
          >
            Choose location
          </Text>
        </View>

        {/* Search input */}
        <View
          style={{
            marginTop: 16,
            flexDirection: "row",
            alignItems: "center",
            height: 52,
            backgroundColor: colors.surface,
            borderRadius: 14,
            paddingHorizontal: 14,
            gap: 10,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.06,
            shadowRadius: 8,
            elevation: 3,
          }}
        >
          <MaterialIcons name="search" size={22} color={query.length > 0 ? colors.primary : colors.iconMuted} />
          <TextInput
            ref={inputRef}
            value={query}
            onChangeText={setQuery}
            placeholder="Search city, area or landmark…"
            placeholderTextColor={colors.inputPlaceholder}
            returnKeyType="search"
            autoFocus
            autoCapitalize="words"
            autoCorrect={false}
            editable={!busy}
            style={{
              flex: 1,
              fontSize: 15.5,
              color: colors.textPrimary,
              fontFamily: ListifyFonts.regular,
              paddingVertical: 0,
            }}
          />
          {predictionsLoading && query.trim().length >= 2 ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : null}
          {query.length > 0 && !predictionsLoading ? (
            <Pressable
              onPress={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              hitSlop={10}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            >
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  backgroundColor: colors.surfaceMuted,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <MaterialIcons name="close" size={14} color={colors.textSecondary} />
              </View>
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* ── Content area ── */}
      <View style={{ flex: 1 }}>
        {/* Use current location row */}
        {!isQueryActive ? (
          <Pressable
            onPress={() => void handleUseCurrentLocation()}
            disabled={gpsLoading}
            android_ripple={{ color: colors.primarySoft }}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 20,
              paddingVertical: 15,
              backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
              marginHorizontal: 16,
              marginTop: 6,
              borderRadius: 14,
              gap: 13,
              borderWidth: 1,
              borderColor: colors.border,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: resolvedMode === "dark" ? 0.18 : 0.04,
              shadowRadius: 4,
              elevation: 1,
              opacity: gpsLoading ? 0.7 : 1,
            })}
          >
            <View
              style={{
                width: 38,
                height: 38,
                borderRadius: 19,
                backgroundColor: colors.primarySoftStrong,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {gpsLoading ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <MaterialIcons name="my-location" size={19} color={colors.primary} />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 14.5,
                  fontFamily: ListifyFonts.semiBold,
                  color: colors.primary,
                  lineHeight: 20,
                }}
              >
                Use current location
              </Text>
              {currentLabel && currentLabel !== "Set location" ? (
                <Text
                  numberOfLines={1}
                  style={{
                    fontSize: 12,
                    color: colors.textSecondary,
                    fontFamily: ListifyFonts.regular,
                    lineHeight: 17,
                  }}
                >
                  {currentLabel}
                </Text>
              ) : (
                <Text
                  style={{
                    fontSize: 12,
                    color: colors.textTertiary,
                    fontFamily: ListifyFonts.regular,
                    lineHeight: 17,
                  }}
                >
                  Detect my device location
                </Text>
              )}
            </View>
            <MaterialIcons name="chevron-right" size={20} color={colors.primary} />
          </Pressable>
        ) : null}

        {/* Suggestion list */}
        {listData.length > 0 ? (
          <Animated.View
            style={{
              flex: 1,
              marginTop: isQueryActive ? 10 : 8,
              marginHorizontal: 16,
              backgroundColor: colors.surfaceElevated,
              borderRadius: 16,
              overflow: "hidden",
              borderWidth: 1,
              borderColor: colors.border,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: resolvedMode === "dark" ? 0.22 : 0.08,
              shadowRadius: 16,
              elevation: 4,
              opacity: listOpacity,
              transform: [{ translateY: listTranslateY }],
            }}
          >
            <FlatList
              ref={listRef}
              data={listData}
              renderItem={renderItem}
              keyExtractor={keyExtractor}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === "ios" ? "on-drag" : "none"}
              showsVerticalScrollIndicator={false}
              bounces={false}
              removeClippedSubviews
              getItemLayout={getItemLayout}
              initialNumToRender={8}
              maxToRenderPerBatch={10}
              windowSize={5}
            />
          </Animated.View>
        ) : null}

        {/* Empty state */}
        {showEmptyState ? (
          <Animated.View
            style={{
              alignItems: "center",
              marginTop: 56,
              paddingHorizontal: 32,
              opacity: listOpacity,
            }}
          >
            <View
              style={{
                width: 72,
                height: 72,
                borderRadius: 36,
                backgroundColor: colors.surfaceMuted,
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 16,
              }}
            >
              <MaterialIcons name="search-off" size={34} color={colors.iconMuted} />
            </View>
            <Text
              style={{
                fontSize: 16,
                fontFamily: ListifyFonts.semiBold,
                color: colors.textPrimary,
                textAlign: "center",
                marginBottom: 6,
              }}
            >
              No results found
            </Text>
            <Text
              style={{
                fontSize: 13.5,
                fontFamily: ListifyFonts.regular,
                color: colors.textSecondary,
                textAlign: "center",
                lineHeight: 20,
              }}
            >
              {`No locations match "${query.trim()}".`}
              {"\n"}Try a city name, landmark, or address.
            </Text>
          </Animated.View>
        ) : null}

        {/* Error state */}
        {showErrorState ? (
          <View
            style={{
              alignItems: "center",
              marginTop: 56,
              paddingHorizontal: 32,
            }}
          >
            <View
              style={{
                width: 72,
                height: 72,
                borderRadius: 36,
                backgroundColor: `${colors.danger}18`,
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 16,
              }}
            >
              <MaterialIcons name="wifi-off" size={32} color={colors.danger} />
            </View>
            <Text
              style={{
                fontSize: 16,
                fontFamily: ListifyFonts.semiBold,
                color: colors.textPrimary,
                textAlign: "center",
                marginBottom: 6,
              }}
            >
              Connection error
            </Text>
            <Text
              style={{
                fontSize: 13.5,
                fontFamily: ListifyFonts.regular,
                color: colors.textSecondary,
                textAlign: "center",
              }}
            >
              {predictionsError}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Selecting overlay */}
      {selecting ? (
        <View
          style={{
            ...StyleSheet_absoluteFill,
            backgroundColor: resolvedMode === "dark" ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.7)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : null}

      <View style={{ height: insets.bottom + 16 }} />

      {/* Permission / GPS disabled sheet */}
      <LocationPermissionSheet
        visible={permissionSheet.visible}
        reason={permissionSheet.reason}
        onOpenSettings={handlePermissionSheetSettings}
        onCancel={handlePermissionSheetCancel}
      />
    </View>
  );
}

const StyleSheet_absoluteFill = {
  position: "absolute" as const,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 99,
};








import { MaterialIcons } from "@expo/vector-icons";
import { useCallback, useMemo, useState } from "react";
import {
  Dimensions,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ProfileAvatarImage } from "@/components/profile-avatar-image";
import { ListifyFonts } from "@/constants/typography";
import { EventsDistrictCard } from "@/features/events/components/events-district-card";
import { EventsHubSwitcherModal } from "@/features/events/components/events-hub-switcher-modal";
import { EventsTripCard } from "@/features/events/components/events-trip-card";
import {
  FEATURED_EVENTS_DUMMY,
  type FeaturedEventDummy,
} from "@/features/events/data/events-discovery";
import {
  EVENTS_NEARBY_DUMMY,
  EVENTS_TRIP_DUMMY,
  type EventsHubTab,
  type EventsHubTabId,
} from "@/features/events/data/events-hub-discovery";
import {
  useLocalSearchParams,
  useRouter,
  type Href,
} from "@/lib/safe-router";
import { useTabNavigation } from "@/lib/use-tab-navigation";
import { useAppSelector } from "@/store/hooks";
import { selectLocationLabel } from "@/store/slices/location-slice";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const H_PAD = 16;
const NEARBY_CARD_W = SCREEN_WIDTH * 0.58;
const TRIP_CARD_W = SCREEN_WIDTH * 0.62;

function paramToString(value?: string | string[]) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export function EventsCategoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    categoryId?: string | string[];
    categoryLabel?: string | string[];
  }>();
  const user = useAppSelector((s) => s.auth.user);
  const locationLabel = useAppSelector(selectLocationLabel);
  const handleTabPress = useTabNavigation();

  const categoryId = paramToString(params.categoryId).toLowerCase();
  const categoryLabel = paramToString(params.categoryLabel);

  const [hubVisible, setHubVisible] = useState(true);
  const [activeHubTab, setActiveHubTab] = useState<EventsHubTabId>("events");
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  const locationTitle = useMemo(() => {
    const label = locationLabel?.trim() ?? "";
    if (!label || label === "Set location" || label.startsWith("Detecting")) {
      return "Set location";
    }
    return label.split(",").slice(0, 2).map((p) => p.trim()).join(", ");
  }, [locationLabel]);

  const nearbyEvents = useMemo(() => {
    const pool = [...EVENTS_NEARBY_DUMMY, ...FEATURED_EVENTS_DUMMY];
    if (!categoryId) return pool.slice(0, 8);
    const matched = pool.filter((e) => e.category === categoryId);
    return (matched.length > 0 ? matched : pool).slice(0, 8);
  }, [categoryId]);

  const tripEvents = useMemo(() => {
    if (!categoryId) return EVENTS_TRIP_DUMMY;
    const matched = EVENTS_TRIP_DUMMY.filter((e) => e.category === categoryId);
    return matched.length > 0 ? matched : EVENTS_TRIP_DUMMY;
  }, [categoryId]);

  const headerTitle = categoryLabel?.trim() || "Events";

  const toggleSave = useCallback((id: string) => {
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const openEvent = useCallback(
    (event: FeaturedEventDummy) => {
      router.push({
        pathname: "/event-detail",
        params: { id: event.id },
      } as Href);
    },
    [router],
  );

  const handleHubSelect = useCallback(
    (tab: EventsHubTab) => {
      setActiveHubTab(tab.id);
      setHubVisible(false);
      if (tab.id === "home") {
        handleTabPress("home");
        return;
      }
      if (tab.id === "events") return;
      // Other lifestyle tabs reserved for future hubs
    },
    [handleTabPress],
  );

  return (
    <View style={{ flex: 1, backgroundColor: "#0E0E10" }}>
      <EventsHubSwitcherModal
        visible={hubVisible}
        activeTab={activeHubTab}
        onClose={() => setHubVisible(false)}
        onSelect={handleHubSelect}
      />

      <View
        style={{
          paddingTop: insets.top + 8,
          paddingHorizontal: H_PAD,
          paddingBottom: 12,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
          <Pressable
            onPress={() => setHubVisible(true)}
            hitSlop={10}
            style={({ pressed }) => ({
              width: 40,
              height: 40,
              borderRadius: 20,
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.75 : 1,
            })}
          >
            <MaterialIcons name="home-filled" size={26} color="#FFFFFF" />
          </Pressable>

          <View style={{ marginLeft: 6, flex: 1 }}>
            <Text
              numberOfLines={1}
              style={{
                fontFamily: ListifyFonts.bold,
                fontSize: 26,
                color: "#FFFFFF",
                ...(Platform.OS === "android"
                  ? { includeFontPadding: false }
                  : {}),
              }}
            >
              {headerTitle}
            </Text>
            <Pressable
              onPress={() => router.push("/location-picker" as Href)}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                marginTop: 2,
                opacity: pressed ? 0.75 : 1,
                alignSelf: "flex-start",
                maxWidth: "100%",
              })}
            >
              <Text
                numberOfLines={1}
                style={{
                  fontFamily: ListifyFonts.medium,
                  fontSize: 13,
                  color: "rgba(255,255,255,0.72)",
                  maxWidth: SCREEN_WIDTH * 0.5,
                  ...(Platform.OS === "android"
                    ? { includeFontPadding: false }
                    : {}),
                }}
              >
                {locationTitle}
              </Text>
              <MaterialIcons
                name="keyboard-arrow-down"
                size={18}
                color="rgba(255,255,255,0.72)"
              />
            </Pressable>
          </View>
        </View>

        <Pressable
          onPress={() => handleTabPress("profile")}
          style={({ pressed }) => ({
            width: 40,
            height: 40,
            borderRadius: 20,
            overflow: "hidden",
            backgroundColor: "#2A2A2E",
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <ProfileAvatarImage user={user} iconSize={22} />
        </Pressable>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingBottom: Math.max(insets.bottom, 16) + 28,
        }}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: H_PAD,
            gap: 14,
            paddingTop: 4,
            paddingBottom: 8,
          }}
          decelerationRate="fast"
        >
          {nearbyEvents.map((event) => (
            <EventsDistrictCard
              key={event.id}
              event={event}
              cardWidth={NEARBY_CARD_W}
              onPress={() => openEvent(event)}
            />
          ))}
        </ScrollView>

        <Text
          style={{
            marginTop: 22,
            marginBottom: 14,
            paddingHorizontal: H_PAD,
            fontFamily: ListifyFonts.bold,
            fontSize: 22,
            color: "#FFFFFF",
            ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
          }}
        >
          Your next event trip
        </Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: H_PAD,
            gap: 14,
            paddingBottom: 8,
          }}
          decelerationRate="fast"
        >
          {tripEvents.map((event) => (
            <EventsTripCard
              key={event.id}
              event={event}
              cardWidth={TRIP_CARD_W}
              isSaved={savedIds.has(event.id)}
              onPress={() => openEvent(event)}
              onToggleSave={() => toggleSave(event.id)}
            />
          ))}
        </ScrollView>

        {categoryLabel ? (
          <View style={{ marginTop: 28, paddingHorizontal: H_PAD }}>
            <Text
              style={{
                fontFamily: ListifyFonts.bold,
                fontSize: 20,
                color: "#FFFFFF",
                marginBottom: 12,
                ...(Platform.OS === "android"
                  ? { includeFontPadding: false }
                  : {}),
              }}
            >
              More in {categoryLabel}
            </Text>
            <View style={{ gap: 16 }}>
              {FEATURED_EVENTS_DUMMY.filter((e) =>
                categoryId ? e.category === categoryId : true,
              )
                .slice(0, 4)
                .map((event) => (
                  <EventsDistrictCard
                    key={`more-${event.id}`}
                    event={event}
                    cardWidth={SCREEN_WIDTH - H_PAD * 2}
                    onPress={() => openEvent(event)}
                  />
                ))}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

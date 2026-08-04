import { memo } from "react";
import {
  Dimensions,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { ListifyFonts } from "@/constants/typography";
import {
  EVENTS_SEARCH_CATEGORIES,
  type EventsSearchCategory,
} from "@/features/events/data/events-search-discovery";
import { Image } from "@/lib/nativewind-interop";
import { useTheme } from "@/providers/theme-provider";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const H_PAD = 14;
const GAP = 8;
const COLS = 4;
const CARD_WIDTH = (SCREEN_WIDTH - H_PAD * 2 - GAP * (COLS - 1)) / COLS;
const CARD_HEIGHT = CARD_WIDTH * 1.55;
const ICON_SIZE = CARD_WIDTH * 0.96;

type EventsSearchExploreGridProps = {
  onSelect?: (category: EventsSearchCategory) => void;
};

function EventsSearchExploreGridImpl({ onSelect }: EventsSearchExploreGridProps) {
  const { colors, isDark } = useTheme();

  return (
    <View style={{ marginTop: 22, paddingHorizontal: H_PAD }}>
      <Text
        style={{
          fontFamily: ListifyFonts.bold,
          fontSize: 20,
          color: colors.textPrimary,
          marginBottom: 14,
          ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
        }}
      >
        Explore events
      </Text>

      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: GAP,
        }}
      >
        {EVENTS_SEARCH_CATEGORIES.map((item) => (
          <Pressable
            key={item.id}
            onPress={() => onSelect?.(item)}
            style={({ pressed }) => ({
              width: CARD_WIDTH,
              height: CARD_HEIGHT,
              borderRadius: 20,
              overflow: "hidden",
              opacity: pressed ? 0.9 : 1,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 3 },
              shadowOpacity: isDark ? 0.28 : 0.12,
              shadowRadius: 8,
              elevation: 3,
            })}
          >
            <LinearGradient
              colors={
                isDark
                  ? ["#2F2A22", "#221E18", "#16130F"]
                  : ["#FFFBF0", "#FFF4D6", "#FFE8A3"]
              }
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={{
                flex: 1,
                paddingTop: 12,
                paddingHorizontal: 4,
                alignItems: "center",
                borderWidth: isDark ? 1 : 0,
                borderColor: isDark ? "rgba(255,230,180,0.08)" : "transparent",
                borderRadius: 20,
              }}
            >
              <Text
                numberOfLines={2}
                style={{
                  fontFamily: ListifyFonts.bold,
                  fontSize: 11,
                  letterSpacing: 0.2,
                  textAlign: "center",
                  color: isDark ? "#F8E7C4" : "#5C3D1E",
                  ...(Platform.OS === "android"
                    ? { includeFontPadding: false }
                    : {}),
                }}
              >
                {item.label}
              </Text>
              <View
                style={{
                  flex: 1,
                  width: "100%",
                  alignItems: "center",
                  justifyContent: "center",
                  paddingBottom: 6,
                }}
              >
                <Image
                  source={item.icon}
                  contentFit="contain"
                  transition={120}
                  cachePolicy="memory-disk"
                  recyclingKey={`${item.id}-chroma-v2`}
                  style={{
                    width: ICON_SIZE,
                    height: ICON_SIZE,
                    backgroundColor: "transparent",
                  }}
                />
              </View>
            </LinearGradient>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export const EventsSearchExploreGrid = memo(EventsSearchExploreGridImpl);

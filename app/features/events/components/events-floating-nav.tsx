import { MaterialIcons } from "@expo/vector-icons";
import { memo } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ListifyFonts } from "@/constants/typography";
import { useEventsTheme } from "@/features/events/theme/events-theme";
import { useTheme } from "@/providers/theme-provider";

export type EventsFloatingNavTab = "events" | "search";

type EventsFloatingNavProps = {
  activeTab: EventsFloatingNavTab;
  onTabPress: (tab: EventsFloatingNavTab) => void;
  /** 0 = expanded (labels visible), 1 = collapsed (icons only) */
  collapseProgress: SharedValue<number>;
};

function EventsFloatingNavImpl({
  activeTab,
  onTabPress,
  collapseProgress,
}: EventsFloatingNavProps) {
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();
  const et = useEventsTheme();

  const barBg = isDark ? "rgba(40,40,44,0.92)" : "rgba(255,255,255,0.94)";
  const activeCircle = et.chipActiveBg;
  const labelColor = et.textPrimary;
  const mutedLabel = et.textMuted;
  const iconColor = et.icon;

  const pillStyle = useAnimatedStyle(() => {
    const p = collapseProgress.value;
    return {
      paddingVertical: interpolate(p, [0, 1], [10, 8], Extrapolation.CLAMP),
      paddingHorizontal: interpolate(p, [0, 1], [18, 14], Extrapolation.CLAMP),
      minWidth: interpolate(p, [0, 1], [168, 118], Extrapolation.CLAMP),
      gap: interpolate(p, [0, 1], [22, 14], Extrapolation.CLAMP),
    };
  });

  const labelStyle = useAnimatedStyle(() => {
    const p = collapseProgress.value;
    return {
      opacity: interpolate(p, [0, 0.55, 1], [1, 0.15, 0], Extrapolation.CLAMP),
      maxHeight: interpolate(p, [0, 1], [18, 0], Extrapolation.CLAMP),
      marginTop: interpolate(p, [0, 1], [4, 0], Extrapolation.CLAMP),
      transform: [
        {
          translateY: interpolate(p, [0, 1], [0, -4], Extrapolation.CLAMP),
        },
      ],
    };
  });

  const activeCircleStyle = useAnimatedStyle(() => {
    const p = collapseProgress.value;
    const size = interpolate(p, [0, 1], [54, 46], Extrapolation.CLAMP);
    return {
      width: size,
      height: size,
      borderRadius: size / 2,
      marginTop: interpolate(p, [0, 1], [-6, 0], Extrapolation.CLAMP),
    };
  });

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 60,
        alignItems: "center",
        paddingBottom: Math.max(insets.bottom, 12) + 6,
      }}
    >
      <Animated.View
        style={[
          {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 999,
            backgroundColor: barBg,
            borderWidth: isDark ? 1 : 0,
            borderColor: et.border,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: isDark ? 0.45 : 0.16,
            shadowRadius: 22,
            elevation: 16,
          },
          pillStyle,
        ]}
      >
        <Pressable
          onPress={() => onTabPress("events")}
          style={{ alignItems: "center", minWidth: 56 }}
        >
          <Animated.View
            style={[
              {
                alignItems: "center",
                justifyContent: "center",
                backgroundColor:
                  activeTab === "events" ? activeCircle : "transparent",
              },
              activeTab === "events" ? activeCircleStyle : { width: 46, height: 46 },
            ]}
          >
            <MaterialIcons
              name="mic"
              size={activeTab === "events" ? 24 : 22}
              color={iconColor}
            />
          </Animated.View>
          <Animated.View style={[{ overflow: "hidden" }, labelStyle]}>
            <Text
              style={{
                fontFamily: ListifyFonts.medium,
                fontSize: 12,
                color: activeTab === "events" ? labelColor : mutedLabel,
                textAlign: "center",
                ...(Platform.OS === "android"
                  ? { includeFontPadding: false }
                  : {}),
              }}
            >
              Events
            </Text>
          </Animated.View>
        </Pressable>

        <Pressable
          onPress={() => onTabPress("search")}
          style={{ alignItems: "center", minWidth: 56 }}
        >
          <View
            style={{
              width: 46,
              height: 46,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <MaterialIcons name="search" size={24} color={iconColor} />
          </View>
          <Animated.View style={[{ overflow: "hidden" }, labelStyle]}>
            <Text
              style={{
                fontFamily: ListifyFonts.medium,
                fontSize: 12,
                color: activeTab === "search" ? labelColor : mutedLabel,
                textAlign: "center",
                ...(Platform.OS === "android"
                  ? { includeFontPadding: false }
                  : {}),
              }}
            >
              Search
            </Text>
          </Animated.View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

export const EventsFloatingNav = memo(EventsFloatingNavImpl);

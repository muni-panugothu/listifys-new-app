import { MaterialIcons } from "@expo/vector-icons";
import { memo } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut, Layout } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  BOTTOM_NAV_TABS,
  type BottomNavTabId,
} from "@/constants/bottom-nav-tabs";
import { ListifyFonts } from "@/constants/typography";
import { useTheme } from "@/providers/theme-provider";

type FloatingBottomNavProps = {
  activeTabId: BottomNavTabId;
  onTabPress: (tabId: string) => void;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function FloatingBottomNavImpl({
  activeTabId,
  onTabPress,
}: FloatingBottomNavProps) {
  const insets = useSafeAreaInsets();
  const { colors, isDark, resolvedMode } = useTheme();

  const barBackground = isDark ? colors.surface : "#F3F4F6";
  const barBorder = isDark ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.12)";
  const activePillBackground = isDark ? "rgba(255,255,255,0.14)" : "#E5E7EB";
  const activePillBorder = isDark ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.1)";
  const activeColor = isDark ? colors.textPrimary : "#111827";
  const idleColor = isDark ? colors.iconMuted : "#6B7280";

  return (
    <View
      pointerEvents="box-none"
      className="absolute inset-x-0 bottom-5 z-50 items-center"
      style={{ paddingBottom: Math.max(insets.bottom, 10) }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          alignSelf: "center",
          borderRadius: 999,
          paddingHorizontal: 6,
          paddingVertical: 6,
          gap: 4,
          backgroundColor: barBackground,
          borderWidth: 1,
          borderColor: barBorder,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: resolvedMode === "dark" ? 0.4 : 0.12,
          shadowRadius: 20,
          elevation: 12,
        }}
      >
        {BOTTOM_NAV_TABS.map((tab) => {
          const isActive = tab.id === activeTabId;
          const iconName = isActive
            ? (tab.activeIcon ?? tab.icon)
            : tab.icon;
          const tint = isActive ? activeColor : idleColor;

          return (
            <AnimatedPressable
              key={tab.id}
              layout={Layout.springify().damping(18).stiffness(220)}
              onPress={() => onTabPress(tab.id)}
              style={({ pressed }) => ({
                alignItems: "center",
                justifyContent: "center",
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Animated.View
                layout={Layout.springify().damping(20).stiffness(240)}
                style={{
                  alignItems: "center",
                  justifyContent: "center",
                  paddingHorizontal: 16,
                  paddingVertical: 8,
                  borderRadius: 999,
                  backgroundColor: isActive
                    ? activePillBackground
                    : "transparent",
                  borderWidth: 1,
                  borderColor: isActive ? activePillBorder : "transparent",
                }}
              >
                {isActive ? (
                  <Animated.View
                    entering={FadeIn.duration(160)}
                    exiting={FadeOut.duration(100)}
                  >
                    <MaterialIcons name={iconName} size={22} color={tint} />
                  </Animated.View>
                ) : (
                  <MaterialIcons name={iconName} size={22} color={tint} />
                )}
                <Text
                  numberOfLines={1}
                  style={{
                    marginTop: 3,
                    fontFamily: isActive
                      ? ListifyFonts.bold
                      : ListifyFonts.medium,
                    fontSize: 11,
                    color: tint,
                  }}
                >
                  {tab.label}
                </Text>
              </Animated.View>
            </AnimatedPressable>
          );
        })}
      </View>
    </View>
  );
}

export const FloatingBottomNav = memo(FloatingBottomNavImpl);

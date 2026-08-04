import { memo } from "react";
import {
  Modal,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ListifyFonts } from "@/constants/typography";
import {
  EVENTS_HUB_TABS,
  type EventsHubTab,
  type EventsHubTabId,
} from "@/features/events/data/events-hub-discovery";
import { Image } from "@/lib/nativewind-interop";
import { useTheme } from "@/providers/theme-provider";

type EventsHubSwitcherModalProps = {
  visible: boolean;
  activeTab: EventsHubTabId;
  onClose: () => void;
  onSelect: (tab: EventsHubTab) => void;
};

function EventsHubSwitcherModalImpl({
  visible,
  activeTab,
  onClose,
  onSelect,
}: EventsHubSwitcherModalProps) {
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();

  const sheetBg = isDark ? "#1C1C1F" : "#F4F4F5";
  const labelColor = isDark ? "#F3F4F6" : "#111827";
  const selectedWell = isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)";
  const idleWell = isDark ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.95)";
  const wellBorder = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";
  const handleColor = isDark ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.16)";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Pressable
          onPress={onClose}
          style={{
            ...Platform.select({
              ios: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
              default: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
            }),
            backgroundColor: isDark ? "rgba(0,0,0,0.62)" : "rgba(15,15,18,0.45)",
          }}
        />

        <View
          style={{
            backgroundColor: sheetBg,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            paddingHorizontal: 18,
            paddingTop: 10,
            paddingBottom: Math.max(insets.bottom, 14) + 10,
            borderTopWidth: isDark ? 1 : 0,
            borderColor: "rgba(255,255,255,0.08)",
            shadowColor: "#000",
            shadowOffset: { width: 0, height: -8 },
            shadowOpacity: isDark ? 0.4 : 0.14,
            shadowRadius: 20,
            elevation: 24,
          }}
        >
          <View
            style={{
              alignSelf: "center",
              width: 42,
              height: 4,
              borderRadius: 999,
              backgroundColor: handleColor,
              marginBottom: 14,
            }}
          />

          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              justifyContent: "flex-start",
            }}
          >
            {EVENTS_HUB_TABS.map((tab) => {
              const selected = tab.id === activeTab;
              return (
                <Pressable
                  key={tab.id}
                  onPress={() => onSelect(tab)}
                  style={({ pressed }) => ({
                    width: "33.33%",
                    alignItems: "center",
                    paddingVertical: 8,
                    opacity: pressed ? 0.85 : 1,
                  })}
                >
                  <View
                    style={{
                      width: 82,
                      height: 82,
                      borderRadius: 24,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: selected ? selectedWell : idleWell,
                      borderWidth: 1,
                      borderColor: selected
                        ? isDark
                          ? "rgba(255,255,255,0.16)"
                          : "rgba(0,0,0,0.1)"
                        : wellBorder,
                      shadowColor: "#000",
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: isDark ? 0.25 : 0.06,
                      shadowRadius: 6,
                      elevation: selected ? 3 : 1,
                    }}
                  >
                    <Image
                      source={tab.icon}
                      contentFit="contain"
                      transition={100}
                      cachePolicy="memory-disk"
                      recyclingKey={`hub-${tab.id}-clean-v2`}
                      style={{
                        width: 58,
                        height: 58,
                        backgroundColor: "transparent",
                      }}
                    />
                  </View>
                  <Text
                    style={{
                      marginTop: 8,
                      fontFamily: ListifyFonts.medium,
                      fontSize: 13,
                      color: labelColor,
                      ...(Platform.OS === "android"
                        ? { includeFontPadding: false }
                        : {}),
                    }}
                  >
                    {tab.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

export const EventsHubSwitcherModal = memo(EventsHubSwitcherModalImpl);

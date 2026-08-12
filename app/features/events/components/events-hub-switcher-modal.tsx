import { memo } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ListifyFonts } from "@/constants/typography";
import {
  MARKETPLACE_HUB_TABS,
  type MarketplaceHubTab,
  type MarketplaceHubTabId,
} from "@/features/home/data/home-hub-tabs";
import { Image } from "@/lib/nativewind-interop";
import { useEventsTheme } from "@/features/events/theme/events-theme";
import { useTheme } from "@/providers/theme-provider";

type EventsHubSwitcherModalProps = {
  visible: boolean;
  activeTab: MarketplaceHubTabId;
  onClose: () => void;
  onSelect: (tab: MarketplaceHubTab) => void;
};

function EventsHubSwitcherModalImpl({
  visible,
  activeTab,
  onClose,
  onSelect,
}: EventsHubSwitcherModalProps) {
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();
  const et = useEventsTheme();
  const { colors } = et;

  const sheetBg = et.surfaceSecondary;
  const labelColor = et.textPrimary;
  const selectedWell = et.chipActiveBg;
  const idleWell = et.chipBg;
  const wellBorder = et.border;
  const handleColor = et.divider;

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
            backgroundColor: colors.scrim,
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
            borderColor: et.border,
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

          <ScrollView
            showsVerticalScrollIndicator={false}
            style={{ maxHeight: 420 }}
            contentContainerStyle={{
              flexDirection: "row",
              flexWrap: "wrap",
              justifyContent: "flex-start",
              paddingBottom: 4,
            }}
          >
            {MARKETPLACE_HUB_TABS.map((tab) => {
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
                      borderColor: selected ? et.chipActiveBorder : wellBorder,
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
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export const EventsHubSwitcherModal = memo(EventsHubSwitcherModalImpl);

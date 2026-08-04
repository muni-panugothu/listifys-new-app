import { MaterialIcons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ListifyFonts } from "@/constants/typography";
import { useTheme } from "@/providers/theme-provider";
import type { ThemeMode } from "@/theme/theme-tokens";

type AppearanceBottomSheetProps = {
  visible: boolean;
  onClose: () => void;
};

type Option = {
  id: ThemeMode;
  label: string;
};

const OPTIONS: Option[] = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "system", label: "Use device theme" },
];

export function AppearanceBottomSheet({
  visible,
  onClose,
}: AppearanceBottomSheetProps) {
  const insets = useSafeAreaInsets();
  const { mode: savedMode, colors, setMode } = useTheme();
  const [pending, setPending] = useState<ThemeMode>(savedMode);
  const [saving, setSaving] = useState(false);

  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(visible ? 1 : 0, {
      duration: visible ? 260 : 200,
      easing: Easing.out(Easing.cubic),
    });
    if (visible) setPending(savedMode);
  }, [visible, savedMode, progress]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(progress.value, [0, 1], [400, 0]),
      },
    ],
    opacity: progress.value,
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0, 1]),
  }));

  /** Apply instantly so the whole app flips while the sheet is still open. */
  const handleSelect = (next: ThemeMode) => {
    setPending(next);
    void setMode(next);
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      // Ensure the pending value is persisted even if select was skipped.
      if (pending !== savedMode) {
        await setMode(pending);
      }
    } finally {
      setSaving(false);
      onClose();
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View className="flex-1 justify-end">
        <Animated.View
          style={[
            { position: "absolute", inset: 0, backgroundColor: colors.scrim },
            backdropStyle,
          ]}
        >
          <Pressable style={{ flex: 1 }} onPress={onClose} />
        </Animated.View>

        <Animated.View
          style={[
            {
              backgroundColor: colors.surface,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              paddingBottom: Math.max(insets.bottom + 12, 24),
              paddingTop: 8,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: -6 },
              shadowOpacity: 0.14,
              shadowRadius: 20,
              elevation: 20,
            },
            sheetStyle,
          ]}
        >
          <View
            style={{
              alignSelf: "center",
              width: 44,
              height: 5,
              borderRadius: 3,
              backgroundColor: colors.border,
              marginTop: 6,
              marginBottom: 12,
            }}
          />

          <View className="flex-row items-center justify-between px-5 pb-3">
            <Text
              className="text-[20px]"
              style={{
                fontFamily: ListifyFonts.bold,
                color: colors.textPrimary,
                ...(Platform.OS === "android"
                  ? { includeFontPadding: false }
                  : {}),
              }}
            >
              Appearance
            </Text>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              className="h-9 w-9 items-center justify-center rounded-full"
              style={({ pressed }) => ({
                backgroundColor: colors.surfaceMuted,
                opacity: pressed ? 0.75 : 1,
              })}
            >
              <MaterialIcons name="close" size={20} color={colors.icon} />
            </Pressable>
          </View>

          <View>
            {OPTIONS.map((opt, idx) => {
              const selected = pending === opt.id;
              return (
                <Pressable
                  key={opt.id}
                  onPress={() => handleSelect(opt.id)}
                  className="flex-row items-center justify-between px-5 py-4"
                  style={({ pressed }) => ({
                    opacity: pressed ? 0.85 : 1,
                    borderTopWidth: idx === 0 ? 1 : 0,
                    borderTopColor: colors.border,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border,
                  })}
                >
                  <Text
                    className="text-[16px]"
                    style={{
                      fontFamily: ListifyFonts.semiBold,
                      color: colors.textPrimary,
                      ...(Platform.OS === "android"
                        ? { includeFontPadding: false }
                        : {}),
                    }}
                  >
                    {opt.label}
                  </Text>
                  <View
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      borderWidth: selected ? 0 : 1.5,
                      borderColor: colors.borderStrong,
                      backgroundColor: selected ? colors.primary : "transparent",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {selected ? (
                      <View
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 4,
                          backgroundColor: colors.textOnPrimary,
                        }}
                      />
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>

          <View className="px-5 pt-5">
            <Pressable
              onPress={handleSave}
              disabled={saving}
              className="items-center rounded-full py-4"
              style={({ pressed }) => ({
                backgroundColor: colors.textPrimary,
                opacity: pressed || saving ? 0.85 : 1,
              })}
            >
              <Text
                className="text-[16px]"
                style={{
                  fontFamily: ListifyFonts.semiBold,
                  color: colors.background,
                  ...(Platform.OS === "android"
                    ? { includeFontPadding: false }
                    : {}),
                }}
              >
                Save preference
              </Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

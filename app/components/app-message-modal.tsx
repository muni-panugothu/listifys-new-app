import { MaterialIcons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";

import { ListifyFonts } from "@/constants/typography";
import {
  subscribeMessageModals,
  type MessageModalPayload,
  type MessageModalType,
} from "@/lib/message-modal";
import { useTheme } from "@/providers/theme-provider";

const ICON_BY_TYPE: Record<MessageModalType, { name: keyof typeof MaterialIcons.glyphMap; color: string; bg: string }> = {
  error: { name: "error-outline", color: "#BA1A1A", bg: "rgba(186,26,26,0.1)" },
  success: { name: "check-circle", color: "#1D9477", bg: "rgba(39,187,151,0.12)" },
  info: { name: "info-outline", color: "#2563EB", bg: "rgba(37,99,235,0.1)" },
};

export function AppMessageModal() {
  const [visible, setVisible] = useState(false);
  const [payload, setPayload] = useState<MessageModalPayload | null>(null);
  const { colors } = useTheme();

  useEffect(() => {
    return subscribeMessageModals((next) => {
      setPayload(next);
      setVisible(true);
    });
  }, []);

  const dismiss = () => setVisible(false);

  const icon = payload ? ICON_BY_TYPE[payload.type] : ICON_BY_TYPE.error;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={dismiss}
    >
      <View
        className="flex-1 items-center justify-center p-4"
        style={{ backgroundColor: colors.scrim }}
      >
        <Pressable className="absolute inset-0" onPress={dismiss} />
        <View
          className="w-full max-w-sm overflow-hidden rounded-2xl"
          style={{
            backgroundColor: colors.surface,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.25,
            shadowRadius: 24,
            elevation: 12,
          }}
        >
          <View className="items-center p-6">
            <View
              className="mb-4 h-16 w-16 items-center justify-center rounded-full"
              style={{ backgroundColor: icon.bg }}
            >
              <MaterialIcons name={icon.name} size={30} color={icon.color} />
            </View>

            <Text
              className="mb-2 text-center text-[20px]"
              style={{
                fontFamily: ListifyFonts.semiBold,
                color: colors.textPrimary,
              }}
            >
              {payload?.title}
            </Text>
            {payload?.message && payload.message !== payload.title ? (
              <Text
                className="mb-6 text-center text-[14px] leading-5"
                style={{
                  fontFamily: ListifyFonts.regular,
                  color: colors.textSecondary,
                }}
              >
                {payload.message}
              </Text>
            ) : (
              <View className="mb-6" />
            )}

            <Pressable
              onPress={dismiss}
              className="h-12 w-full items-center justify-center rounded-xl"
              style={({ pressed }) => ({
                opacity: pressed ? 0.88 : 1,
                backgroundColor: colors.textPrimary,
              })}
            >
              <Text
                className="text-[16px]"
                style={{
                  fontFamily: ListifyFonts.semiBold,
                  color: colors.background,
                }}
              >
                OK
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

import { MaterialIcons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";

import { ListifyFonts } from "@/constants/typography";
import {
  subscribeMessageModals,
  type MessageModalPayload,
  type MessageModalType,
} from "@/lib/message-modal";
import { useTheme } from "@/providers/theme-provider";

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

  const icon = useMemo(() => {
    const type: MessageModalType = payload?.type ?? "error";
    if (type === "success") {
      return {
        name: "check-circle" as const,
        color: colors.primaryDeep,
        bg: colors.primarySoft,
      };
    }
    if (type === "info") {
      return {
        name: "info-outline" as const,
        color: colors.accentBlue,
        bg: "rgba(37,99,235,0.14)",
      };
    }
    return {
      name: "error-outline" as const,
      color: colors.danger,
      bg: "rgba(239,68,68,0.14)",
    };
  }, [colors, payload?.type]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={dismiss}
    >
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: 16,
          backgroundColor: colors.scrim,
        }}
      >
        <Pressable style={{ position: "absolute", inset: 0 }} onPress={dismiss} />
        <View
          style={{
            width: "100%",
            maxWidth: 360,
            overflow: "hidden",
            borderRadius: 20,
            backgroundColor: colors.surfaceElevated,
            borderWidth: 1,
            borderColor: colors.border,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.25,
            shadowRadius: 24,
            elevation: 12,
          }}
        >
          <View style={{ alignItems: "center", padding: 24 }}>
            <View
              style={{
                marginBottom: 16,
                height: 64,
                width: 64,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 32,
                backgroundColor: icon.bg,
              }}
            >
              <MaterialIcons name={icon.name} size={30} color={icon.color} />
            </View>

            <Text
              style={{
                marginBottom: 8,
                textAlign: "center",
                fontSize: 20,
                fontFamily: ListifyFonts.semiBold,
                color: colors.textPrimary,
              }}
            >
              {payload?.title}
            </Text>
            {payload?.message && payload.message !== payload.title ? (
              <Text
                style={{
                  marginBottom: 24,
                  textAlign: "center",
                  fontSize: 14,
                  lineHeight: 20,
                  fontFamily: ListifyFonts.regular,
                  color: colors.textSecondary,
                }}
              >
                {payload.message}
              </Text>
            ) : (
              <View style={{ marginBottom: 24 }} />
            )}

            <Pressable
              onPress={dismiss}
              style={({ pressed }) => ({ width: "100%", opacity: pressed ? 0.9 : 1 })}
            >
              <View
                style={{
                  minHeight: 48,
                  borderRadius: 14,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: colors.primary,
                }}
              >
                <Text
                  style={{
                    fontSize: 16,
                    fontFamily: ListifyFonts.semiBold,
                    color: colors.textOnPrimary,
                  }}
                >
                  OK
                </Text>
              </View>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

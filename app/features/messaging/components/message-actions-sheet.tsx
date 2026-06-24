/**
 * MessageActionsSheet — WhatsApp-style long-press context menu.
 *
 * Actions surfaced (in this order, when applicable):
 *   Reply
 *   Copy        (text messages only)
 *   Delete for me                (always)
 *   Delete for everyone          (sender only, within 2h of sending)
 */
import { Modal, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialIcons } from "@expo/vector-icons";
import { ListifyFonts } from "@/constants/typography";
import type { ChatMessage } from "@/features/messaging/services/chat-api";

const TEXT_DARK = "#1A1A1A";
const SOFT_RED  = "#DC2626";

const DELETE_FOR_EVERYONE_WINDOW_MS = 2 * 60 * 60 * 1000;

export type MessageAction = "reply" | "copy" | "deleteForMe" | "deleteForEveryone";

type Props = {
  visible: boolean;
  message: ChatMessage | null;
  currentUserId?: string;
  onClose: () => void;
  onSelect: (action: MessageAction) => void;
};

function senderIdOf(m: ChatMessage): string {
  const s = m.sender;
  if (typeof s === "string") return s;
  return String((s as any)?.id ?? (s as any)?._id ?? "");
}

export function MessageActionsSheet({ visible, message, currentUserId, onClose, onSelect }: Props) {
  const insets = useSafeAreaInsets();
  if (!message) return null;

  const isMine = !!currentUserId && senderIdOf(message) === currentUserId;
  const isText = (message.messageType || "text") === "text";
  const isAlreadyDeleted = !!message.deletedForEveryone;
  const ageMs = Date.now() - new Date(message.createdAt).getTime();
  const canDeleteForEveryone = isMine && !isAlreadyDeleted && ageMs < DELETE_FOR_EVERYONE_WINDOW_MS;

  const choose = (action: MessageAction) => {
    onClose();
    // Defer the action one tick so the Modal close animation can start. Some
    // actions (delete for everyone) trigger a confirm dialog and we don't want
    // it racing the sheet dismissal.
    setTimeout(() => onSelect(action), 16);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent={false} onRequestClose={onClose}>
      <View style={{ flex: 1 }}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)" }} onPress={onClose} />
        <View
          style={{
            backgroundColor: "#fff",
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            paddingTop: 12,
            paddingBottom: Math.max(insets.bottom, 12),
          }}
        >
          <View
            style={{
              alignSelf: "center",
              width: 40, height: 4,
              borderRadius: 2,
              backgroundColor: "#E5E7EB",
              marginBottom: 4,
            }}
          />
          {!isAlreadyDeleted && (
            <Row icon="reply" label="Reply" onPress={() => choose("reply")} />
          )}
          {isText && !isAlreadyDeleted && (
            <Row icon="content-copy" label="Copy" onPress={() => choose("copy")} />
          )}
          <Row icon="delete-outline" label="Delete for me" onPress={() => choose("deleteForMe")} />
          {canDeleteForEveryone && (
            <Row
              icon="delete-forever"
              label="Delete for everyone"
              danger
              onPress={() => choose("deleteForEveryone")}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

function Row({
  icon,
  label,
  danger,
  onPress,
}: {
  icon: React.ComponentProps<typeof MaterialIcons>["name"];
  label: string;
  danger?: boolean;
  onPress: () => void;
}) {
  const color = danger ? SOFT_RED : TEXT_DARK;
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: "#F3F4F6" }}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 16,
        paddingHorizontal: 20,
        paddingVertical: 14,
        backgroundColor: pressed ? "#F9FAFB" : "transparent",
      })}
    >
      <MaterialIcons name={icon} size={22} color={color} />
      <Text style={{ fontFamily: ListifyFonts.regular, fontSize: 15, color }}>{label}</Text>
    </Pressable>
  );
}

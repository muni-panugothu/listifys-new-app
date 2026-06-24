/**
 * RepliedMessagePreview — the small reply-snippet that lives *inside* a chat
 * bubble, above the actual message body. Tapping it can jump the parent list
 * to the original message (caller wires `onPress`).
 */
import { Pressable, Text, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { Image } from "@/lib/nativewind-interop";
import { resolveAbsoluteMediaUrl } from "@/features/auth/services/auth-api";
import { ListifyFonts } from "@/constants/typography";
import type { ChatMessage, ChatParticipant } from "@/features/messaging/services/chat-api";

const BRAND     = "#27BB97";
const TEXT_DARK = "#1A1A1A";

type ReplyObj = Exclude<NonNullable<ChatMessage["replyTo"]>, string>;

function senderName(reply: ReplyObj, currentUserId?: string): string {
  const s = reply.sender;
  if (!s) return "User";
  const p = s as ChatParticipant;
  return p.id === currentUserId ? "You" : (p.name || "User");
}

function buildMeta(reply: ReplyObj): {
  icon: keyof typeof MaterialIcons.glyphMap | null;
  preview: string;
  thumbUrl: string | null;
} {
  const attachments = reply.attachments || [];
  const first = attachments[0];
  const thumb = first?.url ? (resolveAbsoluteMediaUrl(first.url) as string | null) : null;

  if (first) {
    const t = String(first.type || first.mimeType || "").toLowerCase();
    if (t.includes("audio")) return { icon: "mic", preview: "Voice message", thumbUrl: null };
    if (t.includes("video")) return { icon: "videocam", preview: "Video", thumbUrl: thumb };
    if (t.includes("image")) return { icon: "photo-camera", preview: "Photo", thumbUrl: thumb };
    return { icon: "attach-file", preview: first.name || "Document", thumbUrl: null };
  }
  const content = (reply.content || "").trim();
  return { icon: null, preview: content.length > 0 ? content : "Message", thumbUrl: null };
}

type Props = {
  replyTo: NonNullable<ChatMessage["replyTo"]>;
  currentUserId?: string;
  fromMe: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
};

export function RepliedMessagePreview({ replyTo, currentUserId, fromMe, onPress, onLongPress }: Props) {
  if (!replyTo || typeof replyTo === "string") return null;
  const meta = buildMeta(replyTo);

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={250}
      style={{
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: fromMe ? "rgba(255,255,255,0.20)" : "rgba(39,187,151,0.10)",
        borderRadius: 8,
        paddingVertical: 6,
        paddingHorizontal: 8,
        marginBottom: 6,
        gap: 8,
        minHeight: 42,
      }}
    >
      <View
        style={{
          width: 3,
          alignSelf: "stretch",
          backgroundColor: fromMe ? "#fff" : BRAND,
          borderRadius: 2,
        }}
      />
      <View style={{ flex: 1, justifyContent: "center" }}>
        <Text
          numberOfLines={1}
          style={{
            fontFamily: ListifyFonts.semiBold,
            fontSize: 11,
            color: fromMe ? "#fff" : BRAND,
            marginBottom: 2,
          }}
        >
          {senderName(replyTo, currentUserId)}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          {meta.icon && (
            <MaterialIcons
              name={meta.icon}
              size={12}
              color={fromMe ? "rgba(255,255,255,0.85)" : TEXT_DARK}
            />
          )}
          <Text
            numberOfLines={1}
            style={{
              flex: 1,
              fontFamily: ListifyFonts.regular,
              fontSize: 12,
              color: fromMe ? "rgba(255,255,255,0.9)" : TEXT_DARK,
            }}
          >
            {meta.preview}
          </Text>
        </View>
      </View>
      {meta.thumbUrl && (
        <Image
          source={{ uri: meta.thumbUrl }}
          style={{ width: 36, height: 36, borderRadius: 6 }}
          contentFit="cover"
        />
      )}
    </Pressable>
  );
}

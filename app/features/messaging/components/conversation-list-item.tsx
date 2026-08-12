import { MaterialIcons } from "@expo/vector-icons";
import { memo } from "react";
import { Pressable, Text, View } from "react-native";

import { ProfileAvatarImage } from "@/components/profile-avatar-image";
import { OnlinePresenceDot } from "@/components/online-presence-dot";
import { ListifyFonts } from "@/constants/typography";
import { MessageStatusIcon } from "@/features/messaging/components/message-status-icon";
import { UnreadCountBadge } from "@/features/messaging/components/unread-count-badge";
import type { Conversation } from "@/features/messaging/services/chat-api";
import { formatChatListTime } from "@/features/messaging/utils/format-chat-list-time";
import { useMinuteTick } from "@/hooks/use-minute-tick";
import { useTheme } from "@/providers/theme-provider";

type ConversationListItemProps = {
  conv: Conversation;
  userId?: string | null;
  isOnline?: boolean;
  onPress: (conv: Conversation) => void;
  showDivider?: boolean;
};

function getOtherParticipant(conv: Conversation, userId?: string | null) {
  return (
    conv.participants.find((p) => {
      const pid = p.id || p._id;
      return pid && pid !== userId && pid !== "me";
    }) ?? conv.participants[0]
  );
}

function buildPreview(conv: Conversation, userId?: string | null): string {
  const lastMsg = conv.lastMessage;
  if (!lastMsg) return "No messages yet";

  if (lastMsg.messageType === "offer") return "Offer update";

  if (lastMsg.content) return lastMsg.content;

  if (lastMsg.attachments?.length) {
    const type = lastMsg.attachments[0]?.type;
    if (type === "image") return "Sent a photo";
    if (type === "video") return "Sent a video";
    if (type === "audio") return "Sent a voice message";
    return "Sent an attachment";
  }

  return "No messages yet";
}

function ConversationListItemImpl({
  conv,
  userId,
  isOnline = false,
  onPress,
  showDivider = true,
}: ConversationListItemProps) {
  const { colors, resolvedMode } = useTheme();
  const other = getOtherParticipant(conv, userId);
  const otherName = other?.name?.trim() || "User";
  const lastMsg = conv.lastMessage;
  useMinuteTick(Boolean(lastMsg?.createdAt));
  const unread = conv.unreadCount ?? 0;
  const isUnread = unread > 0;
  const isMine = lastMsg?.sender && String(lastMsg.sender) === String(userId);
  const preview = buildPreview(conv, userId);
  const timeLabel = lastMsg?.createdAt ? formatChatListTime(lastMsg.createdAt) : "";

  const nameWeight = isUnread ? ListifyFonts.bold : ListifyFonts.semiBold;
  const previewColor = isUnread ? colors.textPrimary : colors.textSecondary;
  const previewWeight = isUnread ? ListifyFonts.medium : ListifyFonts.regular;

  return (
    <Pressable
      onPress={() => onPress(conv)}
      style={({ pressed }) => ({
        opacity: pressed ? 0.88 : 1,
        backgroundColor: colors.background,
      })}
    >
      <View className="flex-row items-center px-5 py-3.5">
        <View className="relative">
          <View
            className="overflow-hidden rounded-full"
            style={{
              width: 56,
              height: 56,
              backgroundColor: colors.surfaceMuted,
            }}
          >
            <ProfileAvatarImage
              user={{
                profileImageUrl: other?.profileImageUrl,
                name: otherName,
              }}
              fallbackName={otherName}
              className="h-full w-full"
              iconSize={28}
            />
          </View>
          <OnlinePresenceDot
            visible={isOnline}
            size={14}
            borderColor={colors.background}
            borderWidth={2.5}
          />
        </View>

        <View className="ml-3.5 min-w-0 flex-1">
          <View className="flex-row items-start justify-between gap-2">
            <Text
              className="flex-1 text-[16px] leading-[21px]"
              style={{ fontFamily: nameWeight, color: colors.textPrimary }}
              numberOfLines={1}
            >
              {otherName}
            </Text>
            <View className="items-end gap-1.5">
              {timeLabel ? (
                <Text
                  className="text-[12px] leading-4"
                  style={{
                    fontFamily: ListifyFonts.regular,
                    color: colors.textTertiary,
                  }}
                >
                  {timeLabel}
                </Text>
              ) : null}
              {isUnread ? <UnreadCountBadge count={unread} /> : null}
            </View>
          </View>

          <View className="mt-1 flex-row items-center gap-2">
            <Text
              className="flex-1 text-[14px] leading-[19px]"
              style={{
                fontFamily: previewWeight,
                color: previewColor,
              }}
              numberOfLines={1}
            >
              {preview}
            </Text>

            {isMine && lastMsg?.status ? (
              <MessageStatusIcon
                status={lastMsg.status}
                readColor={resolvedMode === "dark" ? colors.primary : "#FF4D6A"}
                mutedColor={colors.iconMuted}
                size={15}
              />
            ) : null}
          </View>
        </View>
      </View>

      {showDivider ? (
        <View
          style={{
            height: 1,
            marginLeft: 88,
            backgroundColor: colors.border,
            opacity: resolvedMode === "dark" ? 0.55 : 0.85,
          }}
        />
      ) : null}
    </Pressable>
  );
}

export const ConversationListItem = memo(ConversationListItemImpl);

export function ConversationListSkeleton() {
  const { colors } = useTheme();

  return (
    <View className="px-5 py-3.5">
      <View className="flex-row items-center">
        <View
          className="rounded-full"
          style={{ width: 56, height: 56, backgroundColor: colors.skeleton }}
        />
        <View className="ml-3.5 flex-1 gap-2">
          <View
            className="rounded-md"
            style={{ width: "45%", height: 14, backgroundColor: colors.skeleton }}
          />
          <View
            className="rounded-md"
            style={{ width: "72%", height: 12, backgroundColor: colors.skeleton }}
          />
        </View>
      </View>
    </View>
  );
}

import { MaterialIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { type Href, useRouter } from "@/lib/safe-router";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  BackHandler,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ListifyFonts } from "@/constants/typography";
import { resolveAbsoluteMediaUrl } from "@/features/auth/services/auth-api";
import {
  getConversations,
  type Conversation,
} from "@/features/messaging/services/chat-api";
import {
  connectSocket,
  getSocket,
  requestUnreadCount,
} from "@/features/messaging/services/socket-service";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { Image } from "@/lib/nativewind-interop";
import { useTheme } from "@/providers/theme-provider";
import { useTabNavigation } from "@/lib/use-tab-navigation";
import { useAppSelector } from "@/store/hooks";

type FilterKey = "all" | "unread";

const FILTER_OPTIONS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
];

function formatChatTime(dateStr: string) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

type ConversationRowProps = {
  conv: Conversation;
  userId?: string | null;
  onPress: (conv: Conversation) => void;
};

function ConversationRowImpl({ conv, userId, onPress }: ConversationRowProps) {
  const { colors } = useTheme();
  const other =
    conv.participants.find((p) => {
      const pid = p.id || p._id;
      return pid && pid !== userId && pid !== "me";
    }) ?? conv.participants[0];

  const otherName = other?.name ?? "User";
  const avatar = resolveAbsoluteMediaUrl(other?.profileImageUrl);
  const lastMsg = conv.lastMessage;
  const productTitle = conv.listing?.listingTitle?.trim();
  const productImage = resolveAbsoluteMediaUrl(conv.listing?.listingImage);
  const lastMsgText =
    lastMsg?.messageType === "offer"
      ? "Offer update"
      : lastMsg?.content ??
        (lastMsg?.attachments?.length ? "Attachment" : productTitle ?? "");
  const lastMsgTime = lastMsg?.createdAt
    ? formatChatTime(lastMsg.createdAt)
    : "";
  const myUnread = conv.unreadCount ?? 0;

  return (
    <Pressable
      onPress={() => onPress(conv)}
      className="flex-row items-center px-5 py-3.5"
      style={({ pressed }) => ({ opacity: pressed ? 0.88 : 1 })}
    >
      {productImage ? (
        <Image
          source={productImage}
          contentFit="cover"
          cachePolicy="memory-disk"
          className="h-14 w-14 rounded-xl border border-slate-100"
        />
      ) : avatar ? (
        <Image
          source={avatar}
          contentFit="cover"
          cachePolicy="memory-disk"
          className="h-14 w-14 rounded-full"
        />
      ) : (
        <View
          className="h-14 w-14 items-center justify-center rounded-full"
          style={{ backgroundColor: colors.surfaceMuted }}
        >
          <MaterialIcons name="person" size={28} color={colors.iconMuted} />
        </View>
      )}

      <View className="ml-3.5 min-w-0 flex-1">
        <View className="flex-row items-start justify-between gap-2">
          <Text
            className="flex-1 text-[17px]"
            style={{ fontFamily: ListifyFonts.semiBold, color: colors.textPrimary }}
            numberOfLines={1}
          >
            {productTitle || otherName}
          </Text>
          <View className="items-end">
            {lastMsgTime ? (
              <Text
                className="text-[13px]"
                style={{ fontFamily: ListifyFonts.regular, color: colors.textTertiary }}
              >
                {lastMsgTime}
              </Text>
            ) : null}
            {myUnread > 0 ? (
              <View
                className="mt-1 min-h-5 min-w-5 items-center justify-center rounded-full px-1.5"
                style={{ backgroundColor: colors.primary }}
              >
                <Text
                  className="text-[11px] text-white"
                  style={{ fontFamily: ListifyFonts.bold }}
                >
                  {myUnread > 99 ? "99+" : myUnread}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
        {productTitle ? (
          <Text
            className="mt-0.5 text-[12px]"
            style={{ fontFamily: ListifyFonts.regular, color: colors.textSecondary }}
            numberOfLines={1}
          >
            {otherName}
          </Text>
        ) : null}
        <Text
          className="mt-0.5 text-[15px]"
          style={{ fontFamily: ListifyFonts.regular, color: colors.textTertiary }}
          numberOfLines={2}
        >
          {lastMsgText}
        </Text>
      </View>
    </Pressable>
  );
}

const ConversationRow = memo(ConversationRowImpl);

export function MessagesInboxScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const user = useAppSelector((s) => s.auth.user);
  const handleBottomTabPress = useTabNavigation();

  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      const onHardwareBack = () => {
        handleBottomTabPress("home");
        return true;
      };
      const sub = BackHandler.addEventListener("hardwareBackPress", onHardwareBack);
      return () => sub.remove();
    }, [handleBottomTabPress]),
  );

  const loadConversations = useCallback(async () => {
    try {
      const res = await getConversations();
      setConversations(res.conversations ?? []);
      setLoadError(null);
    } catch {
      setConversations([]);
      setLoadError("Could not load chats. Pull to refresh.");
    }
  }, []);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  useFocusEffect(
    useCallback(() => {
      void loadConversations();
    }, [loadConversations]),
  );

  useEffect(() => {
    let cancelled = false;
    let socketRef: ReturnType<typeof getSocket> = null;

    const refresh = () => void loadConversations();

    void connectSocket()
      .then((socket) => {
        if (cancelled) return;
        socketRef = socket;
        socket.on("chat:message", refresh);
        socket.on("chat:conversation_update", refresh);
        socket.on("chat:offer", refresh);
        socket.on("chat:offer_update", refresh);
        socket.on("message:new", refresh);
        socket.on("conversation:unread_update", refresh);
        requestUnreadCount();
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      if (!socketRef) return;
      socketRef.off("chat:message", refresh);
      socketRef.off("chat:conversation_update", refresh);
      socketRef.off("chat:offer", refresh);
      socketRef.off("chat:offer_update", refresh);
      socketRef.off("message:new", refresh);
      socketRef.off("conversation:unread_update", refresh);
    };
  }, [loadConversations]);

  const { refreshing, onRefresh } = usePullToRefresh(loadConversations);

  const getOtherParticipant = useCallback(
    (conv: Conversation) => {
      return (
        conv.participants.find((p) => {
          const pid = p.id || p._id;
          return pid && pid !== user?.id && pid !== "me";
        }) ?? conv.participants[0]
      );
    },
    [user?.id],
  );

  const unreadCount = useMemo(
    () => conversations.reduce((sum, c) => sum + (c.unreadCount ?? 0), 0),
    [conversations],
  );

  const filtered = useMemo(() => {
    let list = conversations;

    if (activeFilter === "unread") {
      list = list.filter((c) => (c.unreadCount ?? 0) > 0);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((c) => {
        const other = getOtherParticipant(c);
        const preview = c.lastMessage?.content ?? "";
        return (
          other?.name?.toLowerCase().includes(q) ||
          preview.toLowerCase().includes(q) ||
          c.listing?.listingTitle?.toLowerCase().includes(q)
        );
      });
    }

    return list.sort((a, b) => {
      const at = a.lastMessage?.createdAt ?? a.updatedAt;
      const bt = b.lastMessage?.createdAt ?? b.updatedAt;
      return new Date(bt).getTime() - new Date(at).getTime();
    });
  }, [activeFilter, conversations, getOtherParticipant, searchQuery]);

  const openChat = useCallback(
    (conv: Conversation) => {
      const other = getOtherParticipant(conv);
      const otherName = other?.name ?? "User";
      const otherId = other?.id || other?._id;

      if (!otherId) return;

      const listing = conv.listing;
      router.push({
        pathname: "/chat-conversation",
        params: {
          conversationId: conv._id,
          recipientId: otherId,
          name: otherName,
          ...(other?.profileImageUrl ? { contactImage: other.profileImageUrl } : {}),
          ...(listing?.listingId
            ? {
                productId: listing.listingId,
                productType: listing.listingType ?? "",
                productTitle: listing.listingTitle ?? "",
                productPrice:
                  listing.listingPrice != null ? String(listing.listingPrice) : "",
                productImage: listing.listingImage ?? "",
                currency: listing.currency ?? "₹",
              }
            : {}),
        },
      } as Href);
    },
    [getOtherParticipant, router],
  );

  const convKeyExtractor = useCallback((item: Conversation) => item._id, []);

  const renderConversation = useCallback(
    ({ item }: { item: Conversation }) => (
      <ConversationRow conv={item} userId={user?.id} onPress={openChat} />
    ),
    [openChat, user?.id],
  );

  const getFilterLabel = (key: FilterKey, base: string) => {
    if (key === "unread" && unreadCount > 0) return `${base} ${unreadCount}`;
    return base;
  };

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 20 }}>
        <View className="mb-5 flex-row items-center justify-between">
          <View className="min-w-0 flex-1 flex-row items-center">
            <Pressable
              onPress={() => handleBottomTabPress("home")}
              hitSlop={12}
              className="mr-1 h-10 w-10 items-center justify-center"
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <MaterialIcons name="chevron-left" size={32} color={colors.icon} />
            </Pressable>
            <Text
              className="text-[22px]"
              style={{ fontFamily: ListifyFonts.bold, color: colors.textPrimary }}
            >
              Chats
            </Text>
          </View>
        </View>

        <View
          className="mb-4 h-12 flex-row items-center rounded-full px-4"
          style={{ backgroundColor: colors.surfaceMuted }}
        >
          <MaterialIcons name="search" size={22} color={colors.iconMuted} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search"
            placeholderTextColor={colors.inputPlaceholder}
            className="ml-3 flex-1 text-[16px]"
            style={{
              fontFamily: ListifyFonts.regular,
              paddingVertical: 0,
              color: colors.textPrimary,
            }}
          />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="mb-2"
          contentContainerStyle={{ gap: 8, alignItems: "center" }}
        >
          {FILTER_OPTIONS.map((opt) => {
            const isActive = activeFilter === opt.key;
            return (
              <Pressable
                key={opt.key}
                onPress={() => setActiveFilter(opt.key)}
                className="rounded-full px-4 py-2"
                style={{
                  backgroundColor: isActive ? colors.primarySoft : colors.surfaceMuted,
                }}
              >
                <Text
                  className="text-[14px]"
                  style={{
                    fontFamily: isActive ? ListifyFonts.semiBold : ListifyFonts.medium,
                    color: isActive ? colors.primary : colors.textSecondary,
                  }}
                >
                  {getFilterLabel(opt.key, opt.label)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={convKeyExtractor}
        renderItem={renderConversation}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        removeClippedSubviews
        maxToRenderPerBatch={10}
        initialNumToRender={12}
        windowSize={7}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
        contentContainerStyle={{
          paddingBottom: Math.max(insets.bottom, 16) + 24,
          ...(filtered.length === 0 ? { flex: 1 } : {}),
        }}
        ListEmptyComponent={
          <View className="items-center px-6 py-16">
            <MaterialIcons name="chat-bubble-outline" size={48} color={colors.iconMuted} />
            <Text
              className="mt-3 text-[15px]"
              style={{ fontFamily: ListifyFonts.regular, color: colors.textSecondary }}
            >
              {loadError ?? "No chats yet"}
            </Text>
            {!loadError ? (
              <Text
                className="mt-1 text-center text-[13px]"
                style={{ fontFamily: ListifyFonts.regular, color: colors.textTertiary }}
              >
                Message a seller from a listing to start a conversation
              </Text>
            ) : null}
          </View>
        }
      />
    </View>
  );
}

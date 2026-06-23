import { MaterialIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { type Href, useRouter } from "@/lib/safe-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BackHandler,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { APP_SCREEN_BG } from "@/constants/theme";
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
import { useTabNavigation } from "@/lib/use-tab-navigation";
import { useAppSelector } from "@/store/hooks";

const BRAND = "#27BB97";
const BG = APP_SCREEN_BG;

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

export function MessagesInboxScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
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

  const getFilterLabel = (key: FilterKey, base: string) => {
    if (key === "unread" && unreadCount > 0) return `${base} ${unreadCount}`;
    return base;
  };

  return (
    <View className="flex-1" style={{ backgroundColor: BG }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 20 }}>
        <View className="mb-5 flex-row items-center justify-between">
          <View className="min-w-0 flex-1 flex-row items-center">
            <Pressable
              onPress={() => handleBottomTabPress("home")}
              hitSlop={12}
              className="mr-1 h-10 w-10 items-center justify-center"
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <MaterialIcons name="chevron-left" size={32} color="#1A1A1A" />
            </Pressable>
            <Text
              className="text-[22px] text-[#1A1A1A]"
              style={{ fontFamily: ListifyFonts.bold }}
            >
              Chats
            </Text>
          </View>
        </View>

        <View
          className="mb-4 h-12 flex-row items-center rounded-full px-4"
          style={{ backgroundColor: "#F3F4F6" }}
        >
          <MaterialIcons name="search" size={22} color="#9CA3AF" />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search"
            placeholderTextColor="#9CA3AF"
            className="ml-3 flex-1 text-[16px] text-[#1A1A1A]"
            style={{ fontFamily: ListifyFonts.regular, paddingVertical: 0 }}
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
                  backgroundColor: isActive ? "rgba(39,187,151,0.14)" : "#F3F4F6",
                }}
              >
                <Text
                  className="text-[14px]"
                  style={{
                    fontFamily: isActive ? ListifyFonts.semiBold : ListifyFonts.medium,
                    color: isActive ? BRAND : "#4B5563",
                  }}
                >
                  {getFilterLabel(opt.key, opt.label)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[BRAND]}
            tintColor={BRAND}
          />
        }
        contentContainerStyle={{
          paddingBottom: Math.max(insets.bottom, 16) + 24,
        }}
      >
        {filtered.length === 0 ? (
          <View className="items-center px-6 py-16">
            <MaterialIcons name="chat-bubble-outline" size={48} color="#D1D5DB" />
            <Text
              className="mt-3 text-[15px] text-[#6B7280]"
              style={{ fontFamily: ListifyFonts.regular }}
            >
              {loadError ?? "No chats yet"}
            </Text>
            {!loadError ? (
              <Text
                className="mt-1 text-center text-[13px] text-[#9CA3AF]"
                style={{ fontFamily: ListifyFonts.regular }}
              >
                Message a seller from a listing to start a conversation
              </Text>
            ) : null}
          </View>
        ) : (
          filtered.map((conv) => {
            const other = getOtherParticipant(conv);
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
                key={conv._id}
                onPress={() => openChat(conv)}
                className="flex-row items-center px-5 py-3.5"
                style={({ pressed }) => ({ opacity: pressed ? 0.88 : 1 })}
              >
                {productImage ? (
                  <Image
                    source={productImage}
                    contentFit="cover"
                    className="h-14 w-14 rounded-xl border border-slate-100"
                  />
                ) : avatar ? (
                  <Image
                    source={avatar}
                    contentFit="cover"
                    className="h-14 w-14 rounded-full"
                  />
                ) : (
                  <View className="h-14 w-14 items-center justify-center rounded-full bg-[#F3F4F6]">
                    <MaterialIcons name="person" size={28} color="#9CA3AF" />
                  </View>
                )}

                <View className="ml-3.5 min-w-0 flex-1">
                  <View className="flex-row items-start justify-between gap-2">
                    <Text
                      className="flex-1 text-[17px] text-[#1A1A1A]"
                      style={{ fontFamily: ListifyFonts.semiBold }}
                      numberOfLines={1}
                    >
                      {productTitle || otherName}
                    </Text>
                    <View className="items-end">
                      {lastMsgTime ? (
                        <Text
                          className="text-[13px] text-[#9CA3AF]"
                          style={{ fontFamily: ListifyFonts.regular }}
                        >
                          {lastMsgTime}
                        </Text>
                      ) : null}
                      {myUnread > 0 ? (
                        <View
                          className="mt-1 min-h-5 min-w-5 items-center justify-center rounded-full px-1.5"
                          style={{ backgroundColor: BRAND }}
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
                      className="mt-0.5 text-[12px] text-[#6B7280]"
                      style={{ fontFamily: ListifyFonts.regular }}
                      numberOfLines={1}
                    >
                      {otherName}
                    </Text>
                  ) : null}
                  <Text
                    className="mt-0.5 text-[15px] text-[#9CA3AF]"
                    style={{ fontFamily: ListifyFonts.regular }}
                    numberOfLines={2}
                  >
                    {lastMsgText}
                  </Text>
                </View>
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

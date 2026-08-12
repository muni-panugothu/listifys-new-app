import { MaterialIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { type Href, useRouter } from "@/lib/safe-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BackHandler,
  FlatList,
  LayoutAnimation,
  Platform,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  UIManager,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ListifyFonts } from "@/constants/typography";
import {
  ConversationListItem,
  ConversationListSkeleton,
} from "@/features/messaging/components/conversation-list-item";
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
import { INBOX_LIST_PROPS } from "@/lib/performance/flat-list-config";
import { useOnlinePresence } from "@/hooks/use-online-presence";
import { useTheme } from "@/providers/theme-provider";
import { useAppSelector } from "@/store/hooks";

type FilterKey = "all" | "unread";

const FILTER_OPTIONS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
];

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export function MessagesInboxScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, resolvedMode } = useTheme();
  const user = useAppSelector((s) => s.auth.user);
  const { isUserOnline, refreshOnlineUsers } = useOnlinePresence();

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/(tabs)/dashboard-home" as Href);
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      const onHardwareBack = () => {
        handleBack();
        return true;
      };
      const sub = BackHandler.addEventListener("hardwareBackPress", onHardwareBack);
      return () => sub.remove();
    }, [handleBack]),
  );

  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadConversations = useCallback(async () => {
    try {
      const res = await getConversations(1, 50);
      setConversations(res.conversations ?? []);
      setLoadError(null);
    } catch {
      setConversations([]);
      setLoadError("Could not load messages. Pull to refresh.");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadConversations();
      refreshOnlineUsers();
    }, [loadConversations, refreshOnlineUsers]),
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
      socketRef.off("conversation:unread_update", refresh);
    };
  }, [loadConversations]);

  const { refreshing, onRefresh } = usePullToRefresh(async () => {
    await Promise.all([loadConversations(), refreshOnlineUsers()]);
  });

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
          preview.toLowerCase().includes(q)
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

  const handleFilterChange = useCallback((key: FilterKey) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setActiveFilter(key);
  }, []);

  const convKeyExtractor = useCallback((item: Conversation) => item._id, []);

  const renderConversation = useCallback(
    ({ item, index }: { item: Conversation; index: number }) => {
      const other = getOtherParticipant(item);
      const otherId = other?.id || other?._id;
      return (
        <ConversationListItem
          conv={item}
          userId={user?.id}
          isOnline={otherId ? isUserOnline(String(otherId)) : false}
          onPress={openChat}
          showDivider={index < filtered.length - 1}
        />
      );
    },
    [filtered.length, getOtherParticipant, isUserOnline, openChat, user?.id],
  );

  const emptyMessage = useMemo(() => {
    if (loadError) return loadError;
    if (searchQuery.trim()) return "No conversations found";
    if (activeFilter === "unread") return "No unread messages";
    return "No messages yet";
  }, [activeFilter, loadError, searchQuery]);

  const emptySubtitle = useMemo(() => {
    if (loadError || searchQuery.trim() || activeFilter === "unread") return null;
    return "Message a seller from a listing to start chatting";
  }, [activeFilter, loadError, searchQuery]);

  const searchBg =
    resolvedMode === "dark"
      ? colors.surfaceMuted
      : searchFocused
        ? colors.surface
        : "#F3F4F6";

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <View style={{ paddingTop: insets.top + 4 }}>
        <View
          className="relative mb-4 flex-row items-center justify-center px-5"
          style={{ minHeight: 44 }}
        >
          <Pressable
            onPress={handleBack}
            hitSlop={12}
            className="absolute left-5 h-10 w-10 items-center justify-center"
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          >
            <MaterialIcons name="chevron-left" size={30} color={colors.icon} />
          </Pressable>
          <Text
            className="text-[18px]"
            style={{ fontFamily: ListifyFonts.bold, color: colors.textPrimary }}
          >
            Messages
          </Text>
        </View>

        <View className="px-5">
          <View
            className="mb-4 h-[50px] flex-row items-center rounded-full px-4"
            style={{
              backgroundColor: searchBg,
              borderWidth: searchFocused ? 1 : 0,
              borderColor: searchFocused ? colors.primary : "transparent",
            }}
          >
            <MaterialIcons
              name="search"
              size={20}
              color={searchFocused ? colors.primary : colors.iconMuted}
            />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              placeholder="Search..."
              placeholderTextColor={colors.inputPlaceholder}
              className="ml-2.5 flex-1 text-[16px]"
              style={{
                fontFamily: ListifyFonts.regular,
                paddingVertical: 0,
                color: colors.textPrimary,
              }}
              returnKeyType="search"
              autoCorrect={false}
            />
            {searchQuery.length > 0 ? (
              <Pressable
                onPress={() => setSearchQuery("")}
                hitSlop={8}
                style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
              >
                <MaterialIcons name="close" size={18} color={colors.iconMuted} />
              </Pressable>
            ) : null}
          </View>

          <View className="mb-1 flex-row items-center gap-2">
            {FILTER_OPTIONS.map((opt) => {
              const isActive = activeFilter === opt.key;
              return (
                <Pressable
                  key={opt.key}
                  onPress={() => handleFilterChange(opt.key)}
                  className="rounded-full px-4 py-2"
                  style={{
                    backgroundColor: isActive
                      ? resolvedMode === "dark"
                        ? colors.surfaceElevated
                        : "#EFEFEF"
                      : "transparent",
                  }}
                >
                  <Text
                    className="text-[14px]"
                    style={{
                      fontFamily: isActive ? ListifyFonts.semiBold : ListifyFonts.medium,
                      color: isActive ? colors.textPrimary : colors.textSecondary,
                    }}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>

      {loading ? (
        <View className="pt-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <ConversationListSkeleton key={i} />
          ))}
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={convKeyExtractor}
          renderItem={renderConversation}
          {...INBOX_LIST_PROPS}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
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
            <View className="flex-1 items-center justify-center px-8 py-20">
              <View
                className="mb-4 h-16 w-16 items-center justify-center rounded-full"
                style={{ backgroundColor: colors.surfaceMuted }}
              >
                <MaterialIcons
                  name={loadError ? "error-outline" : "chat-bubble-outline"}
                  size={30}
                  color={colors.iconMuted}
                />
              </View>
              <Text
                className="text-center text-[16px]"
                style={{ fontFamily: ListifyFonts.semiBold, color: colors.textPrimary }}
              >
                {emptyMessage}
              </Text>
              {emptySubtitle ? (
                <Text
                  className="mt-2 text-center text-[14px] leading-5"
                  style={{
                    fontFamily: ListifyFonts.regular,
                    color: colors.textSecondary,
                  }}
                >
                  {emptySubtitle}
                </Text>
              ) : null}
              {loadError ? (
                <Pressable
                  onPress={() => void loadConversations()}
                  className="mt-5 rounded-full px-5 py-2.5"
                  style={{ backgroundColor: colors.primarySoftStrong }}
                >
                  <Text
                    className="text-[14px]"
                    style={{ fontFamily: ListifyFonts.semiBold, color: colors.primary }}
                  >
                    Try again
                  </Text>
                </Pressable>
              ) : null}
            </View>
          }
        />
      )}
    </View>
  );
}

import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "@/lib/safe-router";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { adjustNotificationUnread } from "@/lib/notification-unread-bus";
import { ListifyFonts } from "@/constants/typography";
import {
  normalizeNotification,
} from "@/lib/notification-navigation";
import { navigateFromNotification } from "@/lib/notifications/deep-link-handler";
import { getNotificationRoute } from "@/lib/notification-navigation";
import { queueNotificationNavigation } from "@/lib/notifications/pending-notification-navigation";
import { notificationItemToPayload } from "@/lib/notifications/payload-normalizer";
import {
  type NotificationItem,
  getNotifications,
  markNotificationRead,
  deleteNotification,
  deleteAllNotifications,
} from "@/features/auth/services/auth-api";
import {
  connectSocket,
  getSocket,
} from "@/features/messaging/services/socket-service";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { useTheme } from "@/providers/theme-provider";
import { useAppSelector } from "@/store/hooks";

type NotifVisual = {
  icon: keyof typeof MaterialIcons.glyphMap;
  color: string;
};

function getNotificationVisual(type: string): NotifVisual {
  switch (type) {
    case "message":
      return { icon: "chat-bubble-outline", color: "#27BB97" };
    case "follow":
      return { icon: "person-add", color: "#60A5FA" };
    case "new_listing":
    case "listing_saved":
      return { icon: "inventory-2", color: "#27BB97" };
    case "offer_received":
    case "offer_accepted":
    case "offer_rejected":
      return { icon: "local-offer", color: "#F59E0B" };
    case "review":
    case "review_received":
      return { icon: "star", color: "#F59E0B" };
    case "like":
    case "favorite":
      return { icon: "favorite", color: "#F472B6" };
    case "category":
    case "alert":
      return { icon: "apps", color: "#27BB97" };
    case "welcome":
    case "verified":
      return { icon: "verified", color: "#60A5FA" };
    case "location":
    case "nearby":
      return { icon: "place", color: "#27BB97" };
    default:
      return { icon: "notifications", color: "#27BB97" };
  }
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;

  if (diffMs < 0) return "just now";

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;

  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;

  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
}

function isToday(dateStr: string) {
  const d = new Date(dateStr);
  const today = new Date();
  return d.toDateString() === today.toDateString();
}

function isThisWeek(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);
  return d >= weekAgo && !isToday(dateStr);
}

function groupNotifications(items: NotificationItem[]) {
  const sorted = [...items].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const today: NotificationItem[] = [];
  const thisWeek: NotificationItem[] = [];
  const earlier: NotificationItem[] = [];

  for (const item of sorted) {
    if (isToday(item.createdAt)) today.push(item);
    else if (isThisWeek(item.createdAt)) thisWeek.push(item);
    else earlier.push(item);
  }

  return { today, thisWeek, earlier };
}

function getSenderDisplayName(item: NotificationItem): string | null {
  if (item.sender?.name && item.sender.name.trim()) {
    return item.sender.name.trim();
  }
  const metadata = item.metadata ?? item.data;
  const senderName = metadata?.senderName;
  if (typeof senderName === "string" && senderName.trim()) {
    return senderName.trim();
  }
  return null;
}

function NotificationRow({
  item,
  onPress,
  onDelete,
}: {
  item: NotificationItem;
  onPress: () => void;
  onDelete: () => void;
}) {
  const { colors } = useTheme();
  const visual = getNotificationVisual(item.type);
  const senderName = getSenderDisplayName(item);
  const body =
    item.message?.trim() ||
    item.title?.trim() ||
    "You have a new notification on Listifys.";
  const timeLabel = formatRelativeTime(item.createdAt);
  const swipeRef = useRef<Swipeable>(null);
  const [rowHeight, setRowHeight] = useState(0);

  const renderRightActions = () => (
    <View
      style={{
        width: 72,
        marginLeft: 8,
        height: rowHeight > 0 ? rowHeight : undefined,
        justifyContent: "center",
      }}
    >
      <Pressable
        onPress={() => {
          swipeRef.current?.close();
          onDelete();
        }}
        style={{
          flex: 1,
          borderRadius: 12,
          backgroundColor: "#EF4444",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <MaterialIcons name="delete-outline" size={26} color="#FFFFFF" />
      </Pressable>
    </View>
  );

  return (
    <Swipeable
      ref={swipeRef}
      renderRightActions={renderRightActions}
      overshootRight={false}
      friction={2}
      rightThreshold={40}
      containerStyle={{ marginBottom: 0 }}
    >
      <View
        onLayout={(e) => setRowHeight(e.nativeEvent.layout.height)}
        style={{
          backgroundColor: colors.surface,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        <Pressable
          onPress={onPress}
          className="flex-row items-center px-5 py-3.5"
          style={({ pressed }) => ({ opacity: pressed ? 0.88 : 1 })}
        >
        <View
          className="h-12 w-12 items-center justify-center rounded-xl"
          style={{ backgroundColor: colors.surfaceElevated }}
        >
          <MaterialIcons name={visual.icon} size={24} color={visual.color} />
        </View>

        <View className="ml-3.5 min-w-0 flex-1">
          {senderName ? (
            <Text
              className="mb-0.5 text-[14px]"
              style={{ fontFamily: ListifyFonts.semiBold, color: colors.textPrimary }}
              numberOfLines={1}
            >
              {senderName}
            </Text>
          ) : null}
          <Text
            className="text-[14px] leading-[20px]"
            style={{
              fontFamily: ListifyFonts.regular,
              color: item.read ? colors.textTertiary : colors.textPrimary,
            }}
            numberOfLines={2}
          >
            {body}
          </Text>
          <Text
            className="mt-1 text-[12px]"
            style={{ fontFamily: ListifyFonts.regular, color: colors.textTertiary }}
          >
            {timeLabel}
          </Text>
        </View>

        {!item.read ? (
          <View
            className="ml-2 h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: colors.danger }}
          />
        ) : (
          <View className="ml-2 w-2.5" />
        )}
        </Pressable>
      </View>
    </Swipeable>
  );
}

function Section({
  title,
  items,
  onItemPress,
  onItemDelete,
  isFirst = false,
}: {
  title: string;
  items: NotificationItem[];
  onItemPress: (item: NotificationItem) => void;
  onItemDelete: (item: NotificationItem) => void;
  isFirst?: boolean;
}) {
  const { colors } = useTheme();
  if (items.length === 0) return null;

  return (
    <View className="mb-4" style={isFirst ? { paddingTop: 16 } : undefined}>
      <Text
        className="mb-2 px-5 text-[14px]"
        style={{ fontFamily: ListifyFonts.medium, color: colors.textTertiary }}
      >
        {title}
      </Text>
      {items.map((item) => (
        <NotificationRow
          key={item._id}
          item={item}
          onPress={() => onItemPress(item)}
          onDelete={() => onItemDelete(item)}
        />
      ))}
    </View>
  );
}

export function NotificationsCenterScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const user = useAppSelector((s) => s.auth.user);

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [clearingAll, setClearingAll] = useState(false);

  const loadNotifications = useCallback(async () => {
    try {
      const res = await getNotifications();
      const normalized = (res.notifications ?? []).map(normalizeNotification);
      setNotifications(normalized);
    } catch {
      setNotifications([]);
    }
  }, []);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  useFocusEffect(
    useCallback(() => {
      void loadNotifications();
    }, [loadNotifications]),
  );

  // Real-time via socket
  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    let socketInstance: ReturnType<typeof getSocket> = null;

    const handleNewNotification = (data: {
      _id?: string;
      type?: string;
      title?: string;
      message?: string;
      createdAt?: string;
      metadata?: Record<string, unknown>;
      data?: Record<string, unknown>;
      sender?: string | { id?: string; _id?: string; name?: string };
    }) => {
      const senderRaw = data.sender;
      let sender: NotificationItem["sender"];
      if (senderRaw && typeof senderRaw === "object") {
        sender = {
          id: String(senderRaw.id ?? senderRaw._id ?? ""),
          name: senderRaw.name ?? "",
        };
      } else if (typeof senderRaw === "string") {
        sender = { id: senderRaw, name: "" };
      }

      const notif = normalizeNotification({
        _id: data._id || `notif_${Date.now()}`,
        type: data.type || "general",
        title: data.title || "",
        message: data.message || "You have a new notification.",
        read: false,
        createdAt: data.createdAt || new Date().toISOString(),
        metadata:
          (data.metadata as Record<string, unknown> | undefined) ??
          data.data,
        sender,
      });
      setNotifications((prev) => {
        const exists = prev.some((n) => n._id === notif._id);
        if (exists) return prev;
        adjustNotificationUnread(1);
        return [notif, ...prev];
      });
    };

    void connectSocket()
      .then((connected) => {
        if (cancelled) return;
        socketInstance = connected;
        connected.on("notification:new", handleNewNotification);
      })
      .catch(() => {
        // Non-fatal — notifications still load via REST
      });

    return () => {
      cancelled = true;
      if (socketInstance) {
        socketInstance.off("notification:new", handleNewNotification);
      }
    };
  }, [user]);

  const { refreshing, onRefresh } = usePullToRefresh(loadNotifications);

  const { today, thisWeek, earlier } = useMemo(
    () => groupNotifications(notifications),
    [notifications],
  );

  const handleItemPress = useCallback(
    async (item: NotificationItem) => {
      if (!item.read) {
        await markNotificationRead(item._id).catch(() => {});
        adjustNotificationUnread(-1);
      }
      setNotifications((prev) =>
        prev.map((x) => (x._id === item._id ? { ...x, read: true } : x)),
      );

      const href = getNotificationRoute(item);
      if (href) {
        queueNotificationNavigation(href);
      } else {
        navigateFromNotification(notificationItemToPayload(item));
      }
    },
    [],
  );

  const handleItemDelete = useCallback(async (item: NotificationItem) => {
    setNotifications((prev) => prev.filter((n) => n._id !== item._id));
    if (!item.read) {
      adjustNotificationUnread(-1);
    }
    await deleteNotification(item._id).catch(() => {});
  }, []);

  const handleClearAll = useCallback(async () => {
    if (notifications.length === 0 || clearingAll) return;
    setClearingAll(true);
    const unreadCount = notifications.filter((n) => !n.read).length;
    setNotifications([]);
    if (unreadCount > 0) adjustNotificationUnread(-unreadCount);
    await deleteAllNotifications().catch(() => {
      void loadNotifications();
    });
    setClearingAll(false);
  }, [clearingAll, loadNotifications, notifications]);

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 20 }}>
        <View className="mb-6 flex-row items-center justify-between">
          <View className="flex-row items-center">
            <Pressable
              onPress={() => router.back()}
              hitSlop={12}
              className="mr-3 h-10 w-10 items-center justify-center"
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <MaterialIcons name="chevron-left" size={32} color={colors.icon} />
            </Pressable>
            <Text
              className="text-[22px]"
              style={{ fontFamily: ListifyFonts.bold, color: colors.textPrimary }}
            >
              Notifications
            </Text>
          </View>

          {notifications.length > 0 ? (
            <Pressable
              onPress={() => void handleClearAll()}
              disabled={clearingAll}
              hitSlop={8}
              style={({ pressed }) => ({ opacity: pressed || clearingAll ? 0.6 : 1 })}
            >
              <Text
                className="text-[14px]"
                style={{ fontFamily: ListifyFonts.semiBold, color: colors.danger }}
              >
                Clear all
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        removeClippedSubviews
        style={{ flex: 1, backgroundColor: colors.surface }}
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
          flexGrow: 1,
        }}
      >
        <Section
          title="Today"
          items={today}
          onItemPress={handleItemPress}
          onItemDelete={handleItemDelete}
          isFirst
        />
        <Section
          title="This week"
          items={thisWeek}
          onItemPress={handleItemPress}
          onItemDelete={handleItemDelete}
        />
        {earlier.length > 0 ? (
          <Section
            title="Earlier"
            items={earlier}
            onItemPress={handleItemPress}
            onItemDelete={handleItemDelete}
          />
        ) : null}

        {notifications.length === 0 ? (
          <View className="items-center px-5 py-16">
            <MaterialIcons
              name="notifications-none"
              size={48}
              color={colors.iconMuted}
            />
            <Text
              className="mt-3 text-[15px]"
              style={{ fontFamily: ListifyFonts.regular, color: colors.textTertiary }}
            >
              No notifications yet
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

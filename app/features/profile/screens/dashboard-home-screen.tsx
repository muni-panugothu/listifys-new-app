import { MaterialIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { type Href, useRouter } from "@/lib/safe-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BackHandler,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ProfileAvatarImage } from "@/components/profile-avatar-image";
import { ProfileHeaderArt } from "@/components/profile-header-art";
import { DUMMY_PROFILE_NAME } from "@/constants/dummy-profile";
import { ListifyFonts } from "@/constants/typography";
import { getUnreadCount as getNotificationUnreadCount } from "@/features/auth/services/auth-api";
import { fetchSavedListings } from "@/features/listing/services/listing-api";
import { getUnreadCount as getChatUnreadCount } from "@/features/messaging/services/chat-api";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { useProtectedNavigation } from "@/lib/use-protected-navigation";
import { useTabNavigation } from "@/lib/use-tab-navigation";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { fetchProfile } from "@/store/slices/auth-slice";
import { showAuthGate } from "@/store/slices/auth-gate-slice";

const HEADER_ART_HEIGHT = 248;
const AVATAR_SIZE = 108;
const AVATAR_LEFT = 20;
const AVATAR_OVERLAP = AVATAR_SIZE / 2;

const PRO_BADGE_COLOR = "#27bb97";

type MenuRowProps = {
  icon: React.ComponentProps<typeof MaterialIcons>["name"];
  iconBg: string;
  iconColor: string;
  label: string;
  badge?: number;
  onPress: () => void;
};

function MenuRow({ icon, iconBg, iconColor, label, badge, onPress }: MenuRowProps) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center justify-between py-3.5"
      style={({ pressed }) => ({ opacity: pressed ? 0.88 : 1 })}
    >
      <View className="flex-row items-center gap-4">
        <View
          className="h-11 w-11 items-center justify-center rounded-2xl"
          style={{ backgroundColor: iconBg }}
        >
          <MaterialIcons name={icon} size={22} color={iconColor} />
        </View>
        <Text
          className="text-[16px] text-[#1A1A1A]"
          style={{ fontFamily: ListifyFonts.medium }}
        >
          {label}
        </Text>
      </View>
      <View className="flex-row items-center gap-2">
        {badge != null && badge > 0 ? (
          <View className="min-w-5 rounded-full bg-[#27BB97] px-1.5 py-0.5">
            <Text
              className="text-center text-[10px] text-white"
              style={{ fontFamily: ListifyFonts.bold }}
            >
              {badge > 99 ? "99+" : badge}
            </Text>
          </View>
        ) : null}
        <MaterialIcons name="chevron-right" size={22} color="#C4C4C4" />
      </View>
    </Pressable>
  );
}

function StatDivider() {
  return <View className="h-8 w-px bg-[#E5E7EB]" />;
}

export function DashboardHomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottomNavPadding = Math.max(insets.bottom, 8);
  const dispatch = useAppDispatch();
  const user = useAppSelector((s) => s.auth.user);
  const isAuthenticated = useAppSelector((s) => s.auth.isAuthenticated);
  const network = useAppSelector((s) => s.network);
  const isOffline = !network.isConnected || network.isInternetReachable === false;
  const [menuCounts, setMenuCounts] = useState({
    savedItems: 0,
    unreadMessages: 0,
    unreadNotifications: 0,
  });

  const loadDashboardData = useCallback(async () => {
    // When offline, skip live API calls — keep last-known counts and cached profile
    if (isOffline) return;

    await dispatch(fetchProfile()).unwrap().catch(() => {});

    const [savedResult, chatResult, notificationResult] = await Promise.allSettled([
      fetchSavedListings(),
      getChatUnreadCount(),
      getNotificationUnreadCount(),
    ]);

    setMenuCounts({
      savedItems: savedResult.status === "fulfilled" ? savedResult.value.listings.length : 0,
      unreadMessages: chatResult.status === "fulfilled" ? chatResult.value.unreadCount ?? 0 : 0,
      unreadNotifications:
        notificationResult.status === "fulfilled"
          ? notificationResult.value.unreadCount ?? 0
          : 0,
    });
  }, [dispatch, isOffline]);

  useFocusEffect(
    useCallback(() => {
      void loadDashboardData();
    }, [loadDashboardData]),
  );

  const handleRefresh = useCallback(async () => {
    await loadDashboardData();
  }, [loadDashboardData]);

  const { refreshing, onRefresh } = usePullToRefresh(handleRefresh);
  const handleBottomTabPress = useTabNavigation();

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

  const displayName = user?.name?.trim() || DUMMY_PROFILE_NAME;
  const displayEmail = user?.email?.trim() || "";

  const navigate = useCallback(
    (href: Href) => {
      router.push(href);
    },
    [router],
  );

  const { navigateProtected } = useProtectedNavigation();

  const handleInviteFriend = useCallback(async () => {
    try {
      await Share.share({
        message: "Join me on Listifys — buy and sell locally!",
      });
    } catch {
      // user dismissed
    }
  }, []);

  const stats = useMemo(
    () => [
      {
        value: String(user?.listingsCount ?? 0),
        label: "Listings",
        onPress: () => navigateProtected("/my-listings-active" as Href),
      },
      {
        value: String(user?.followersCount ?? 0),
        label: "Followers",
        onPress: () =>
          navigateProtected({
            pathname: "/followers-following",
            params: { tab: "followers" },
          } as Href),
      },
      {
        value: String(user?.followingCount ?? 0),
        label: "Following",
        onPress: () =>
          navigateProtected({
            pathname: "/followers-following",
            params: { tab: "following" },
          } as Href),
      },
    ],
    [navigateProtected, user?.followersCount, user?.followingCount, user?.listingsCount],
  );

  return (
    <View className="flex-1 bg-[#F6F7F8]">
      <View
        className="absolute inset-x-0 top-0 z-30 flex-row items-center justify-between px-5"
        style={{ paddingTop: insets.top + 8 }}
        pointerEvents="box-none"
      >
        <Pressable
          onPress={() => handleBottomTabPress("home")}
          hitSlop={12}
          className="h-10 w-10 items-center justify-center rounded-full bg-white/90"
          style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
        >
          <MaterialIcons name="arrow-back-ios" size={18} color="#1A1A1A" style={{marginLeft: 6}} />
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        bounces
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={["#27BB97"]}
            tintColor="#27BB97"
          />
        }
        contentContainerStyle={{
          flexGrow: 1,
          paddingBottom: 96 + bottomNavPadding,
        }}
      >
        {/* Abstract banner */}
        <View style={{ height: HEADER_ART_HEIGHT }}>
          <ProfileHeaderArt height={HEADER_ART_HEIGHT} />
        </View>

        {/* Avatar left (half on banner) — PRO / name / stats stacked below, left aligned */}
        <View
          className="z-10 bg-white px-5 pb-2"
          style={{ marginTop: -AVATAR_OVERLAP }}
        >
          <View
            className="self-start"
            style={{ marginTop: -AVATAR_OVERLAP, marginBottom: 12 }}
          >
            <View
              className="overflow-hidden rounded-full border-[4px] border-white bg-white"
              style={{
                width: AVATAR_SIZE,
                height: AVATAR_SIZE,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.14,
                shadowRadius: 10,
                elevation: 8,
              }}
            >
              <ProfileAvatarImage
                user={user}
                fallbackName={displayName}
                className="h-full w-full"
                iconSize={44}
              />
            </View>
          </View>

          <Text
            className="text-[26px] leading-8 text-[#1A1A1A]"
            style={{ fontFamily: ListifyFonts.bold }}
          >
            {displayName}
          </Text>
          {displayEmail ? (
            <Text
              className="mt-1 text-[15px] text-[#9CA3AF]"
              style={{ fontFamily: ListifyFonts.regular }}
              numberOfLines={1}
            >
              {displayEmail}
            </Text>
          ) : null}

          {/* Offline indicator */}
          {isOffline ? (
            <View className="mt-2 flex-row items-center gap-1.5 self-start rounded-full bg-[#10231D] px-3 py-1">
              <MaterialIcons name="cloud-off" size={12} color="#6EE7C7" />
              <Text className="text-[11px] font-medium text-[#6EE7C7]">Offline — showing cached data</Text>
            </View>
          ) : null}

          <View className="mt-5 flex-row items-center self-start">
            {stats.map((stat, index) => (
              <View key={stat.label} className="flex-row items-center">
                {index > 0 ? <StatDivider /> : null}
                <Pressable
                  onPress={stat.onPress}
                  style={({ pressed }) => ({
                    opacity: pressed ? 0.8 : 1,
                    alignItems: "flex-start",
                    paddingRight: index === 0 ? 20 : 20,
                    paddingLeft: index === 0 ? 0 : 20,
                  })}
                >
                  <Text
                    className="text-[18px] text-[#1A1A1A]"
                    style={{ fontFamily: ListifyFonts.bold }}
                  >
                    {stat.value}
                  </Text>
                  <Text
                    className="mt-0.5 text-[12px] text-[#9CA3AF]"
                    style={{ fontFamily: ListifyFonts.regular }}
                  >
                    {stat.label}
                  </Text>
                </Pressable>
              </View>
            ))}
          </View>
        </View>

        {/* Menu list */}
        <View className="mt-2 bg-white px-5 pt-4">
          <MenuRow
            icon="person-outline"
            iconBg="rgba(244,63,156,0.15)"
            iconColor={PRO_BADGE_COLOR}
            label="Edit profile"
            onPress={() => navigateProtected("/profile-details-edit" as Href)}
          />
          <MenuRow
            icon="bar-chart"
            iconBg="rgba(139,92,246,0.15)"
            iconColor="#8B5CF6"
            label="My listings"
            onPress={() => navigateProtected("/my-listings-active" as Href)}
          />
          <MenuRow
            icon="favorite-border"
            iconBg="rgba(39,187,151,0.12)"
            iconColor="#27BB97"
            label="Saved items"
            badge={menuCounts.savedItems}
            onPress={() => navigateProtected("/saved-items" as Href)}
          />
          <MenuRow
            icon="chat-bubble-outline"
            iconBg="rgba(59,130,246,0.15)"
            iconColor="#3B82F6"
            label="Messages"
            badge={menuCounts.unreadMessages}
            onPress={() => navigateProtected("/messages-inbox" as Href, "messages")}
          />
          <MenuRow
            icon="notifications-none"
            iconBg="rgba(39,187,151,0.15)"
            iconColor="#27BB97"
            label="Notifications"
            badge={menuCounts.unreadNotifications}
            onPress={() => navigateProtected("/notifications-center" as Href, "notifications")}
          />
          <MenuRow
            icon="settings"
            iconBg="rgba(251,146,60,0.2)"
            iconColor="#FB923C"
            label="Settings"
            onPress={() => navigate("/app-settings" as Href)}
          />
          <MenuRow
            icon="history"
            iconBg="rgba(99,102,241,0.12)"
            iconColor="#6366F1"
            label="Activity Log"
            onPress={() => navigateProtected("/activity-log" as Href)}
          />
          <MenuRow
            icon="devices"
            iconBg="rgba(59,130,246,0.12)"
            iconColor="#3B82F6"
            label="Devices"
            onPress={() => navigateProtected("/devices" as Href)}
          />
          <MenuRow
            icon="security"
            iconBg="rgba(99,102,241,0.15)"
            iconColor="#6366F1"
            label="Security"
            onPress={() => navigateProtected("/security" as Href)}
          />

          <View className="my-2 h-px bg-[#F0F0F0]" />

          <MenuRow
            icon="person-add-alt-1"
            iconBg="#E5E7EB"
            iconColor="#4B5563"
            label="Invite a friend"
            onPress={handleInviteFriend}
          />
          <MenuRow
            icon="help-outline"
            iconBg="#E5E7EB"
            iconColor="#4B5563"
            label="Help"
            onPress={() => Linking.openURL("mailto:support@listifys.com")}
          />

          {!isAuthenticated ? (
            <Pressable
              onPress={() =>
                dispatch(
                  showAuthGate({
                    action: "profile",
                    redirectTo: "/(tabs)/dashboard-home",
                  }),
                )
              }
              className="mt-4 items-center rounded-2xl py-4"
              style={{ backgroundColor: PRO_BADGE_COLOR }}
            >
              <Text
                className="text-[16px] text-white"
                style={{ fontFamily: ListifyFonts.semiBold }}
              >
                Sign in
              </Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => router.push("/logout-modal" as Href)}
              className="mt-6 items-center rounded-xl bg-red-500 py-4"
              style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
            >
              <Text
                className="text-[16px] text-white"
                style={{ fontFamily: ListifyFonts.semiBold }}
              >
                Sign out
              </Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

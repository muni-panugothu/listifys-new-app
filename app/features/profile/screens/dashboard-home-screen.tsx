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

import { ProfileHeaderArt } from "@/components/profile-header-art";
import { ListifyFonts } from "@/constants/typography";
import { getUnreadCount as getNotificationUnreadCount } from "@/features/auth/services/auth-api";
import { fetchSavedListings } from "@/features/listing/services/listing-api";
import { getUnreadCount as getChatUnreadCount } from "@/features/messaging/services/chat-api";
import { AppearanceBottomSheet } from "@/features/profile/components/appearance-bottom-sheet";
import { ProfileCompletionSection } from "@/features/profile/components/profile-completion-section";
import {
  computeProgressRingSize,
  ProfileAvatarWithProgress,
} from "@/features/profile/components/profile-avatar-with-progress";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { useStaleFocusRefetch } from "@/hooks/use-stale-focus-refetch";
import { useOnlinePresence } from "@/hooks/use-online-presence";
import { useProtectedNavigation } from "@/lib/use-protected-navigation";
import {
  getProfileDisplayName,
  getProfileDisplaySubtitle,
} from "@/lib/profile-display-name";
import { resolveProfileCompletion } from "@/lib/profile-completion-client";
import { useTabNavigation } from "@/lib/use-tab-navigation";
import { useTheme } from "@/providers/theme-provider";
import type { ThemeColors } from "@/theme/theme-tokens";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { selectIsAppOffline } from "@/store/selectors";
import { fetchProfile } from "@/store/slices/auth-slice";
import { showAuthGate } from "@/store/slices/auth-gate-slice";

const HEADER_ART_HEIGHT = 248;
const AVATAR_SIZE = 108;
const AVATAR_RING_SIZE = computeProgressRingSize(AVATAR_SIZE);
const AVATAR_OVERLAP = AVATAR_RING_SIZE / 2;

type MenuRowProps = {
  icon: React.ComponentProps<typeof MaterialIcons>["name"];
  iconBg: string;
  iconColor: string;
  label: string;
  badge?: number;
  trailingText?: string;
  onPress: () => void;
  colors: ThemeColors;
};

function MenuRow({
  icon,
  iconBg,
  iconColor,
  label,
  badge,
  trailingText,
  onPress,
  colors,
}: MenuRowProps) {
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
          className="text-[16px]"
          style={{
            fontFamily: ListifyFonts.medium,
            color: colors.textPrimary,
          }}
        >
          {label}
        </Text>
      </View>
      <View className="flex-row items-center gap-2">
        {trailingText ? (
          <Text
            className="text-[13px]"
            style={{
              fontFamily: ListifyFonts.medium,
              color: colors.textSecondary,
            }}
          >
            {trailingText}
          </Text>
        ) : null}
        {badge != null && badge > 0 ? (
          <View
            className="min-w-5 rounded-full px-1.5 py-0.5"
            style={{ backgroundColor: colors.primary }}
          >
            <Text
              className="text-center text-[10px]"
              style={{
                fontFamily: ListifyFonts.bold,
                color: colors.textOnPrimary,
              }}
            >
              {badge > 99 ? "99+" : badge}
            </Text>
          </View>
        ) : null}
        <MaterialIcons name="chevron-right" size={22} color={colors.iconMuted} />
      </View>
    </Pressable>
  );
}

function StatDivider({ colors }: { colors: ThemeColors }) {
  return (
    <View
      className="h-8 w-px"
      style={{ backgroundColor: colors.border }}
    />
  );
}

export function DashboardHomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottomNavPadding = Math.max(insets.bottom, 8);
  const dispatch = useAppDispatch();
  const { mode: themeMode, colors } = useTheme();
  const user = useAppSelector((s) => s.auth.user);
  const profileCompletion = useAppSelector((s) => s.auth.profileCompletion);
  const isAuthenticated = useAppSelector((s) => s.auth.isAuthenticated);
  const isOffline = useAppSelector(selectIsAppOffline);
  const { isSelfOnline } = useOnlinePresence();
  const [menuCounts, setMenuCounts] = useState({
    savedItems: 0,
    unreadMessages: 0,
    unreadNotifications: 0,
  });
  const [appearanceOpen, setAppearanceOpen] = useState(false);

  const loadDashboardData = useCallback(async () => {
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

  useEffect(() => {
    void loadDashboardData();
  }, [loadDashboardData]);

  useStaleFocusRefetch(() => loadDashboardData(), {
    staleMs: 30_000,
    skipInitialFocus: true,
    enabled: !isOffline,
  });

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

  const displayName = getProfileDisplayName(user, isAuthenticated);
  const displaySubtitle = getProfileDisplaySubtitle(user);

  const activeCompletion = useMemo(
    () => resolveProfileCompletion(user, profileCompletion),
    [user, profileCompletion],
  );

  const showCompletionSection =
    isAuthenticated && activeCompletion != null && !activeCompletion.isComplete;

  const profileRingProgress = useMemo(() => {
    if (!activeCompletion || activeCompletion.totalCount <= 0) return 0;
    return (activeCompletion.completedCount / activeCompletion.totalCount) * 100;
  }, [activeCompletion]);

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

  const appearanceLabel =
    themeMode === "dark"
      ? "Dark"
      : themeMode === "light"
        ? "Light"
        : "System";

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <View
        className="absolute inset-x-0 top-0 z-30 flex-row items-center justify-between px-5"
        style={{ paddingTop: insets.top + 8 }}
        pointerEvents="box-none"
      >
        <Pressable
          onPress={() => handleBottomTabPress("home")}
          hitSlop={12}
          className="h-10 w-10 items-center justify-center rounded-full"
          style={({ pressed }) => ({
            opacity: pressed ? 0.75 : 1,
            backgroundColor: colors.surface + "E6",
          })}
        >
          <MaterialIcons
            name="arrow-back-ios"
            size={18}
            color={colors.icon}
            style={{ marginLeft: 6 }}
          />
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        bounces
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
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

        {/* Avatar left (half on banner) — always visible */}
        <View
          className="z-10 px-5 pb-2"
          style={{
            marginTop: -AVATAR_OVERLAP,
            backgroundColor: colors.surface,
          }}
        >
          <View
            className="self-start"
            style={{
              marginTop: -AVATAR_OVERLAP,
              marginBottom: showCompletionSection ? 16 : 12,
            }}
          >
            <ProfileAvatarWithProgress
              user={user}
              fallbackName={displayName}
              avatarSize={AVATAR_SIZE}
              progress={profileRingProgress}
              isComplete={activeCompletion?.isComplete ?? false}
              showProgress={Boolean(showCompletionSection && activeCompletion)}
              showOnlineDot
              isOnline={isSelfOnline}
              onPress={() => navigate("/profile-details-edit" as Href)}
            />
          </View>

          {showCompletionSection && activeCompletion ? (
            <ProfileCompletionSection
              user={user}
              completion={activeCompletion}
              hideAvatar
            />
          ) : (
            <>
              <Text
                className="text-[26px] leading-8"
                style={{
                  fontFamily: ListifyFonts.bold,
                  color: colors.textPrimary,
                }}
              >
                {displayName}
              </Text>
              {displaySubtitle ? (
                <Text
                  className="mt-1 text-[15px]"
                  style={{
                    fontFamily: ListifyFonts.regular,
                    color: colors.textTertiary,
                  }}
                  numberOfLines={1}
                >
                  {displaySubtitle}
                </Text>
              ) : null}
            </>
          )}

          {/* Offline indicator */}
          {isOffline ? (
            <View
              className="mt-2 flex-row items-center gap-1.5 self-start rounded-full px-3 py-1"
              style={{ backgroundColor: colors.primarySoftStrong }}
            >
              <MaterialIcons name="cloud-off" size={12} color={colors.primary} />
              <Text
                className="text-[11px] font-medium"
                style={{ color: colors.primaryDeep }}
              >
                Offline — showing cached data
              </Text>
            </View>
          ) : null}

          <View className="mt-5 flex-row items-center self-start">
            {stats.map((stat, index) => (
              <View key={stat.label} className="flex-row items-center">
                {index > 0 ? <StatDivider colors={colors} /> : null}
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
                    className="text-[18px]"
                    style={{
                      fontFamily: ListifyFonts.bold,
                      color: colors.textPrimary,
                    }}
                  >
                    {stat.value}
                  </Text>
                  <Text
                    className="mt-0.5 text-[12px]"
                    style={{
                      fontFamily: ListifyFonts.regular,
                      color: colors.textTertiary,
                    }}
                  >
                    {stat.label}
                  </Text>
                </Pressable>
              </View>
            ))}
          </View>
        </View>

        {/* Menu list */}
        <View
          className="mt-2 px-5 pt-4"
          style={{ backgroundColor: colors.surface }}
        >
          <MenuRow
            colors={colors}
            icon="person-outline"
            iconBg={colors.primarySoft}
            iconColor={colors.primary}
            label="Edit profile"
            onPress={() => navigateProtected("/profile-details-edit" as Href)}
          />
          <MenuRow
            colors={colors}
            icon="bar-chart"
            iconBg="rgba(139,92,246,0.15)"
            iconColor={colors.accentPurple}
            label="My listings"
            onPress={() => navigateProtected("/my-listings-active" as Href)}
          />
          <MenuRow
            colors={colors}
            icon="favorite-border"
            iconBg={colors.primarySoft}
            iconColor={colors.primary}
            label="Saved items"
            badge={menuCounts.savedItems}
            onPress={() => navigateProtected("/saved-items" as Href)}
          />
          <MenuRow
            colors={colors}
            icon="chat-bubble-outline"
            iconBg="rgba(59,130,246,0.15)"
            iconColor={colors.accentBlue}
            label="Messages"
            badge={menuCounts.unreadMessages}
            onPress={() => navigateProtected("/messages-inbox" as Href, "messages")}
          />
          <MenuRow
            colors={colors}
            icon="notifications-none"
            iconBg={colors.primarySoft}
            iconColor={colors.primary}
            label="Notifications"
            badge={menuCounts.unreadNotifications}
            onPress={() => navigateProtected("/notifications-center" as Href, "notifications")}
          />

          {/* ⇢ Appearance — new row placed between Notifications and Settings */}
          <MenuRow
            colors={colors}
            icon="palette"
            iconBg="rgba(244,63,156,0.15)"
            iconColor={colors.accentPink}
            label="Appearance"
            trailingText={appearanceLabel}
            onPress={() => setAppearanceOpen(true)}
          />

          <MenuRow
            colors={colors}
            icon="settings"
            iconBg="rgba(251,146,60,0.2)"
            iconColor={colors.accentOrange}
            label="Settings"
            onPress={() => navigate("/app-settings" as Href)}
          />
          <MenuRow
            colors={colors}
            icon="history"
            iconBg="rgba(99,102,241,0.12)"
            iconColor={colors.accentIndigo}
            label="Activity Log"
            onPress={() => navigateProtected("/activity-log" as Href)}
          />
          <MenuRow
            colors={colors}
            icon="devices"
            iconBg="rgba(59,130,246,0.12)"
            iconColor={colors.accentBlue}
            label="Devices"
            onPress={() => navigateProtected("/devices" as Href)}
          />
          <MenuRow
            colors={colors}
            icon="security"
            iconBg="rgba(99,102,241,0.15)"
            iconColor={colors.accentIndigo}
            label="Security"
            onPress={() => navigateProtected("/security" as Href)}
          />

          <View
            className="my-2 h-px"
            style={{ backgroundColor: colors.border }}
          />

          <MenuRow
            colors={colors}
            icon="person-add-alt-1"
            iconBg={colors.surfaceMuted}
            iconColor={colors.textSecondary}
            label="Invite a friend"
            onPress={handleInviteFriend}
          />
          <MenuRow
            colors={colors}
            icon="help-outline"
            iconBg={colors.surfaceMuted}
            iconColor={colors.textSecondary}
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
              style={{ backgroundColor: colors.primary }}
            >
              <Text
                className="text-[16px]"
                style={{
                  fontFamily: ListifyFonts.semiBold,
                  color: colors.textOnPrimary,
                }}
              >
                Sign in
              </Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => router.push("/logout-modal" as Href)}
              className="mt-4 flex-row items-center justify-between py-3.5"
              style={({ pressed }) => ({ opacity: pressed ? 0.88 : 1 })}
            >
              <View className="flex-row items-center gap-4">
                <View
                  className="h-11 w-11 items-center justify-center rounded-2xl"
                  style={{ backgroundColor: "rgba(239,68,68,0.15)" }}
                >
                  <MaterialIcons name="logout" size={22} color={colors.danger} />
                </View>
                <Text
                  className="text-[16px]"
                  style={{
                    fontFamily: ListifyFonts.medium,
                    color: colors.danger,
                  }}
                >
                  Sign out
                </Text>
              </View>
              <MaterialIcons name="chevron-right" size={22} color={colors.iconMuted} />
            </Pressable>
          )}
        </View>
      </ScrollView>

      {/* Appearance bottom sheet */}
      <AppearanceBottomSheet
        visible={appearanceOpen}
        onClose={() => setAppearanceOpen(false)}
      />
    </View>
  );
}

import { MaterialIcons } from "@expo/vector-icons";
import { type Href, useFocusEffect, useLocalSearchParams, useRouter } from "@/lib/safe-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  type FollowListUser,
  AuthApiError,
  getAuthErrorMessage,
  getFollowList,
  toggleFollowUser,
} from "@/features/auth/services/auth-api";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { Image } from "@/lib/nativewind-interop";
import { showErrorToast } from "@/lib/toast";
import { useTabNavigation } from "@/lib/use-tab-navigation";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { fetchProfile, invalidateSession } from "@/store/slices/auth-slice";
import { FloatingBottomNav } from "@/components/floating-bottom-nav";

type FollowTab = "followers" | "following";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const defaultAvatar = "https://ui-avatars.com/api/?name=User&background=27BB97&color=fff&size=128";

const getTabParam = (value?: string | string[]): FollowTab => {
  const nextValue = typeof value === "string" ? value : value?.[0];
  return nextValue === "following" ? "following" : "followers";
};

const formatFollowMeta = (user: FollowListUser) => {
  if (user.createdAt) {
    const joinedDate = new Date(user.createdAt);
    if (!Number.isNaN(joinedDate.getTime())) {
      return `Joined ${joinedDate.toLocaleDateString(undefined, {
        month: "short",
        year: "numeric",
      })}`;
    }
  }

  if (user.provider === "google") {
    return "Google account";
  }

  return "Listifys member";
};

export function FollowersFollowingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string | string[] }>();
  const insets = useSafeAreaInsets();
  const topBarHeight = useMemo(() => insets.top + 64, [insets.top]);
  const bottomNavPadding = Math.max(insets.bottom, 8);
  const dispatch = useAppDispatch();
  const currentUser = useAppSelector((s) => s.auth.user);
  const isAuthenticated = useAppSelector((s) => s.auth.isAuthenticated);
  const network = useAppSelector((s) => s.network);
  const isOffline = !network.isConnected || network.isInternetReachable === false;
  const pagerRef = useRef<ScrollView>(null);
  const [activeTab, setActiveTab] = useState<FollowTab>(getTabParam(params.tab));
  const [searchQuery, setSearchQuery] = useState("");
  const [followers, setFollowers] = useState<FollowListUser[]>([]);
  const [followingUsers, setFollowingUsers] = useState<FollowListUser[]>([]);
  const [followState, setFollowState] = useState<Record<string, boolean>>({});
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);

  useEffect(() => {
    const tab = getTabParam(params.tab);
    setActiveTab(tab);
    pagerRef.current?.scrollTo({
      x: tab === "following" ? SCREEN_WIDTH : 0,
      animated: false,
    });
  }, [params.tab]);

  const loadFollowData = useCallback(async () => {
    if (!isAuthenticated) {
      setIsLoading(false);
      return;
    }

    if (isOffline) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
      const [followersResponse, followingResponse] = await Promise.all([
        getFollowList("followers"),
        getFollowList("following"),
      ]);

      const nextFollowers = followersResponse.users ?? [];
      const nextFollowing = followingResponse.users ?? [];
      const nextFollowState = nextFollowing.reduce<Record<string, boolean>>((acc, user) => {
        acc[user.id] = true;
        return acc;
      }, {});

      setFollowers(nextFollowers);
      setFollowingUsers(nextFollowing);
      setFollowState(nextFollowState);
      setFollowersCount(followersResponse.followersCount ?? nextFollowers.length);
      setFollowingCount(followingResponse.followingCount ?? nextFollowing.length);
    } catch (error) {
      const message = getAuthErrorMessage(error);
      showErrorToast("Followers", message);
      if (error instanceof AuthApiError && error.status === 401) {
        dispatch(invalidateSession());
      }
    } finally {
      setIsLoading(false);
    }
  }, [dispatch, isAuthenticated, isOffline]);

  useFocusEffect(
    useCallback(() => {
      void loadFollowData();
    }, [loadFollowData]),
  );

  const { refreshing, onRefresh } = usePullToRefresh(async () => {
    await loadFollowData();
    await dispatch(fetchProfile()).unwrap().catch(() => {});
  });

  const filterUsers = useCallback(
    (source: FollowListUser[]) => {
      const normalizedQuery = searchQuery.trim().toLowerCase();
      if (!normalizedQuery) {
        return source;
      }

      return source.filter((user) => {
        return (
          user.name.toLowerCase().includes(normalizedQuery) ||
          formatFollowMeta(user).toLowerCase().includes(normalizedQuery)
        );
      });
    },
    [searchQuery],
  );

  const visibleFollowers = useMemo(() => filterUsers(followers), [filterUsers, followers]);
  const visibleFollowing = useMemo(() => filterUsers(followingUsers), [filterUsers, followingUsers]);

  const handleBottomTabPress = useTabNavigation();

  const openTab = (tab: FollowTab) => {
    setActiveTab(tab);
    pagerRef.current?.scrollTo({
      x: tab === "following" ? SCREEN_WIDTH : 0,
      animated: true,
    });
    router.replace({ pathname: "/followers-following", params: { tab } });
  };

  const handlePagerScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const pageIndex = Math.round(event.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    const nextTab: FollowTab = pageIndex === 1 ? "following" : "followers";

    if (nextTab !== activeTab) {
      setActiveTab(nextTab);
      router.replace({ pathname: "/followers-following", params: { tab: nextTab } });
    }
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace("/(tabs)/dashboard-home" as Href);
  };

  const toggleFollow = async (user: FollowListUser) => {
    if (pendingUserId) {
      return;
    }

    setPendingUserId(user.id);

    try {
      const response = await toggleFollowUser(user.id);
      const isFollowing = response.isFollowing;

      setFollowState((current) => ({
        ...current,
        [user.id]: isFollowing,
      }));

      setFollowingUsers((current) => {
        const exists = current.some((entry) => entry.id === user.id);
        if (isFollowing) {
          return exists ? current : [user, ...current];
        }

        return current.filter((entry) => entry.id !== user.id);
      });

      if (response.followingCount != null) {
        setFollowingCount(response.followingCount);
      }
      if (response.myFollowersCount != null) {
        setFollowersCount(response.myFollowersCount);
      }

      void dispatch(fetchProfile());
    } catch (error) {
      showErrorToast("Follow", error instanceof Error ? error.message : "Failed to update follow status.");
    } finally {
      setPendingUserId(null);
    }
  };

  const renderUserList = (tab: FollowTab, users: FollowListUser[]) => {
    if (isLoading) {
      return (
        <View className="items-center py-16">
          <ActivityIndicator size="large" color="#27BB97" />
          <Text className="mt-3 text-[14px] text-slate-500">Loading...</Text>
        </View>
      );
    }

    if (users.length === 0) {
      return (
        <View className="items-center rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-10">
          <MaterialIcons name="group-off" size={30} color="#94A3B8" />
          <Text className="mt-3 text-[16px] font-semibold text-[#161D1A]">
            {tab === "followers" ? "No followers yet" : "Not following anyone yet"}
          </Text>
          <Text className="mt-1 text-center text-[13px] leading-5 text-slate-500">
            {searchQuery.trim()
              ? "Try a different name search."
              : tab === "followers"
                ? "People who follow you will appear here."
                : "Profiles you follow will appear here."}
          </Text>
        </View>
      );
    }

    return users.map((user) => {
      const isFollowing = tab === "following" ? true : !!followState[user.id];
      const isPending = pendingUserId === user.id;
      const buttonLabel =
        tab === "followers" && !isFollowing
          ? "Follow back"
          : isFollowing
            ? "Unfollow"
            : "Follow";

      return (
        <View
          key={user.id}
          className="flex-row items-center justify-between rounded-xl border border-transparent px-3 py-3"
          style={{ backgroundColor: "transparent" }}
        >
          <Pressable
            onPress={() => router.push({ pathname: "/seller-public-profile", params: { userId: user.id } })}
            className="flex-1 flex-row items-center gap-3"
            style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
          >
            <View className="h-12 w-12 overflow-hidden rounded-full border border-slate-100 bg-slate-200">
              <Image source={user.profileImageUrl || defaultAvatar} contentFit="cover" className="h-full w-full" />
            </View>
            <View>
              <View className="flex-row items-center gap-1">
                <Text className="text-[18px] font-semibold text-[#161D1A]">{user.name}</Text>
                {user.provider === "google" ? (
                  <MaterialIcons name="verified" size={18} color="#27BB97" />
                ) : null}
              </View>
              <Text className="text-[12px] font-medium text-slate-500">{formatFollowMeta(user)}</Text>
            </View>
          </Pressable>

          <Pressable
            onPress={() => void toggleFollow(user)}
            disabled={isPending}
            className="min-w-[96px] items-center justify-center rounded-full px-5 py-2"
            style={({ pressed }) => ({
              backgroundColor: isFollowing ? "#FFFFFF" : "#27BB97",
              borderWidth: isFollowing ? 1 : 0,
              borderColor: isFollowing ? "#E2E8F0" : "transparent",
              opacity: pressed || isPending ? 0.75 : 1,
            })}
          >
            {isPending ? (
              <ActivityIndicator size="small" color={isFollowing ? "#475569" : "#FFFFFF"} />
            ) : (
              <Text className="text-[12px] font-semibold" style={{ color: isFollowing ? "#475569" : "#FFFFFF" }}>
                {buttonLabel}
              </Text>
            )}
          </Pressable>
        </View>
      );
    });
  };

  return (
    <View className="flex-1 bg-[#F6F7F8]">
      <View
        className="absolute inset-x-0 top-0 z-50 flex-row items-center justify-between border-b border-slate-100 bg-white/90 px-4"
        style={{
          paddingTop: insets.top,
          height: topBarHeight,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.05,
          shadowRadius: 2,
          elevation: 2,
        }}
      >
        <View className="flex-row items-center gap-4">
          <Pressable onPress={handleBack} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
            <MaterialIcons name="arrow-back" size={24} color="#161D1A" />
          </Pressable>
          <Text className="text-[20px] font-semibold tracking-tight text-[#161D1A]">
            {currentUser?.name || "Followers"}
          </Text>
        </View>
        <Pressable style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
          <MaterialIcons name="more-vert" size={22} color="#161D1A" />
        </Pressable>
      </View>

      <View className="flex-1" style={{ paddingTop: topBarHeight, paddingBottom: 84 + bottomNavPadding }}>
        <View className="border-b border-slate-100 bg-white">
          <View className="flex-row">
            {[
              { key: "followers" as const, count: String(followersCount), label: "Followers" },
              { key: "following" as const, count: String(followingCount), label: "Following" },
            ].map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <Pressable
                  key={tab.key}
                  onPress={() => openTab(tab.key)}
                  className="flex-1 items-center border-b-2 py-4"
                  style={{ borderBottomColor: isActive ? "#27BB97" : "transparent" }}
                >
                  <Text className="text-[18px] font-semibold" style={{ color: isActive ? "#27BB97" : "#161D1A" }}>
                    {tab.count}
                  </Text>
                  <Text className="text-[11px] font-medium uppercase tracking-wider" style={{ color: isActive ? "#27BB97" : "#64748B" }}>
                    {tab.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View className="px-4 py-4">
          <View className="h-12 flex-row items-center rounded-xl bg-[#F3F4F6] px-4">
            <MaterialIcons name="search" size={20} color="#94A3B8" />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder={activeTab === "followers" ? "Search followers..." : "Search following..."}
              placeholderTextColor="#94A3B8"
              className="ml-3 flex-1 text-[14px] text-[#161D1A]"
              style={{ paddingVertical: 0 }}
            />
          </View>
        </View>

        <ScrollView
          ref={pagerRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          bounces={false}
          decelerationRate="fast"
          onMomentumScrollEnd={handlePagerScrollEnd}
          style={{ flex: 1 }}
        >
          {(["followers", "following"] as const).map((tab) => {
            const users = tab === "followers" ? visibleFollowers : visibleFollowing;

            return (
              <ScrollView
                key={tab}
                style={{ width: SCREEN_WIDTH }}
                showsVerticalScrollIndicator={false}
                refreshControl={
                  <RefreshControl
                    refreshing={refreshing}
                    onRefresh={onRefresh}
                    colors={["#27BB97"]}
                    tintColor="#27BB97"
                  />
                }
                contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16, gap: 8 }}
              >
                {renderUserList(tab, users)}
              </ScrollView>
            );
          })}
        </ScrollView>
      </View>

      <FloatingBottomNav activeTabId="profile" onTabPress={handleBottomTabPress} />
    </View>
  );
}

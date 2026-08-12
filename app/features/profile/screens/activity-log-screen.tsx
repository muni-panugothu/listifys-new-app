import { MaterialIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "@/lib/safe-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ListifyFonts } from "@/constants/typography";
import { type ActivityLogEntry, getActivityLog } from "@/features/auth/services/auth-api";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { useTheme } from "@/providers/theme-provider";

// ── Icon mapping ─────────────────────────────────────────────────────────────

type ActivityIconInfo = {
  icon: React.ComponentProps<typeof MaterialIcons>["name"];
  bg: string;
  tint: string;
};

function getActivityIcon(action: string, isDark: boolean): ActivityIconInfo {
  const a = action.toLowerCase();
  const pair = (lightBg: string, tint: string) => ({
    bg: isDark ? `${tint}22` : lightBg,
    tint,
  });
  if (a.includes("login") || a.includes("sign_in") || a.includes("signin")) {
    return { icon: "login", ...pair("#EFF6FF", "#3B82F6") };
  }
  if (a.includes("logout") || a.includes("sign_out") || a.includes("signout")) {
    return { icon: "logout", ...pair("#FFF7ED", "#FB923C") };
  }
  if (a.includes("password") || a.includes("reset")) {
    return { icon: "lock-reset", ...pair("#FEF2F2", "#EF4444") };
  }
  if (a.includes("profile") || a.includes("avatar") || a.includes("picture") || a.includes("update")) {
    return { icon: "manage-accounts", ...pair("#F0FDF4", "#22C55E") };
  }
  if (a.includes("register") || a.includes("signup") || a.includes("sign_up")) {
    return { icon: "person-add", ...pair("#FAF5FF", "#A855F7") };
  }
  if (a.includes("list") || a.includes("post") || a.includes("publish")) {
    return { icon: "inventory-2", ...pair("#F0FDFA", "#27BB97") };
  }
  if (a.includes("device") || a.includes("session")) {
    return { icon: "devices", ...pair("#EFF6FF", "#1D4ED8") };
  }
  if (a.includes("follow")) {
    return { icon: "person-add-alt-1", ...pair("#FFF0F6", "#EC4899") };
  }
  return { icon: "history", ...pair("#F1F5F9", "#64748B") };
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function groupByDate(
  activities: ActivityLogEntry[],
): { label: string; items: ActivityLogEntry[] }[] {
  const groups = new Map<string, ActivityLogEntry[]>();
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  for (const item of activities) {
    const d = new Date(item.createdAt);
    let label: string;
    if (isSameDay(d, today)) {
      label = "Today";
    } else if (isSameDay(d, yesterday)) {
      label = "Yesterday";
    } else {
      label = d.toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
      });
    }
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(item);
  }

  return Array.from(groups.entries()).map(([label, items]) => ({ label, items }));
}

// ── Screen ────────────────────────────────────────────────────────────────────

export function ActivityLogScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, resolvedMode } = useTheme();
  const isDark = resolvedMode === "dark";
  const topBarHeight = useMemo(() => insets.top + 64, [insets.top]);

  const [activities, setActivities] = useState<ActivityLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadActivities = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getActivityLog();
      setActivities(res.activities || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load activity log.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Real-time: refetch every time the screen comes into focus
  useFocusEffect(
    useCallback(() => {
      void loadActivities();
    }, [loadActivities]),
  );

  const { refreshing, onRefresh } = usePullToRefresh(loadActivities);

  const groups = useMemo(() => groupByDate(activities), [activities]);

  const loginCount = useMemo(
    () =>
      activities.filter((a) => {
        const x = a.action.toLowerCase();
        return x.includes("login") || x.includes("sign_in") || x.includes("signin");
      }).length,
    [activities],
  );
  const securityCount = useMemo(
    () =>
      activities.filter((a) => {
        const x = a.action.toLowerCase();
        return x.includes("password") || x.includes("reset") || x.includes("device");
      }).length,
    [activities],
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* ── Top Bar ── */}
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          backgroundColor: colors.surface,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          paddingHorizontal: 16,
          paddingTop: insets.top,
          height: topBarHeight,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: isDark ? 0.2 : 0.06,
          shadowRadius: 4,
          elevation: 3,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => ({
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: pressed ? colors.surfaceMuted : "transparent",
              alignItems: "center",
              justifyContent: "center",
            })}
          >
            <MaterialIcons name="arrow-back" size={22} color="#27BB97" />
          </Pressable>
          <Text style={{ fontFamily: ListifyFonts.semiBold, fontSize: 17, color: colors.textPrimary }}>
            Activity Log
          </Text>
        </View>

        {loading && !refreshing ? (
          <ActivityIndicator size="small" color="#27BB97" />
        ) : (
          <Pressable
            onPress={() => void loadActivities()}
            style={({ pressed }) => ({
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: pressed ? colors.surfaceMuted : "transparent",
              alignItems: "center",
              justifyContent: "center",
            })}
          >
            <MaterialIcons name="refresh" size={22} color={colors.iconMuted} />
          </Pressable>
        )}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={["#27BB97"]}
            tintColor="#27BB97"
            progressViewOffset={topBarHeight}
          />
        }
        contentContainerStyle={{
          paddingTop: topBarHeight + 20,
          paddingBottom: 40 + Math.max(insets.bottom, 8),
          paddingHorizontal: 16,
        }}
      >
        {/* ── Stats Row ── */}
        <View style={{ flexDirection: "row", gap: 10, marginBottom: 24 }}>
          {([
            {
              label: "Total",
              value: String(activities.length),
              icon: "history" as const,
              tint: "#27BB97",
              bg: isDark ? "rgba(39,187,151,0.18)" : "#F0FDFA",
            },
            {
              label: "Logins",
              value: String(loginCount),
              icon: "login" as const,
              tint: "#3B82F6",
              bg: isDark ? "rgba(59,130,246,0.18)" : "#EFF6FF",
            },
            {
              label: "Security",
              value: String(securityCount),
              icon: "security" as const,
              tint: "#EF4444",
              bg: isDark ? "rgba(239,68,68,0.18)" : "#FEF2F2",
            },
          ] as const).map((s) => (
            <View
              key={s.label}
              style={{
                flex: 1,
                backgroundColor: colors.card,
                borderRadius: 16,
                padding: 14,
                alignItems: "center",
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: isDark ? 0.2 : 0.06,
                shadowRadius: 4,
                elevation: 2,
              }}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  backgroundColor: s.bg,
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 8,
                }}
              >
                <MaterialIcons name={s.icon} size={18} color={s.tint} />
              </View>
              <Text
                style={{
                  fontFamily: ListifyFonts.bold,
                  fontSize: 20,
                  color: colors.textPrimary,
                }}
              >
                {s.value}
              </Text>
              <Text
                style={{
                  fontFamily: ListifyFonts.regular,
                  fontSize: 11,
                  color: colors.textTertiary,
                  marginTop: 2,
                  textAlign: "center",
                }}
              >
                {s.label}
              </Text>
            </View>
          ))}
        </View>

        {/* ── Body ── */}
        {loading && activities.length === 0 ? (
          <View style={{ alignItems: "center", paddingVertical: 48 }}>
            <ActivityIndicator size="large" color="#27BB97" />
            <Text
              style={{
                fontFamily: ListifyFonts.regular,
                fontSize: 14,
                color: colors.textTertiary,
                marginTop: 12,
              }}
            >
              Loading activity…
            </Text>
          </View>
        ) : error ? (
          <View
            style={{
              alignItems: "center",
              paddingVertical: 40,
              paddingHorizontal: 24,
              backgroundColor: colors.card,
              borderRadius: 16,
            }}
          >
            <MaterialIcons name="wifi-off" size={40} color={colors.iconMuted} />
            <Text
              style={{
                fontFamily: ListifyFonts.semiBold,
                fontSize: 16,
                color: colors.textPrimary,
                marginTop: 12,
              }}
            >
              Could not load activity
            </Text>
            <Text
              style={{
                fontFamily: ListifyFonts.regular,
                fontSize: 13,
                color: colors.textTertiary,
                marginTop: 4,
                textAlign: "center",
              }}
            >
              {error}
            </Text>
            <Pressable
              onPress={() => void loadActivities()}
              style={({ pressed }) => ({
                marginTop: 16,
                paddingHorizontal: 24,
                paddingVertical: 10,
                backgroundColor: pressed ? "#1EA880" : "#27BB97",
                borderRadius: 20,
              })}
            >
              <Text
                style={{ fontFamily: ListifyFonts.semiBold, fontSize: 14, color: "#FFFFFF" }}
              >
                Retry
              </Text>
            </Pressable>
          </View>
        ) : activities.length === 0 ? (
          <View
            style={{
              alignItems: "center",
              paddingVertical: 48,
              backgroundColor: colors.card,
              borderRadius: 16,
            }}
          >
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                backgroundColor: isDark ? "rgba(39,187,151,0.18)" : "#F0FDFA",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 16,
              }}
            >
              <MaterialIcons name="history" size={32} color="#27BB97" />
            </View>
            <Text
              style={{ fontFamily: ListifyFonts.semiBold, fontSize: 16, color: colors.textPrimary }}
            >
              No activity yet
            </Text>
            <Text
              style={{
                fontFamily: ListifyFonts.regular,
                fontSize: 14,
                color: colors.textTertiary,
                marginTop: 6,
                textAlign: "center",
                paddingHorizontal: 32,
              }}
            >
              Your account activity will appear here.
            </Text>
          </View>
        ) : (
          groups.map((group) => (
            <View key={group.label} style={{ marginBottom: 28 }}>
              {/* Date group label */}
              <Text
                style={{
                  fontFamily: ListifyFonts.semiBold,
                  fontSize: 11,
                  color: colors.textTertiary,
                  textTransform: "uppercase",
                  letterSpacing: 1.2,
                  marginBottom: 12,
                }}
              >
                {group.label}
              </Text>

              {/* Timeline column */}
              <View style={{ position: "relative", paddingLeft: 52 }}>
                {/* Vertical line */}
                <View
                  style={{
                    position: "absolute",
                    left: 17,
                    top: 18,
                    bottom: 18,
                    width: 2,
                    backgroundColor: colors.border,
                    borderRadius: 1,
                  }}
                />

                {group.items.map((item, idx) => {
                  const { icon, bg, tint } = getActivityIcon(item.action, isDark);
                  const d = new Date(item.createdAt);
                  const timeLabel = d.toLocaleTimeString("en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                  });
                  const isLast = idx === group.items.length - 1;

                  return (
                    <View
                      key={item._id ?? item.createdAt}
                      style={{ marginBottom: isLast ? 0 : 12, position: "relative" }}
                    >
                      {/* Icon dot */}
                      <View
                        style={{
                          position: "absolute",
                          left: -52,
                          top: 10,
                          width: 36,
                          height: 36,
                          borderRadius: 18,
                          backgroundColor: bg,
                          borderWidth: 2.5,
                          borderColor: colors.card,
                          alignItems: "center",
                          justifyContent: "center",
                          shadowColor: tint,
                          shadowOffset: { width: 0, height: 2 },
                          shadowOpacity: 0.2,
                          shadowRadius: 4,
                          elevation: 3,
                        }}
                      >
                        <MaterialIcons name={icon} size={16} color={tint} />
                      </View>

                      {/* Card */}
                      <View
                        style={{
                          backgroundColor: colors.card,
                          borderRadius: 14,
                          padding: 14,
                          shadowColor: "#000",
                          shadowOffset: { width: 0, height: 1 },
                          shadowOpacity: isDark ? 0.15 : 0.05,
                          shadowRadius: 3,
                          elevation: 1,
                        }}
                      >
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "flex-start",
                            justifyContent: "space-between",
                            marginBottom: item.description ? 6 : 0,
                          }}
                        >
                          <Text
                            style={{
                              fontFamily: ListifyFonts.semiBold,
                              fontSize: 14,
                              color: colors.textPrimary,
                              flex: 1,
                              marginRight: 8,
                            }}
                          >
                            {item.title ?? item.action}
                          </Text>
                          <View
                            style={{
                              backgroundColor: colors.surfaceMuted,
                              borderRadius: 8,
                              paddingHorizontal: 8,
                              paddingVertical: 3,
                            }}
                          >
                            <Text
                              style={{
                                fontFamily: ListifyFonts.medium,
                                fontSize: 11,
                                color: colors.textSecondary,
                              }}
                            >
                              {timeLabel}
                            </Text>
                          </View>
                        </View>

                        {item.description ? (
                          <Text
                            style={{
                              fontFamily: ListifyFonts.regular,
                              fontSize: 13,
                              color: colors.textSecondary,
                              lineHeight: 19,
                            }}
                          >
                            {item.description}
                          </Text>
                        ) : null}

                        {item.ipAddress ? (
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              marginTop: 8,
                              gap: 4,
                            }}
                          >
                            <MaterialIcons name="location-on" size={12} color={colors.iconMuted} />
                            <Text
                              style={{
                                fontFamily: ListifyFonts.regular,
                                fontSize: 11,
                                color: colors.textTertiary,
                              }}
                            >
                              {item.ipAddress}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

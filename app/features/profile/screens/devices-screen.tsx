import { MaterialIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "@/lib/safe-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { type DeviceSession, getDevices, logoutAllDevices, revokeDevice } from "@/features/auth/services/auth-api";
import { ListifyFonts } from "@/constants/typography";
import { showErrorToast } from "@/lib/toast";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { useTheme } from "@/providers/theme-provider";

function getDeviceIcon(device: DeviceSession): React.ComponentProps<typeof MaterialIcons>["name"] {
  const t = (device.deviceType || device.deviceName || "").toLowerCase();
  if (t.includes("phone") || t.includes("mobile") || t.includes("android") || t.includes("iphone")) return "smartphone";
  if (t.includes("tablet") || t.includes("ipad")) return "tablet-mac";
  return "laptop-mac";
}

export function DevicesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, resolvedMode } = useTheme();
  const isDark = resolvedMode === "dark";
  const topBarHeight = useMemo(() => insets.top + 64, [insets.top]);

  const [devices, setDevices] = useState<DeviceSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDevices = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getDevices();
      setDevices(res.devices || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sessions.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Real-time: refetch every time the screen comes into focus
  useFocusEffect(
    useCallback(() => {
      void loadDevices();
    }, [loadDevices]),
  );

  const { refreshing, onRefresh } = usePullToRefresh(loadDevices);

  const handleLogoutAll = () => {
    Alert.alert("Log out everywhere?", "You will be signed out from all other devices.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log Out All",
        style: "destructive",
        onPress: async () => {
          try {
            await logoutAllDevices();
            loadDevices();
          } catch (e: any) {
            showErrorToast("Error", e.message || "Failed");
          }
        },
      },
    ]);
  };

  const handleRevokeDevice = (deviceId: string) => {
    Alert.alert("Remove device?", "This device will be signed out.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          try {
            await revokeDevice(deviceId);
            loadDevices();
          } catch (e: any) {
            showErrorToast("Error", e.message || "Failed");
          }
        },
      },
    ]);
  };

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
        <Text style={{ fontFamily: ListifyFonts.bold, fontSize: 17, color: colors.textPrimary }}>Devices</Text>
        {loading && !refreshing ? (
          <ActivityIndicator size="small" color="#27BB97" />
        ) : (
          <Pressable
            onPress={() => void loadDevices()}
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
        contentContainerStyle={{ paddingTop: topBarHeight + 20, paddingBottom: 100 + Math.max(insets.bottom, 8), paddingHorizontal: 16 }}
      >
        {/* ── Hero Banner ── */}
        <View
          style={{
            marginBottom: 20,
            borderRadius: 20,
            overflow: "hidden",
            height: 140,
            backgroundColor: "#161D1A",
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.15,
            shadowRadius: 12,
            elevation: 6,
          }}
        >
          <LinearGradient
            colors={["#1B4332", "#27BB97"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ flex: 1, padding: 20, justifyContent: "flex-end" }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: "rgba(255,255,255,0.15)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <MaterialIcons name="security" size={24} color="#FFFFFF" />
              </View>
              <View>
                <Text style={{ fontFamily: ListifyFonts.bold, fontSize: 18, color: "#FFFFFF" }}>
                  Security & Access
                </Text>
                <Text style={{ fontFamily: ListifyFonts.regular, fontSize: 12, color: "rgba(255,255,255,0.75)", marginTop: 2 }}>
                  Manage where you're signed in
                </Text>
              </View>
            </View>
          </LinearGradient>
        </View>

        {/* ── Info Banner ── */}
        <View
          style={{
            marginBottom: 20,
            flexDirection: "row",
            gap: 12,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: isDark ? "rgba(39,187,151,0.35)" : "rgba(39,187,151,0.2)",
            backgroundColor: isDark ? "rgba(39,187,151,0.12)" : "rgba(39,187,151,0.07)",
            padding: 14,
          }}
        >
          <MaterialIcons name="info-outline" size={20} color="#27BB97" style={{ marginTop: 1 }} />
          <Text style={{ fontFamily: ListifyFonts.regular, fontSize: 13, color: colors.textSecondary, lineHeight: 19, flex: 1 }}>
            If you see a device you don't recognize, remove it and change your password immediately.
          </Text>
        </View>

        {/* ── Sessions Label ── */}
        <Text style={{ fontFamily: ListifyFonts.semiBold, fontSize: 13, color: colors.textTertiary, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 12 }}>
          Active Sessions
        </Text>

        {/* ── Sessions list ── */}
        {loading && devices.length === 0 ? (
          <View style={{ alignItems: "center", paddingVertical: 40 }}>
            <ActivityIndicator size="large" color="#27BB97" />
            <Text style={{ fontFamily: ListifyFonts.regular, fontSize: 14, color: colors.textTertiary, marginTop: 12 }}>Loading sessions…</Text>
          </View>
        ) : error ? (
          <View style={{ alignItems: "center", paddingVertical: 32, paddingHorizontal: 24, backgroundColor: colors.card, borderRadius: 16 }}>
            <MaterialIcons name="wifi-off" size={40} color={colors.iconMuted} />
            <Text style={{ fontFamily: ListifyFonts.semiBold, fontSize: 16, color: colors.textPrimary, marginTop: 12 }}>Could not load sessions</Text>
            <Text style={{ fontFamily: ListifyFonts.regular, fontSize: 13, color: colors.textTertiary, marginTop: 4, textAlign: "center" }}>{error}</Text>
            <Pressable
              onPress={() => void loadDevices()}
              style={({ pressed }) => ({ marginTop: 16, paddingHorizontal: 24, paddingVertical: 10, backgroundColor: pressed ? "#1EA880" : "#27BB97", borderRadius: 20 })}
            >
              <Text style={{ fontFamily: ListifyFonts.semiBold, fontSize: 14, color: "#FFFFFF" }}>Retry</Text>
            </Pressable>
          </View>
        ) : devices.length === 0 ? (
          <View style={{ alignItems: "center", paddingVertical: 48, backgroundColor: colors.card, borderRadius: 16 }}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: isDark ? "rgba(39,187,151,0.18)" : "#F0FDFA", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
              <MaterialIcons name="devices" size={32} color="#27BB97" />
            </View>
            <Text style={{ fontFamily: ListifyFonts.semiBold, fontSize: 16, color: colors.textPrimary }}>No active sessions</Text>
            <Text style={{ fontFamily: ListifyFonts.regular, fontSize: 14, color: colors.textTertiary, marginTop: 6, textAlign: "center", paddingHorizontal: 32 }}>You appear to only be logged in here.</Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {devices.map((device) => (
              <View
                key={device.deviceId}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  backgroundColor: colors.card,
                  borderRadius: 16,
                  padding: 14,
                  borderWidth: device.current ? 1.5 : 1,
                  borderColor: device.current ? "rgba(39,187,151,0.35)" : colors.border,
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: isDark ? 0.15 : 0.05,
                  shadowRadius: 3,
                  elevation: device.current ? 3 : 1,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1 }}>
                  <View
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 14,
                      backgroundColor: device.current
                        ? (isDark ? "rgba(39,187,151,0.18)" : "#F0FDFA")
                        : colors.surfaceMuted,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <MaterialIcons
                      name={getDeviceIcon(device)}
                      size={24}
                      color={device.current ? "#27BB97" : colors.iconMuted}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <Text style={{ fontFamily: ListifyFonts.semiBold, fontSize: 15, color: colors.textPrimary }}>
                        {device.deviceName || "Unknown Device"}
                      </Text>
                      {device.current ? (
                        <View style={{ backgroundColor: isDark ? "rgba(39,187,151,0.18)" : "#F0FDFA", borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 }}>
                          <Text style={{ fontFamily: ListifyFonts.bold, fontSize: 10, color: "#27BB97", textTransform: "uppercase", letterSpacing: 0.6 }}>
                            This device
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={{ fontFamily: ListifyFonts.regular, fontSize: 12, color: colors.textTertiary, marginTop: 3 }}>
                      {[
                        device.location || device.ipAddress,
                        device.lastActiveText ?? (device.lastActive ? new Date(device.lastActive).toLocaleDateString() : null),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                  </View>
                </View>
                {device.current ? null : (
                  <Pressable
                    onPress={() => handleRevokeDevice(device.deviceId)}
                    style={({ pressed }) => ({
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      backgroundColor: pressed ? "#FEF2F2" : "#FFF5F5",
                      alignItems: "center",
                      justifyContent: "center",
                    })}
                  >
                    <MaterialIcons name="close" size={18} color="#EF4444" />
                  </Pressable>
                )}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}


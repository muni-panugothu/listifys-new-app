import { MaterialIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams } from "expo-router";
import { useRouter } from "@/lib/safe-router";
import { useCallback, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { revokeDevice, logoutAllDevices } from "@/features/auth/services/auth-api";
import { ListifyFonts } from "@/constants/typography";
import { showErrorToast } from "@/lib/toast";

// ── Types ───────────────────────────────────────────────────────────────────────
type AlertParams = {
  deviceId?: string;
  deviceName?: string;
  deviceType?: string;
  city?: string;
  state?: string;
  country?: string;
  ipAddress?: string;
  loginTime?: string;
  timezone?: string;
  isNewDevice?: string;
  isNewLocation?: string;
};

// ── Main Component ──────────────────────────────────────────────────────────────
export function SecurityAlertScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<AlertParams>();
  const [isRevoking, setIsRevoking] = useState(false);

  const deviceName = params.deviceName || "Unknown Device";
  const location = [params.city, params.state, params.country]
    .filter((p) => p && p !== "Local" && p !== "Development")
    .join(", ") || "Unknown Location";
  const loginTime = params.loginTime
    ? formatTime(params.loginTime, params.timezone)
    : "Unknown Time";
  const isNewDevice = params.isNewDevice === "true";
  const isNewLocation = params.isNewLocation === "true";

  const handleSecureAccount = useCallback(async () => {
    if (!params.deviceId) {
      router.push("/change-password");
      return;
    }

    Alert.alert(
      "Secure Your Account",
      "What would you like to do?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove This Device",
          style: "destructive",
          onPress: async () => {
            setIsRevoking(true);
            try {
              await revokeDevice(params.deviceId!);
              router.back();
            } catch (err) {
              showErrorToast(
                "Error",
                err instanceof Error ? err.message : "Failed to revoke device.",
              );
            } finally {
              setIsRevoking(false);
            }
          },
        },
        {
          text: "Sign Out Everywhere",
          style: "destructive",
          onPress: async () => {
            setIsRevoking(true);
            try {
              await logoutAllDevices();
              router.back();
            } catch (err) {
              showErrorToast(
                "Error",
                err instanceof Error ? err.message : "Failed to sign out all devices.",
              );
            } finally {
              setIsRevoking(false);
            }
          },
        },
        {
          text: "Change Password",
          onPress: () => router.push("/change-password"),
        },
      ],
    );
  }, [params.deviceId, router]);

  const handleDismiss = useCallback(() => {
    Alert.alert(
      "Was this you?",
      "If you recognize this login, you can safely dismiss this alert.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Yes, This Was Me",
          onPress: () => router.back(),
        },
      ],
    );
  }, [router]);

  return (
    <View className="flex-1 bg-[#0f0f0f]">
      {/* Status bar background */}
      <View style={{ height: insets.top }} className="bg-[#0f0f0f]" />

      {/* Header */}
      <View className="flex-row items-center px-4 py-3">
        <Pressable
          onPress={() => router.back()}
          className="mr-3 h-10 w-10 items-center justify-center rounded-full bg-white/10"
          hitSlop={12}
        >
          <MaterialIcons name="arrow-back" size={22} color="#fff" />
        </Pressable>
        <Text
          style={{ fontFamily: ListifyFonts.bold }}
          className="flex-1 text-lg text-white"
        >
          Security Alert
        </Text>
        <View className="h-10 w-10 items-center justify-center rounded-full bg-red-500/20">
          <MaterialIcons name="shield" size={20} color="#ef4444" />
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Shield Hero */}
        <View className="items-center px-6 pt-8 pb-4">
          <LinearGradient
            colors={["#dc262620", "#f59e0b10", "#0f0f0f00"]}
            className="absolute inset-0 rounded-3xl"
          />
          <View className="mb-4 h-20 w-20 items-center justify-center rounded-full bg-red-500/15 border border-red-500/30">
            <MaterialIcons name="security" size={40} color="#ef4444" />
          </View>
          <Text
            style={{ fontFamily: ListifyFonts.bold }}
            className="text-2xl text-white text-center mb-2"
          >
            New Login Detected
          </Text>
          <Text
            style={{ fontFamily: ListifyFonts.regular }}
            className="text-sm text-zinc-400 text-center leading-5"
          >
            A new sign-in to your Listifys account was detected from an{" "}
            {isNewDevice ? "unrecognized device" : "unusual location"}.
          </Text>
        </View>

        {/* Alert Badges */}
        <View className="flex-row justify-center gap-2 px-6 mb-6">
          {isNewDevice && (
            <View className="flex-row items-center rounded-full bg-amber-500/15 border border-amber-500/30 px-3 py-1.5">
              <MaterialIcons name="devices-other" size={14} color="#f59e0b" />
              <Text
                style={{ fontFamily: ListifyFonts.medium }}
                className="text-xs text-amber-400 ml-1.5"
              >
                New Device
              </Text>
            </View>
          )}
          {isNewLocation && (
            <View className="flex-row items-center rounded-full bg-amber-500/15 border border-amber-500/30 px-3 py-1.5">
              <MaterialIcons name="location-on" size={14} color="#f59e0b" />
              <Text
                style={{ fontFamily: ListifyFonts.medium }}
                className="text-xs text-amber-400 ml-1.5"
              >
                New Location
              </Text>
            </View>
          )}
        </View>

        {/* Login Details Card */}
        <View className="mx-4 rounded-2xl bg-white/4 border border-white/8 overflow-hidden">
          {/* Card Header */}
          <View className="flex-row items-center px-5 py-4 border-b border-white/6">
            <MaterialIcons name="info-outline" size={18} color="#94a3b8" />
            <Text
              style={{ fontFamily: ListifyFonts.semiBold }}
              className="text-sm text-zinc-300 ml-2"
            >
              Login Details
            </Text>
          </View>

          {/* Device */}
          <DetailRow
            icon="smartphone"
            label="Device"
            value={deviceName}
          />

          {/* Location */}
          <DetailRow
            icon="location-on"
            label="Location"
            value={location}
          />

          {/* Time */}
          <DetailRow
            icon="access-time"
            label="Time"
            value={loginTime}
          />

          {/* IP Address */}
          {params.ipAddress && (
            <DetailRow
              icon="router"
              label="IP Address"
              value={maskIpAddress(params.ipAddress)}
              isLast
            />
          )}
        </View>

        {/* Warning Message */}
        <View className="mx-4 mt-4 rounded-2xl bg-amber-500/8 border border-amber-500/20 p-4">
          <View className="flex-row items-start">
            <MaterialIcons name="warning" size={20} color="#f59e0b" />
            <View className="flex-1 ml-3">
              <Text
                style={{ fontFamily: ListifyFonts.semiBold }}
                className="text-sm text-amber-300 mb-1"
              >
                If this wasn't you
              </Text>
              <Text
                style={{ fontFamily: ListifyFonts.regular }}
                className="text-xs text-amber-300/70 leading-4"
              >
                Someone may have access to your account. Secure your account immediately by
                changing your password and removing unknown devices.
              </Text>
            </View>
          </View>
        </View>

        {/* Action Buttons */}
        <View className="px-4 mt-8 gap-3">
          {/* Primary CTA */}
          <Pressable
            onPress={handleSecureAccount}
            disabled={isRevoking}
            className="rounded-2xl overflow-hidden"
          >
            <LinearGradient
              colors={["#dc2626", "#b91c1c"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              className="flex-row items-center justify-center py-4 px-6 rounded-2xl"
            >
              <MaterialIcons name="lock" size={20} color="#fff" />
              <Text
                style={{ fontFamily: ListifyFonts.bold }}
                className="text-base text-white ml-2"
              >
                {isRevoking ? "Securing..." : "TAP TO TAKE ACTION"}
              </Text>
            </LinearGradient>
          </Pressable>

          {/* Secondary CTA */}
          <Pressable
            onPress={handleDismiss}
            className="flex-row items-center justify-center py-4 px-6 rounded-2xl bg-white/6 border border-white/10"
          >
            <MaterialIcons name="check-circle" size={20} color="#22c55e" />
            <Text
              style={{ fontFamily: ListifyFonts.semiBold }}
              className="text-sm text-zinc-300 ml-2"
            >
              This Was Me
            </Text>
          </Pressable>

          {/* Tertiary: View All Devices */}
          <Pressable
            onPress={() => router.push("/devices")}
            className="flex-row items-center justify-center py-3 px-6"
          >
            <MaterialIcons name="devices" size={18} color="#94a3b8" />
            <Text
              style={{ fontFamily: ListifyFonts.medium }}
              className="text-sm text-zinc-400 ml-2 underline"
            >
              View All Devices
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

// ── Detail Row Component ────────────────────────────────────────────────────────
function DetailRow({
  icon,
  label,
  value,
  isLast = false,
}: {
  icon: React.ComponentProps<typeof MaterialIcons>["name"];
  label: string;
  value: string;
  isLast?: boolean;
}) {
  return (
    <View
      className={`flex-row items-center px-5 py-4 ${!isLast ? "border-b border-white/4" : ""}`}
    >
      <View className="h-9 w-9 items-center justify-center rounded-full bg-white/6">
        <MaterialIcons name={icon} size={18} color="#94a3b8" />
      </View>
      <View className="flex-1 ml-3">
        <Text
          style={{ fontFamily: ListifyFonts.regular }}
          className="text-xs text-zinc-500 mb-0.5"
        >
          {label}
        </Text>
        <Text
          style={{ fontFamily: ListifyFonts.semiBold }}
          className="text-sm text-white"
        >
          {value}
        </Text>
      </View>
    </View>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

function formatTime(isoString: string, timezone?: string): string {
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;
    const options: Intl.DateTimeFormatOptions = {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZoneName: "short",
    };
    if (timezone) options.timeZone = timezone;
    return new Intl.DateTimeFormat("en-IN", options).format(date);
  } catch {
    return isoString;
  }
}

function maskIpAddress(ip: string): string {
  if (!ip) return "Unknown";
  // Mask the last two octets for privacy: 103.24.xxx.xxx
  const parts = ip.split(".");
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.xxx.xxx`;
  }
  return ip;
}

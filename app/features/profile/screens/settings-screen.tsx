import { type Href, useRouter } from "@/lib/safe-router";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useEffect, useState } from "react";
import Constants from "expo-constants";
import { Linking, Pressable, Text, View } from "react-native";

import {
  ProfileSectionCard,
  ProfileSubScreenLayout,
} from "@/components/profile-sub-screen-layout";
import { SettingsMenuRow } from "@/components/settings-menu-row";
import {
  type SettingsPreferences,
  getSettingsPreferences,
  updateSettingsPreferences,
} from "@/features/auth/services/auth-api";
import { ListifyFonts } from "@/constants/typography";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import {
  hydratePushEnabledCache,
  setCachedPushEnabled,
} from "@/lib/notifications/push-preference";
import {
  unregisterFCMTokenFromServer,
  registerFCMTokenWithServer,
} from "@/lib/notifications/register-fcm-server";
import {
  deleteFCMToken,
  getFCMToken,
} from "@/lib/notifications/token-manager";
import { useProtectedNavigation } from "@/lib/use-protected-navigation";
import { useAppSelector } from "@/store/hooks";

const APP_VERSION = Constants.expoConfig?.version ?? "1.0.0";

export function SettingsScreen() {
  const router = useRouter();
  const user = useAppSelector((s) => s.auth.user);
  const isAuthenticated = useAppSelector((s) => s.auth.isAuthenticated);
  const { navigateProtected } = useProtectedNavigation();

  const [preferences, setPreferences] = useState<SettingsPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<keyof SettingsPreferences | null>(null);

  const loadPreferences = useCallback(async () => {
    setLoading(true);
    try {
      const response = await getSettingsPreferences();
      setPreferences(response.preferences);
      // Sync server preference into the local cache so the next app start
      // makes the right decision before any network round-trip.
      await setCachedPushEnabled(response.preferences.pushNotifications);
    } catch (error) {
      showErrorToast(
        "Settings",
        error instanceof Error ? error.message : "Failed to load settings.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  // Hydrate the in-memory cache once so the toggle reflects the persisted
  // value even while the server preference is being fetched.
  useEffect(() => {
    void hydratePushEnabledCache();
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadPreferences();
    }, [loadPreferences]),
  );

  /** Side-effects required to make the master push toggle actually stop FCM. */
  const applyPushPreference = useCallback(async (enabled: boolean) => {
    if (enabled) {
      // Best effort: request permission, mint a fresh token, register it.
      // If permission was denied at OS level this returns null and the user
      // will need to enable notifications in their OS settings — we surface
      // a soft hint without blocking the toggle state.
      const token = await getFCMToken({ promptPermission: true });
      if (token) {
        await registerFCMTokenWithServer(token);
      } else {
        showErrorToast(
          "Enable system notifications",
          "Allow notifications for Listifys in your device settings to receive pushes.",
        );
      }
      return;
    }

    // OFF: server-side delete first (guarantees no further pushes regardless
    // of client state), then invalidate the device token so even cached
    // server records can't reach this install.
    await unregisterFCMTokenFromServer();
    await deleteFCMToken();
  }, []);

  const updatePreference = useCallback(
    async <K extends keyof SettingsPreferences>(key: K, value: SettingsPreferences[K]) => {
      if (!preferences) return;

      const previous = preferences;
      const next = { ...previous, [key]: value };
      setPreferences(next);
      setSavingKey(key);

      if (key === "pushNotifications") {
        await setCachedPushEnabled(Boolean(value));
      }

      try {
        const response = await updateSettingsPreferences({ [key]: value });
        setPreferences(response.preferences);

        if (key === "pushNotifications") {
          await setCachedPushEnabled(response.preferences.pushNotifications);
          await applyPushPreference(response.preferences.pushNotifications);
          showSuccessToast(
            response.preferences.pushNotifications
              ? "Push notifications enabled"
              : "Push notifications turned off",
          );
        }
      } catch (error) {
        setPreferences(previous);
        if (key === "pushNotifications") {
          await setCachedPushEnabled(previous.pushNotifications);
        }
        showErrorToast(
          "Settings",
          error instanceof Error ? error.message : "Failed to update settings.",
        );
      } finally {
        setSavingKey(null);
      }
    },
    [applyPushPreference, preferences],
  );

  const push = (route: string) => router.push(route as Href);

  const pushProtected = (route: string, action: "profile" | "general" = "profile") => {
    navigateProtected(route as Href, action);
  };

  return (
    <ProfileSubScreenLayout title="Settings">
      <ProfileSectionCard title="Account">
        <SettingsMenuRow
          icon="person-outline"
          iconBg="rgba(39,187,151,0.12)"
          iconColor="#27BB97"
          label="Edit profile"
          type="navigate"
          onPress={() => pushProtected("/profile-details-edit")}
        />
        <SettingsMenuRow
          icon="lock-reset"
          iconBg="rgba(139,92,246,0.12)"
          iconColor="#8B5CF6"
          label={user?.hasPassword === false ? "Set password" : "Change password"}
          subtitle={
            user?.hasPassword === false
              ? "Add a password to your account"
              : "Update your login password"
          }
          type="navigate"
          onPress={() => pushProtected("/change-password")}
          showDivider
        />
        <SettingsMenuRow
          icon="lock-open"
          iconBg="rgba(244,63,156,0.12)"
          iconColor="#F43F9C"
          label="Forgot password"
          subtitle="Reset via email OTP"
          type="navigate"
          onPress={() => push("/forgot-password")}
          showDivider
        />
        <SettingsMenuRow
          icon="delete-forever"
          iconBg="rgba(239,68,68,0.12)"
          iconColor="#EF4444"
          label="Delete account"
          subtitle="Permanently remove your account and data"
          type="navigate"
          onPress={() => pushProtected("/delete-account")}
        />
      </ProfileSectionCard>

      <ProfileSectionCard title="Notifications">
        <SettingsMenuRow
          icon={preferences?.pushNotifications === false ? "notifications-off" : "notifications-active"}
          iconBg={
            preferences?.pushNotifications === false
              ? "rgba(148,163,184,0.18)"
              : "rgba(59,130,246,0.12)"
          }
          iconColor={preferences?.pushNotifications === false ? "#94A3B8" : "#3B82F6"}
          label="Push notifications"
          subtitle={
            preferences?.pushNotifications === false
              ? "Off — you won't receive any pushes"
              : "Orders, messages, and activity"
          }
          type="toggle"
          value={preferences?.pushNotifications ?? true}
          onToggle={(value) => void updatePreference("pushNotifications", value)}
          disabled={loading || savingKey === "pushNotifications"}
        />
      </ProfileSectionCard>

      <ProfileSectionCard title="Support">
        <SettingsMenuRow
          icon="help-outline"
          iconBg="#F3F4F6"
          iconColor="#6B7280"
          label="Help & support"
          type="navigate"
          onPress={() => Linking.openURL("mailto:support@listifys.com")}
        />
        <SettingsMenuRow
          icon="bug-report"
          iconBg="#F3F4F6"
          iconColor="#6B7280"
          label="Report a problem"
          type="navigate"
          onPress={() =>
            Linking.openURL("mailto:bugs@listifys.com?subject=Bug%20Report")
          }
          showDivider
        />
      </ProfileSectionCard>

      <ProfileSectionCard title="Legal">
        <SettingsMenuRow
          icon="info"
          iconBg="#F3F4F6"
          iconColor="#6B7280"
          label="About Listifys"
          type="navigate"
          onPress={() => push("/about-listify")}
        />
        <SettingsMenuRow
          icon="policy"
          iconBg="#F3F4F6"
          iconColor="#6B7280"
          label="Privacy policy"
          type="navigate"
          onPress={() => push("/privacy-policy")}
          showDivider
        />
        <SettingsMenuRow
          icon="description"
          iconBg="#F3F4F6"
          iconColor="#6B7280"
          label="Terms of service"
          type="navigate"
          onPress={() => push("/terms-of-service")}
        />
      </ProfileSectionCard>

      <ProfileSectionCard>
        <View className="flex-row items-center justify-between px-4 py-3.5">
          <View className="flex-row items-center gap-3">
            <View className="h-11 w-11 items-center justify-center rounded-2xl bg-[#F3F4F6]">
              <Text style={{ fontFamily: ListifyFonts.bold, color: "#9CA3AF" }}>v</Text>
            </View>
            <Text
              className="text-[16px] text-[#1A1A1A]"
              style={{ fontFamily: ListifyFonts.medium }}
            >
              App version
            </Text>
          </View>
          <Text
            className="rounded-lg bg-[#F6F7F8] px-2.5 py-1 text-[12px] text-[#6B7280]"
            style={{ fontFamily: ListifyFonts.semiBold }}
          >
            {APP_VERSION}
          </Text>
        </View>
      </ProfileSectionCard>

      <Pressable
        onPress={() => {
          if (isAuthenticated) {
            router.push("/logout-modal" as Href);
            return;
          }
          navigateProtected("/(tabs)/dashboard-home" as Href, "profile");
        }}
        className="mt-2 h-14 items-center justify-center rounded-2xl border border-red-100 bg-white"
        style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
      >
        <Text
          className="text-[16px] text-red-600"
          style={{ fontFamily: ListifyFonts.semiBold }}
        >
          {isAuthenticated ? "Sign out" : "Sign in"}
        </Text>
      </Pressable>
    </ProfileSubScreenLayout>
  );
}

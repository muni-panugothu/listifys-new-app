import AsyncStorage from "@react-native-async-storage/async-storage";
import { MaterialIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { type Href, useRouter } from "@/lib/safe-router";
import { useCallback, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";

import {
  ProfileSectionCard,
  ProfileSubScreenLayout,
} from "@/components/profile-sub-screen-layout";
import { SettingsMenuRow } from "@/components/settings-menu-row";
import {
  type SettingsPreferences,
  getSettingsPreferences,
  logoutAllDevices,
  updateSettingsPreferences,
} from "@/features/auth/services/auth-api";
import { ListifyFonts } from "@/constants/typography";
import { Image } from "@/lib/nativewind-interop";
import { showErrorToast } from "@/lib/toast";
import { useProtectedNavigation } from "@/lib/use-protected-navigation";
import { useTheme } from "@/providers/theme-provider";
import { useAppSelector } from "@/store/hooks";

const googleLogo =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuB0Fv9YujEQndmInZn8UL9wNaXlcju4h_W9rdQi1QXQrNa9Hb3lroDZzejdbsMYJPwiu5Vuo3yihw53J_F-SOC7-wpEImOfx-lMLszse1-wwlYy9vIz5b0UT7T9wD2TH1mSf_CUoC9SmbU_Qf_rQK4pJJ3V7f4VM1tc5Fp7zEe3OWIRbMDTRWsns7Yn2eeQ1zykKB6TQirm7ZMBsp-ZsiUknsCFkMe2Yhns06gIqY1_9m-yc3S1wNNjhMC98OnCxN90Dhs8-benkhc";
const BIOMETRIC_STORAGE_KEY = "@listify/biometric_login_enabled";

export function SecurityScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { navigateProtected } = useProtectedNavigation();
  const [preferences, setPreferences] = useState<SettingsPreferences | null>(null);
  const [biometric, setBiometric] = useState(true);
  const [savingKey, setSavingKey] = useState<"twoFactorAuth" | "biometric" | null>(null);
  const user = useAppSelector((s) => s.auth.user);

  const isGoogleLinked = user?.provider === "google";
  const hasEmail = user?.isVerified ?? false;
  const hasPhone = !!user?.phone;
  const phoneVerified = user?.phoneVerified ?? false;
  const maskedPhone = user?.phone
    ? `${String(user.phone).slice(0, 2)}******${String(user.phone).slice(-2)}`
    : "Not added";
  const hasPasswordSet = user?.hasPassword !== false;
  const twoFaEnabled = preferences?.twoFactorAuth ?? false;

  const loadSecurityPreferences = useCallback(async () => {
    try {
      const [preferencesResponse, biometricRaw] = await Promise.all([
        getSettingsPreferences(),
        AsyncStorage.getItem(BIOMETRIC_STORAGE_KEY),
      ]);
      setPreferences(preferencesResponse.preferences);
      if (biometricRaw !== null) {
        setBiometric(biometricRaw === "true");
      }
    } catch (error) {
      showErrorToast(
        "Security",
        error instanceof Error ? error.message : "Failed to load security settings.",
      );
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadSecurityPreferences();
    }, [loadSecurityPreferences]),
  );

  const updateTwoFactorPreference = async (nextValue: boolean) => {
    if (!preferences) return;
    const previous = preferences;
    setPreferences({ ...previous, twoFactorAuth: nextValue });
    setSavingKey("twoFactorAuth");
    try {
      const response = await updateSettingsPreferences({ twoFactorAuth: nextValue });
      setPreferences(response.preferences);
    } catch (error) {
      setPreferences(previous);
      showErrorToast(
        "Security",
        error instanceof Error ? error.message : "Failed to update two-factor authentication.",
      );
    } finally {
      setSavingKey(null);
    }
  };

  const updateBiometricPreference = async (nextValue: boolean) => {
    const previous = biometric;
    setBiometric(nextValue);
    setSavingKey("biometric");
    try {
      await AsyncStorage.setItem(BIOMETRIC_STORAGE_KEY, String(nextValue));
    } catch (error) {
      setBiometric(previous);
      showErrorToast(
        "Security",
        error instanceof Error ? error.message : "Failed to save biometric preference.",
      );
    } finally {
      setSavingKey(null);
    }
  };

  const handleSignOutAll = () => {
    Alert.alert("Sign out everywhere?", "You will be signed out from all devices.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out all",
        style: "destructive",
        onPress: async () => {
          try {
            await logoutAllDevices();
          } catch (e: unknown) {
            showErrorToast("Error", e instanceof Error ? e.message : "Failed");
          }
        },
      },
    ]);
  };

  const checklist = [
    {
      label: "Verified email",
      ok: hasEmail,
      status: hasEmail ? "Done" : "Verify",
    },
    {
      label: "Strong password",
      ok: hasPasswordSet,
      status: hasPasswordSet ? "Done" : "Set up",
    }
  ];

  return (
    <ProfileSubScreenLayout title="Security">
      <ProfileSectionCard title="Security checklist">
        {checklist.map((item, index) => (
          <View key={item.label}>
            <View className="flex-row items-center justify-between px-4 py-3.5">
              <View className="flex-row items-center gap-3">
                <MaterialIcons
                  name={item.ok ? "check-circle" : "info-outline"}
                  size={22}
                  color={item.ok ? "#27BB97" : "#F59E0B"}
                />
                <Text
                  className="text-[15px]"
                  style={{ fontFamily: ListifyFonts.medium, color: colors.textPrimary }}
                >
                  {item.label}
                </Text>
              </View>
              <Text
                className="text-[12px]"
                style={{
                  fontFamily: ListifyFonts.semiBold,
                  color: item.ok ? "#27BB97" : "#D97706",
                }}
              >
                {item.status}
              </Text>
            </View>
            {index < checklist.length - 1 ? (
              <View className="mx-4 h-px" style={{ backgroundColor: colors.border }} />
            ) : null}
          </View>
        ))}
      </ProfileSectionCard>

      <ProfileSectionCard title="Privacy & safety">
        <SettingsMenuRow
          icon="lock-reset"
          iconBg="rgba(39,187,151,0.12)"
          iconColor="#27BB97"
          label="Change password"
          subtitle={
            isGoogleLinked && !user?.hasPassword
              ? "Set up a password"
              : "Update your login credentials"
          }
          type="navigate"
          onPress={() => navigateProtected("/change-password" as Href, "profile")}
        />
      </ProfileSectionCard>

      <ProfileSectionCard title="Connected accounts">
        <View className="flex-row items-center justify-between px-4 py-3.5">
          <View className="flex-row items-center gap-3">
            <View
              className="h-10 w-10 items-center justify-center overflow-hidden rounded-full"
              style={{ backgroundColor: colors.surfaceMuted }}
            >
              <Image source={googleLogo} contentFit="contain" className="h-5 w-5" />
            </View>
            <Text
              className="text-[15px]"
              style={{ fontFamily: ListifyFonts.medium, color: colors.textPrimary }}
            >
              Google
            </Text>
          </View>
          <Text
            className="text-[12px]"
            style={{
              fontFamily: ListifyFonts.semiBold,
              color: isGoogleLinked ? "#27BB97" : colors.textTertiary,
            }}
          >
            {isGoogleLinked ? "Linked" : "Not linked"}
          </Text>
        </View>
      </ProfileSectionCard>
    </ProfileSubScreenLayout>
  );
}

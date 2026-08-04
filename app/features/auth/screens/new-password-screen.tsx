import { MaterialIcons } from "@expo/vector-icons";
import { type Href, useRouter } from "@/lib/safe-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AuthUI } from "@/constants/auth-ui";
import { SUPPORT_EMAIL } from "@/constants/legal-content";
import { ListifyFonts } from "@/constants/typography";
import { AuthField } from "@/features/auth/components/auth-field";
import { AuthPrimaryButton } from "@/features/auth/components/auth-primary-button";
import { validatePassword } from "@/lib/auth-validation";
import { showErrorToast } from "@/lib/toast";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { clearError, clearResetFlow, resetPassword } from "@/store/slices/auth-slice";

function getPasswordRequirements(password: string) {
  return [
    { id: "length", label: "At least 8 characters", met: password.length >= 8 },
    { id: "upper", label: "At least 1 uppercase letter", met: /[A-Z]/.test(password) },
    { id: "lower", label: "At least 1 lowercase letter", met: /[a-z]/.test(password) },
    { id: "number", label: "At least 1 number", met: /\d/.test(password) },
    {
      id: "special",
      label: "At least 1 special character (!@#$...)",
      met: /[!@#$%^&*()_+\-=[\]{}|;:,.<>?]/.test(password),
    },
  ];
}

/** Set new password — same AuthUI system as Sign In / Sign Up (no teal hero / logo header). */
export function NewPasswordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const { status, error, resetToken, resetEmail } = useAppSelector((s) => s.auth);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const contentPaddingBottom = useMemo(
    () => Math.max(insets.bottom + 24, 24),
    [insets.bottom],
  );
  const requirements = getPasswordRequirements(password);
  const passwordsMatch =
    password.length > 0 && confirmPassword.length > 0 && password === confirmPassword;
  const canReset = requirements.every((r) => r.met) && passwordsMatch;
  const isLoading = status === "loading";

  useEffect(() => {
    if (!error) return;
    showErrorToast("Reset Failed", error);
    dispatch(clearError());
  }, [dispatch, error]);

  const handleResetPassword = async () => {
    if (!resetToken || !resetEmail) {
      showErrorToast("Error", "Session expired. Please start over.");
      router.replace("/forgot-password" as Href);
      return;
    }
    if (!password || !confirmPassword) {
      showErrorToast("Required", "Please fill in both password fields.");
      return;
    }
    const passwordError = validatePassword(password);
    if (passwordError) {
      showErrorToast("Weak Password", passwordError);
      return;
    }
    if (password !== confirmPassword) {
      showErrorToast("Mismatch", "New password and confirm password do not match.");
      return;
    }

    const action = await dispatch(
      resetPassword({
        resetToken,
        password,
        email: resetEmail,
        confirmPassword,
      }),
    );
    if (action.meta.requestStatus === "fulfilled") {
      dispatch(clearResetFlow());
      setTimeout(() => {
        router.replace("/sign-in" as Href);
      }, 700);
    }
  };

  return (
    <View className="flex-1" style={{ backgroundColor: AuthUI.bg }}>
      <StatusBar style="dark" />

      <View
        className="absolute inset-x-0 z-20 flex-row justify-start px-4"
        style={{ top: insets.top + 8, height: 56 }}
      >
        <Pressable
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace("/forgot-password" as Href);
          }}
          hitSlop={8}
          style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
          className="h-10 w-10 items-center justify-center"
        >
          <MaterialIcons name="arrow-back" size={24} color={AuthUI.text} />
        </Pressable>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <ScrollView
          bounces={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingTop: insets.top + 48,
            paddingBottom: contentPaddingBottom,
            paddingHorizontal: 24,
            flexGrow: 1,
            justifyContent: "center",
          }}
        >
          <View className="w-full self-center" style={{ maxWidth: AuthUI.maxWidth }}>
            <Text
              className="text-center text-[28px] text-[#111111]"
              style={{ fontFamily: ListifyFonts.bold }}
            >
              Set New Password
            </Text>
            <Text
              className="mb-8 mt-2 px-2 text-center text-[14px] leading-5"
              style={{ fontFamily: ListifyFonts.regular, color: AuthUI.subtitle }}
            >
              Create a strong password for your account
            </Text>

            <AuthField
              label="New Password"
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              isPassword
              showPassword={showPassword}
              onTogglePassword={() => setShowPassword((v) => !v)}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="new-password"
            />

            <AuthField
              label="Confirm New Password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="••••••••"
              isPassword
              showPassword={showConfirm}
              onTogglePassword={() => setShowConfirm((v) => !v)}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="new-password"
            />

            {confirmPassword.length > 0 ? (
              <Text
                className="-mt-2 mb-4 text-[13px]"
                style={{
                  fontFamily: ListifyFonts.medium,
                  color: passwordsMatch ? AuthUI.primary : AuthUI.error,
                }}
              >
                {passwordsMatch ? "Passwords match" : "Passwords do not match"}
              </Text>
            ) : null}

            <View
              className="mb-6 w-full px-4 py-4"
              style={{
                backgroundColor: AuthUI.inputBg,
                borderRadius: AuthUI.inputRadius,
              }}
            >
              <Text
                className="mb-3 text-[12px]"
                style={{ fontFamily: ListifyFonts.medium, color: AuthUI.muted }}
              >
                Security Requirements
              </Text>
              <View className="gap-3">
                {requirements.map((requirement) => (
                  <View key={requirement.id} className="flex-row items-center gap-3">
                    <View
                      className="h-5 w-5 items-center justify-center rounded-full"
                      style={{
                        backgroundColor: requirement.met
                          ? "rgba(60,81,80,0.12)"
                          : "#E8E8E8",
                      }}
                    >
                      <MaterialIcons
                        name={requirement.met ? "check" : "radio-button-unchecked"}
                        size={14}
                        color={requirement.met ? AuthUI.primary : AuthUI.muted}
                      />
                    </View>
                    <Text
                      className="flex-1 text-[14px]"
                      style={{
                        fontFamily: ListifyFonts.regular,
                        color: requirement.met ? AuthUI.text : AuthUI.subtitle,
                      }}
                    >
                      {requirement.label}
                    </Text>
                  </View>
                ))}
              </View>
            </View>

            <AuthPrimaryButton
              label="Reset Password"
              onPress={handleResetPassword}
              loading={isLoading}
              disabled={!canReset}
            />

            <Text
              className="mt-8 text-center text-[14px]"
              style={{ fontFamily: ListifyFonts.regular, color: AuthUI.subtitle }}
            >
              Need help?{" "}
              <Text
                style={{
                  fontFamily: ListifyFonts.semiBold,
                  color: AuthUI.link,
                }}
                onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
              >
                Contact Support
              </Text>
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

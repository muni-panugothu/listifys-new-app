import { MaterialIcons } from "@expo/vector-icons";
import { type Href, useRouter } from "@/lib/safe-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AuthUI } from "@/constants/auth-ui";
import { ListifyFonts } from "@/constants/typography";
import { AuthField } from "@/features/auth/components/auth-field";
import { AuthPrimaryButton } from "@/features/auth/components/auth-primary-button";
import { showErrorToast } from "@/lib/toast";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { clearError, clearResetFlow, forgotPassword } from "@/store/slices/auth-slice";

/** Forgot password — same AuthUI system as Sign In / Sign Up. */
export function ForgotPasswordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const { status, error } = useAppSelector((s) => s.auth);
  const [identity, setIdentity] = useState("");
  const [isSending, setIsSending] = useState(false);
  const sendingRef = useRef(false);

  const contentPaddingBottom = useMemo(
    () => Math.max(insets.bottom + 24, 24),
    [insets.bottom],
  );
  const isLoading = status === "loading" || isSending;

  useEffect(() => {
    dispatch(clearResetFlow());
  }, [dispatch]);

  useEffect(() => {
    if (!error) return;
    showErrorToast("Error", error);
    dispatch(clearError());
    sendingRef.current = false;
    setIsSending(false);
  }, [dispatch, error]);

  const handleSendCode = async () => {
    if (sendingRef.current) return;

    const trimmed = identity.trim();
    if (!trimmed) {
      showErrorToast("Required", "Please enter your email.");
      return;
    }

    sendingRef.current = true;
    setIsSending(true);
    const result = await dispatch(forgotPassword({ email: trimmed.toLowerCase() }));
    if (forgotPassword.fulfilled.match(result)) {
      router.replace("/reset-otp-verification" as Href);
      return;
    }
    sendingRef.current = false;
    setIsSending(false);
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
            else router.replace("/sign-in" as Href);
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
              Forgot Password?
            </Text>
            <Text
              className="mb-8 mt-2 px-2 text-center text-[14px] leading-5"
              style={{ fontFamily: ListifyFonts.regular, color: AuthUI.subtitle }}
            >
              Enter your registered email to receive a reset code
            </Text>

            <AuthField
              label="Email"
              value={identity}
              onChangeText={setIdentity}
              placeholder="example@gmail.com"
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />

            <AuthPrimaryButton
              label="Send Code"
              onPress={handleSendCode}
              loading={isLoading}
            />

            <Text
              className="mt-8 text-center text-[14px]"
              style={{ fontFamily: ListifyFonts.regular, color: AuthUI.subtitle }}
            >
              Remember your password?{" "}
              <Text
                style={{
                  fontFamily: ListifyFonts.semiBold,
                  color: AuthUI.text,
                  textDecorationLine: "underline",
                }}
                onPress={() => router.push("/sign-in" as Href)}
              >
                Sign In
              </Text>
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

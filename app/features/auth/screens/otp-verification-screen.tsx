import { MaterialIcons } from "@expo/vector-icons";
import { type Href, useRouter } from "@/lib/safe-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAvoidingView } from "react-native";

import { AuthUI } from "@/constants/auth-ui";
import { ListifyFonts } from "@/constants/typography";
import { AuthPrimaryButton } from "@/features/auth/components/auth-primary-button";
import { showErrorToast } from "@/lib/toast";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  clearRegistrationEmail,
  resetAuthStatus,
  resendOtp,
  sendPhoneOtp,
  verifyOtp,
  verifyPhoneOtp,
} from "@/store/slices/auth-slice";

const OTP_LENGTH = 6;
const INITIAL_TIMER = 59;

function normalizeOtp(value: string) {
  return value.replace(/\D/g, "").slice(0, OTP_LENGTH);
}

export function OtpVerificationScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const { status, isAuthenticated, registrationEmail, registrationPhone } =
    useAppSelector((s) => s.auth);

  const [otp, setOtp] = useState("");
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState(INITIAL_TIMER);
  const inputRef = useRef<TextInput>(null);

  const headerHeight = useMemo(() => insets.top + 52, [insets.top]);
  const isLoading = status === "loading";
  const timerLabel = `00:${String(secondsRemaining).padStart(2, "0")}`;
  const canResend = secondsRemaining === 0;
  const isVerifyEnabled = otp.length === OTP_LENGTH;

  const otpSlots = useMemo(() => {
    const chars = otp.split("");
    return Array.from({ length: OTP_LENGTH }, (_, index) => chars[index] ?? "");
  }, [otp]);

  const contactSubtitle = useMemo(() => {
    if (registrationPhone) {
      const digits = registrationPhone.replace(/\D/g, "");
      if (digits.length >= 10) {
        return `+${digits.slice(0, 1)} ${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
      }
      return registrationPhone;
    }
    return registrationEmail ?? "your email";
  }, [registrationEmail, registrationPhone]);

  useEffect(() => {
    dispatch(resetAuthStatus());
  }, [dispatch]);

  useEffect(() => {
    if (isAuthenticated) {
      router.replace("/(tabs)/home-feed-root" as Href);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  useEffect(() => {
    const focusTimer = setTimeout(() => inputRef.current?.focus(), 400);
    return () => clearTimeout(focusTimer);
  }, []);

  useEffect(() => {
    if (secondsRemaining === 0) return;
    const timer = setTimeout(() => {
      setSecondsRemaining((current) => current - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [secondsRemaining]);

  const handleOtpChange = (value: string) => {
    setVerificationError(null);
    setOtp(normalizeOtp(value));
  };

  const handleVerify = async () => {
    if (!registrationEmail && !registrationPhone) {
      showErrorToast("Error", "Registration session expired. Please start over.");
      router.replace("/sign-up" as Href);
      return;
    }

    if (!isVerifyEnabled) {
      setVerificationError("Please enter the full 6-digit code.");
      return;
    }

    setVerificationError(null);

    try {
      if (registrationPhone) {
        await dispatch(verifyPhoneOtp({ phone: registrationPhone, otp })).unwrap();
      } else {
        await dispatch(
          verifyOtp({ email: registrationEmail as string, otp }),
        ).unwrap();
      }
    } catch (message) {
      const errorText =
        typeof message === "string" && message.trim().length > 0
          ? message
          : "Invalid verification code. Please try again.";
      setVerificationError(errorText);
      setOtp("");
      inputRef.current?.focus();
      dispatch(resetAuthStatus());
    }
  };

  const handleResend = async () => {
    if (!canResend) return;

    setVerificationError(null);
    setOtp("");

    try {
      if (registrationPhone) {
        await dispatch(sendPhoneOtp({ phone: registrationPhone })).unwrap();
      } else if (registrationEmail) {
        await dispatch(resendOtp({ email: registrationEmail })).unwrap();
      } else {
        return;
      }
      setSecondsRemaining(INITIAL_TIMER);
      inputRef.current?.focus();
    } catch (message) {
      const errorText =
        typeof message === "string" && message.trim().length > 0
          ? message
          : "Could not resend code. Please try again.";
      setVerificationError(errorText);
      dispatch(resetAuthStatus());
    }
  };

  return (
    <View className="flex-1" style={{ backgroundColor: AuthUI.bg }}>
      <StatusBar style="dark" />

      <View
        className="flex-row items-center px-4"
        style={{ paddingTop: insets.top + 8, height: headerHeight }}
      >
        <Pressable
          onPress={() => {
            dispatch(clearRegistrationEmail());
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace("/sign-up" as Href);
            }
          }}
          style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
          className="h-10 w-10 items-center justify-center"
        >
          <MaterialIcons name="arrow-back" size={24} color={AuthUI.text} />
        </Pressable>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
        keyboardVerticalOffset={headerHeight}
      >
        <ScrollView
          bounces={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingHorizontal: 24,
            paddingTop: 24,
            paddingBottom: 24,
            flexGrow: 1,
          }}
        >
          <View className="w-full self-center" style={{ maxWidth: AuthUI.maxWidth }}>
            <Text
              className="text-center text-[28px] text-[#111111]"
              style={{ fontFamily: ListifyFonts.bold }}
            >
              Verify Code
            </Text>
            <Text
              className="mt-3 text-center text-[14px] leading-5"
              style={{ fontFamily: ListifyFonts.regular, color: AuthUI.subtitle }}
            >
              Please enter the code we just sent to email{" "}
              <Text style={{ color: AuthUI.text, fontFamily: ListifyFonts.medium }}>
                {contactSubtitle}
              </Text>
            </Text>

            <Pressable
              onPress={() => inputRef.current?.focus()}
              className="relative mb-6 mt-10 w-full flex-row justify-center gap-2.5"
            >
              {otpSlots.map((digit, index) => (
                <View key={index} style={styles.otpBox}>
                  <Text style={styles.otpBoxText}>{digit || "–"}</Text>
                </View>
              ))}
              <TextInput
                ref={inputRef}
                value={otp}
                onChangeText={handleOtpChange}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete={Platform.OS === "android" ? "sms-otp" : "one-time-code"}
                maxLength={OTP_LENGTH}
                caretHidden
                style={styles.hiddenInput}
              />
            </Pressable>

            {verificationError ? (
              <Text
                className="mb-3 text-center text-[13px]"
                style={{ color: AuthUI.error, fontFamily: ListifyFonts.medium }}
              >
                {verificationError}
              </Text>
            ) : null}

            <View className="items-center">
              {canResend ? (
                <Pressable onPress={handleResend} hitSlop={8} disabled={isLoading}>
                  <Text
                    className="text-center text-[14px]"
                    style={{ color: AuthUI.subtitle, fontFamily: ListifyFonts.regular }}
                  >
                    Didn&apos;t receive OTP?{" "}
                    <Text
                      style={{
                        color: AuthUI.text,
                        fontFamily: ListifyFonts.semiBold,
                        textDecorationLine: "underline",
                      }}
                    >
                      Resend code
                    </Text>
                  </Text>
                </Pressable>
              ) : (
                <Text
                  className="text-center text-[14px]"
                  style={{ color: AuthUI.subtitle, fontFamily: ListifyFonts.regular }}
                >
                  Didn&apos;t receive OTP? Resend in{" "}
                  <Text style={{ color: AuthUI.text, fontFamily: ListifyFonts.semiBold }}>
                    {timerLabel}
                  </Text>
                </Text>
              )}
            </View>

            <View className="mt-16">
              {isLoading ? (
                <View
                  style={{
                    minHeight: 52,
                    borderRadius: AuthUI.buttonRadius,
                    backgroundColor: AuthUI.primary,
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: 0.7,
                  }}
                >
                  <ActivityIndicator color="#FFFFFF" />
                </View>
              ) : (
                <AuthPrimaryButton
                  label="Verify"
                  onPress={handleVerify}
                  disabled={!isVerifyEnabled}
                />
              )}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  otpBox: {
    width: 48,
    height: 52,
    borderRadius: 10,
    backgroundColor: AuthUI.inputBg,
    alignItems: "center",
    justifyContent: "center",
  },
  otpBoxText: {
    fontSize: 22,
    fontWeight: "600",
    color: AuthUI.text,
  },
  hiddenInput: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    opacity: 0.02,
    color: "transparent",
    fontSize: 16,
  },
});

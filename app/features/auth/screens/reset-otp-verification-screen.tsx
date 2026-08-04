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
import { resendForgotPasswordOtp } from "@/features/auth/services/auth-api";
import { showErrorToast } from "@/lib/toast";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { clearError, verifyResetOtp } from "@/store/slices/auth-slice";

const RESET_OTP_LENGTH = 6;
const INITIAL_TIMER = 59;

export function ResetOtpVerificationScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const { status, error, resetEmail, resetToken, resetDevOtp } = useAppSelector((s) => s.auth);
  const [otpDigits, setOtpDigits] = useState<string[]>(
    Array(RESET_OTP_LENGTH).fill(""),
  );
  const [secondsRemaining, setSecondsRemaining] = useState(INITIAL_TIMER);
  const [isVerifying, setIsVerifying] = useState(false);
  const inputRefs = useRef<Array<TextInput | null>>([]);
  const navigatedToNewPassword = useRef(false);
  const verifyInFlight = useRef(false);

  const headerHeight = useMemo(() => insets.top + 52, [insets.top]);
  const timerLabel = `00:${String(secondsRemaining).padStart(2, "0")}`;
  const isLoading = status === "loading" || isVerifying;
  const otp = otpDigits.join("");
  const isVerifyEnabled = otp.length === RESET_OTP_LENGTH;

  useEffect(() => {
    if (!resetDevOtp || resetDevOtp.length !== RESET_OTP_LENGTH) return;
    setOtpDigits(resetDevOtp.split(""));
  }, [resetDevOtp]);

  useEffect(() => {
    if (!resetToken || navigatedToNewPassword.current) return;
    navigatedToNewPassword.current = true;
    verifyInFlight.current = false;
    setIsVerifying(false);
    router.replace("/new-password" as Href);
  }, [resetToken, router]);

  useEffect(() => {
    // First concurrent verify may succeed; later ones fail with "session expired".
    // Ignore those errors once we already have a reset token / are navigating.
    if (!error) return;
    if (resetToken || navigatedToNewPassword.current) {
      dispatch(clearError());
      return;
    }
    showErrorToast("Verification Failed", error);
    verifyInFlight.current = false;
    setIsVerifying(false);
    dispatch(clearError());
  }, [dispatch, error, resetToken]);

  useEffect(() => {
    if (secondsRemaining === 0) return;
    const timer = setTimeout(() => {
      setSecondsRemaining((current) => current - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [secondsRemaining]);

  const handleDigitChange = (value: string, index: number) => {
    const nextCharacter = value.replace(/\D/g, "").slice(-1);

    setOtpDigits((current) => {
      const nextDigits = [...current];
      nextDigits[index] = nextCharacter;
      return nextDigits;
    });

    if (nextCharacter && index < RESET_OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (key: string, index: number) => {
    if (key === "Backspace" && !otpDigits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleResend = () => {
    if (!resetEmail || verifyInFlight.current) return;
    void resendForgotPasswordOtp(resetEmail)
      .then((res) => {
        if (res.devOtp && res.devOtp.length === RESET_OTP_LENGTH) {
          setOtpDigits(res.devOtp.split(""));
        } else {
          setOtpDigits(Array(RESET_OTP_LENGTH).fill(""));
        }
        setSecondsRemaining(INITIAL_TIMER);
        inputRefs.current[0]?.focus();
      })
      .catch(() => {
        showErrorToast("Error", "Could not resend code. Please try again.");
      });
  };

  const handleVerify = () => {
    if (verifyInFlight.current || navigatedToNewPassword.current || resetToken) {
      return;
    }
    if (!resetEmail) {
      showErrorToast("Error", "Reset session expired. Please try again.");
      router.replace("/forgot-password" as Href);
      return;
    }
    if (!isVerifyEnabled) {
      showErrorToast("Invalid OTP", "Please enter the full 6-digit OTP.");
      return;
    }

    verifyInFlight.current = true;
    setIsVerifying(true);
    void dispatch(verifyResetOtp({ email: resetEmail, otp }))
      .unwrap()
      .then(() => {
        // Navigation is handled by the resetToken effect.
      })
      .catch(() => {
        if (!navigatedToNewPassword.current) {
          verifyInFlight.current = false;
          setIsVerifying(false);
        }
      });
  };

  return (
    <View className="flex-1" style={{ backgroundColor: AuthUI.bg }}>
      <StatusBar style="dark" />

      <View
        className="flex-row items-center px-4"
        style={{ paddingTop: insets.top + 8, height: headerHeight }}
      >
        <Pressable
          onPress={() => router.back()}
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
            paddingHorizontal: 24,
            paddingTop: 24,
            paddingBottom: Math.max(insets.bottom + 16, 24),
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
                {resetEmail ?? "your email"}
              </Text>
            </Text>

            {resetDevOtp ? (
              <Text
                className="mt-3 text-center text-[13px]"
                style={{ color: "#B45309", fontFamily: ListifyFonts.medium }}
              >
                Dev mode: your code is {resetDevOtp}
              </Text>
            ) : null}

            <View className="mb-6 mt-10 w-full flex-row justify-center gap-2.5">
              {otpDigits.map((digit, index) => (
                <TextInput
                  key={index}
                  ref={(ref) => {
                    inputRefs.current[index] = ref;
                  }}
                  value={digit}
                  onChangeText={(value) => handleDigitChange(value, index)}
                  onKeyPress={({ nativeEvent }) => {
                    handleKeyPress(nativeEvent.key, index);
                  }}
                  keyboardType="number-pad"
                  maxLength={1}
                  placeholder="–"
                  placeholderTextColor={AuthUI.muted}
                  style={styles.otpInput}
                />
              ))}
            </View>

            <View className="items-center">
              {secondsRemaining === 0 ? (
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
  otpInput: {
    width: 48,
    height: 52,
    borderRadius: 10,
    backgroundColor: AuthUI.inputBg,
    textAlign: "center",
    fontSize: 22,
    fontWeight: "600",
    color: AuthUI.text,
  },
});

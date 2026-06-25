import { MaterialIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { type Href, useRouter } from "@/lib/safe-router";
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

import { resendForgotPasswordOtp } from "@/features/auth/services/auth-api";
import { showErrorToast } from "@/lib/toast";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { clearError, resendResetOtp, verifyResetOtp } from "@/store/slices/auth-slice";

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
  const inputRefs = useRef<Array<TextInput | null>>([]);

  const headerHeight = useMemo(() => insets.top + 64, [insets.top]);
  const timerLabel = `00:${String(secondsRemaining).padStart(2, "0")}`;
  const isLoading = status === "loading";

  useEffect(() => {
    if (!resetDevOtp || resetDevOtp.length !== RESET_OTP_LENGTH) return;
    setOtpDigits(resetDevOtp.split(""));
  }, [resetDevOtp]);

  useEffect(() => {
    if (resetToken) {
      router.push("/new-password" as Href);
    }
  }, [resetToken, router]);

  useEffect(() => {
    if (error) {
      showErrorToast("Verification Failed", error);
      dispatch(clearError());
    }
  }, [dispatch, error]);

  useEffect(() => {
    if (secondsRemaining === 0) {
      return;
    }

    const timer = setTimeout(() => {
      setSecondsRemaining((current) => current - 1);
    }, 1000);

    return () => {
      clearTimeout(timer);
    };
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
    if (!resetEmail) return;
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
    if (!resetEmail) {
      showErrorToast("Error", "Reset session expired. Please try again.");
      router.replace("/forgot-password" as Href);
      return;
    }
    const otp = otpDigits.join("");
    if (otp.length !== RESET_OTP_LENGTH) {
      showErrorToast("Invalid OTP", "Please enter the full 6-digit OTP.");
      return;
    }
    dispatch(verifyResetOtp({ email: resetEmail, otp }));
  };

  return (
    <View className="flex-1 bg-[#F6F7F8]">
      <View className="absolute inset-0 overflow-hidden">
        <View className="absolute right-0 top-0 h-64 w-64 rounded-full bg-[#27BB97]/5 blur-[100px]" />
        <View className="absolute bottom-0 left-0 h-96 w-96 rounded-full bg-[#5BA2FF]/5 blur-[120px]" />
      </View>

      <View
        className="z-50 flex-row items-center justify-between bg-white/80 px-4"
        style={{ paddingTop: insets.top, height: headerHeight }}
      >
        <Pressable
          onPress={() => {
            router.back();
          }}
          style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
          className="h-10 w-10 items-center justify-center rounded-full"
        >
          <MaterialIcons name="arrow-back" size={24} color="#161D1A" />
        </Pressable>

        <Text className="text-xl font-black tracking-tight text-[#27BB97]">
            Listifys
        </Text>

        <View className="h-10 w-10" />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <ScrollView
          bounces={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 24,
            paddingBottom: Math.max(insets.bottom + 16, 24),
            flexGrow: 1,
          }}
        >
          <View className="mx-auto flex-1 w-full max-w-md items-center justify-center">
            <View className="mb-6 relative">
              <View className="h-24 w-24 items-center justify-center rounded-full bg-[#27BB97]/10">
                <MaterialIcons name="lock-reset" size={48} color="#006B55" />
              </View>
              <View className="absolute -right-2 -top-2 h-12 w-12 rounded-full bg-[#5BA2FF]/20 blur-xl" />
              <View className="absolute -bottom-4 -left-4 h-16 w-16 rounded-full bg-[#27BB97]/20 blur-xl" />
            </View>

            <View className="mb-6 items-center gap-2">
              <Text className="text-center text-[24px] font-bold tracking-[-0.48px] text-[#161D1A]">
                Password Reset Code
              </Text>
              <Text className="max-w-70 text-center text-[14px] leading-5 text-[#3C4A44]">
                A 6-digit code has been sent to your email
              </Text>
              {resetDevOtp ? (
                <Text className="mt-2 text-center text-[13px] text-amber-800">
                  Dev mode: email could not be delivered. Your code is {resetDevOtp}
                </Text>
              ) : null}
            </View>

            <View className="w-full gap-6">
              <View className="w-full flex-row justify-between gap-2">
                {otpDigits.map((digit, index) => (
                  <TextInput
                    key={index}
                    ref={(ref) => {
                      inputRefs.current[index] = ref;
                    }}
                    value={digit}
                    onChangeText={(value) => {
                      handleDigitChange(value, index);
                    }}
                    onKeyPress={({ nativeEvent }) => {
                      handleKeyPress(nativeEvent.key, index);
                    }}
                    keyboardType="number-pad"
                    maxLength={1}
                    placeholder="-"
                    placeholderTextColor="#6C7A74"
                    style={styles.otpInput}
                  />
                ))}
              </View>

              <Pressable
                onPress={handleVerify}
                disabled={isLoading}
                style={({ pressed }) => [
                  { transform: [{ scale: pressed ? 0.98 : 1 }] },
                  { opacity: isLoading ? 0.7 : 1 },
                ]}
                className="overflow-hidden rounded-lg"
              >
                <LinearGradient
                  colors={["#27BB97", "#1E9E7E"]}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  className="h-12 flex-row items-center justify-center gap-2 rounded-lg"
                  style={{
                    shadowColor: "rgba(39,187,151,0.2)",
                    shadowOffset: { width: 0, height: 8 },
                    shadowOpacity: 1,
                    shadowRadius: 18,
                    elevation: 6,
                  }}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text className="text-[18px] font-semibold text-white">
                      Verify & Reset
                    </Text>
                  )}
                </LinearGradient>
              </Pressable>
            </View>

            <View className="mt-6 items-center gap-4">
              {secondsRemaining === 0 ? (
                <Pressable onPress={handleResend} hitSlop={8} disabled={isLoading}>
                  <Text className="text-center text-[14px] text-[#3C4A44]">
                    Didn&apos;t receive the code?{" "}
                    <Text className="font-semibold text-[#006B55]">Resend</Text>
                  </Text>
                </Pressable>
              ) : (
                <Text className="text-center text-[14px] text-[#3C4A44]">
                  Resend code in{" "}
                  <Text className="font-semibold text-[#161D1A]">{timerLabel}</Text>
                </Text>
              )}

              <View className="flex-row items-center justify-center gap-2 opacity-60">
                <MaterialIcons name="verified-user" size={16} color="#3C4A44" />
                <Text className="text-[12px] font-medium uppercase tracking-[2px] text-[#3C4A44]">
                  Secure Verification
                </Text>
              </View>
            </View>
          </View>

          <View className="mt-auto pt-6">
            <View className="flex-row items-start gap-4 rounded-xl border border-white/20 bg-white/40 p-4">
              <View className="rounded-lg bg-[#006B55]/10 p-2">
                <MaterialIcons name="info-outline" size={20} color="#006B55" />
              </View>

              <View className="flex-1">
                <Text className="mb-1 text-[12px] font-bold tracking-[0.24px] text-[#161D1A]">
                  Check your Spam
                </Text>
                <Text className="text-[13px] leading-5 text-[#3C4A44]">
                  If you don&apos;t see the email in your inbox, please check
                  your junk or spam folder.
                </Text>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  otpInput: {
    width: 44,
    aspectRatio: 1,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#BBCAC3",
    backgroundColor: "#FFFFFF",
    textAlign: "center",
    fontSize: 20,
    fontWeight: "600",
    color: "#161D1A",
  },
});

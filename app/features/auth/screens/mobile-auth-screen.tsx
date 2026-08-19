import { type Href, useRouter } from "@/lib/safe-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PhoneInputWithCountry } from "@/components/phone-input-with-country";
import { AuthUI } from "@/constants/auth-ui";
import { ListifyFonts } from "@/constants/typography";
import { AuthPrimaryButton } from "@/features/auth/components/auth-primary-button";
import { useLocale } from "@/providers/locale-provider";
import { connectivityService } from "@/lib/connectivity-service";
import { navigateAfterAuthentication } from "@/lib/auth-navigation";
import { showErrorToast } from "@/lib/toast";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { clearError, sendPhoneOtp, verifyPhoneOtp } from "@/store/slices/auth-slice";

const OTP_LENGTH = 6;
const INITIAL_RESEND_SECONDS = 30;

export function MobileAuthScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const { phoneCode: localePhoneCode, isoCountryCode: localeIso } = useLocale();
  const { status, error, isAuthenticated, sessionHydrated } = useAppSelector((s) => s.auth);
  const [phoneCode, setPhoneCode] = useState(localePhoneCode);
  const [isoCode, setIsoCode] = useState(localeIso);
  const [phoneDigits, setPhoneDigits] = useState("");
  const e164Phone = `${phoneCode}${phoneDigits.replace(/\D/g, "")}`;

  const [requestedPhone, setRequestedPhone] = useState<string | null>(null);
  const [otpDigits, setOtpDigits] = useState<string[]>(
    Array(OTP_LENGTH).fill(""),
  );
  const [secondsRemaining, setSecondsRemaining] = useState(INITIAL_RESEND_SECONDS);
  const inputRefs = useRef<Array<TextInput | null>>([]);

  const contentPaddingBottom = useMemo(
    () => Math.max(insets.bottom + 24, 24),
    [insets.bottom],
  );
  const isLoading = status === "loading";
  const isOtpStep = requestedPhone != null;
  const isVerifyEnabled = otpDigits.every((digit) => digit.length === 1);

  useEffect(() => {
    if (!sessionHydrated || !isAuthenticated) return;
    void navigateAfterAuthentication(router, { source: "mobile-auth.already_authenticated" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionHydrated, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || status !== "succeeded") return;
    void navigateAfterAuthentication(router, { source: "mobile-auth.verify_success" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, status]);

  useEffect(() => {
    if (error) {
      showErrorToast("Mobile Verification", error);
      if (/unable to reach|no internet|temporarily unavailable|timed out/i.test(error)) {
        connectivityService.recheck();
      }
      dispatch(clearError());
    }
  }, [error, dispatch]);

  useEffect(() => {
    if (!isOtpStep || secondsRemaining <= 0) {
      return;
    }

    const timer = setTimeout(() => {
      setSecondsRemaining((current) => current - 1);
    }, 1000);

    return () => {
      clearTimeout(timer);
    };
  }, [isOtpStep, secondsRemaining]);

  useEffect(() => {
    if (!requestedPhone && !phoneDigits) {
      setPhoneCode(localePhoneCode);
      setIsoCode(localeIso);
    }
  }, [localeIso, localePhoneCode, phoneDigits, requestedPhone]);

  const handleSendOtp = async () => {
    if (!/^\+[1-9]\d{6,14}$/.test(e164Phone)) {
      showErrorToast("Invalid Phone", "Please enter a valid phone number with country code.");
      return;
    }

    const phone = e164Phone;

    try {
      await dispatch(sendPhoneOtp({ phone, channel: "sms" })).unwrap();
      setRequestedPhone(phone);
      setOtpDigits(Array(OTP_LENGTH).fill(""));
      setSecondsRemaining(INITIAL_RESEND_SECONDS);
      setTimeout(() => {
        inputRefs.current[0]?.focus();
      }, 100);
    } catch {
      // Error is shown via auth slice error state.
    }
  };

  const handleResendOtp = async () => {
    if (!requestedPhone || secondsRemaining > 0) {
      return;
    }

    try {
      await dispatch(sendPhoneOtp({ phone: requestedPhone, channel: "sms" })).unwrap();
      setOtpDigits(Array(OTP_LENGTH).fill(""));
      setSecondsRemaining(INITIAL_RESEND_SECONDS);
      setTimeout(() => {
        inputRefs.current[0]?.focus();
      }, 100);
    } catch {
      // Error is shown via auth slice error state.
    }
  };

  const handleVerifyOtp = () => {
    if (!requestedPhone) {
      showErrorToast("Session Expired", "Please request OTP again.");
      setOtpDigits(Array(OTP_LENGTH).fill(""));
      return;
    }

    if (!isVerifyEnabled) {
      showErrorToast("Invalid OTP", "Please enter the 6-digit OTP.");
      return;
    }

    dispatch(verifyPhoneOtp({ phone: requestedPhone, otp: otpDigits.join("") }));
  };

  const handleDigitChange = (value: string, index: number) => {
    const nextCharacter = value.replace(/\D/g, "").slice(-1);

    setOtpDigits((current) => {
      const nextDigits = [...current];
      nextDigits[index] = nextCharacter;
      return nextDigits;
    });

    if (nextCharacter && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (key: string, index: number) => {
    if (key === "Backspace" && !otpDigits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const timerLabel = `00:${String(secondsRemaining).padStart(2, "0")}`;

  return (
    <View className="flex-1" style={{ backgroundColor: AuthUI.bg }}>
      <StatusBar style="dark" />

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
              {isOtpStep ? "Verify Code" : "Continue with Mobile"}
            </Text>
            <Text
              className="mb-8 mt-2 text-center text-[14px] leading-5"
              style={{ fontFamily: ListifyFonts.regular, color: AuthUI.subtitle }}
            >
              {isOtpStep
                ? `Please enter the code we just sent to ${requestedPhone}`
                : "Enter your mobile number to receive OTP"}
            </Text>

            {!isOtpStep ? (
              <View className="w-full">
                <Text
                  className="mb-2 text-[14px] text-[#111111]"
                  style={{ fontFamily: ListifyFonts.semiBold }}
                >
                  Phone
                </Text>
                <PhoneInputWithCountry
                  phoneCode={phoneCode}
                  phone={phoneDigits}
                  isoCode={isoCode}
                  onChangePhoneCode={(code, iso) => {
                    setPhoneCode(code);
                    setIsoCode(iso);
                  }}
                  onChangePhone={(digits) => setPhoneDigits(digits)}
                />
                <View className="mt-6">
                  <AuthPrimaryButton
                    label="Send OTP"
                    onPress={handleSendOtp}
                    loading={isLoading}
                  />
                </View>
              </View>
            ) : (
              <View className="w-full">
                <View className="mb-6 w-full flex-row justify-center gap-2.5">
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
                      style={{
                        width: 48,
                        height: 52,
                        borderRadius: 10,
                        backgroundColor: AuthUI.inputBg,
                        textAlign: "center",
                        color: AuthUI.text,
                        fontSize: 22,
                        fontWeight: "600",
                      }}
                    />
                  ))}
                </View>

                <AuthPrimaryButton
                  label="Verify"
                  onPress={handleVerifyOtp}
                  loading={isLoading}
                  disabled={!isVerifyEnabled}
                />

                <View className="mt-6 items-center gap-3">
                  {secondsRemaining > 0 ? (
                    <Text
                      style={{
                        color: AuthUI.subtitle,
                        fontFamily: ListifyFonts.regular,
                        fontSize: 14,
                      }}
                    >
                      Resend OTP in {timerLabel}
                    </Text>
                  ) : (
                    <Pressable onPress={handleResendOtp} disabled={isLoading}>
                      <Text
                        style={{
                          fontFamily: ListifyFonts.semiBold,
                          color: AuthUI.text,
                          textDecorationLine: "underline",
                          fontSize: 14,
                        }}
                      >
                        Resend code
                      </Text>
                    </Pressable>
                  )}
                  <Pressable
                    onPress={() => {
                      setRequestedPhone(null);
                      setPhoneDigits("");
                      setOtpDigits(Array(OTP_LENGTH).fill(""));
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: ListifyFonts.medium,
                        color: AuthUI.link,
                        fontSize: 14,
                      }}
                    >
                      Change Number
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}

            <Text
              className="mt-8 text-center text-[14px]"
              style={{ fontFamily: ListifyFonts.regular, color: AuthUI.subtitle }}
            >
              Prefer password login?{" "}
              <Text
                style={{ fontFamily: ListifyFonts.semiBold, color: AuthUI.link }}
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

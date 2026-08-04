/**
 * ChangePhoneScreen
 *
 * Flow:
 *  1. User enters new phone number (country picker + digits)
 *  2. "Send OTP" → POST /api/auth/phone/update-send-otp
 *  3. OTP input appears
 *  4. "Verify" → POST /api/auth/phone/update-verify-otp
 *  5. Success: Redux user updated, navigate back to security screen
 */
import { MaterialIcons } from "@expo/vector-icons";
import { type Href, useRouter } from "@/lib/safe-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ListifyFonts } from "@/constants/typography";
import { sendRecoveryPhoneOTP, verifyRecoveryPhoneOTP } from "@/features/auth/services/auth-api";
import { showErrorToast } from "@/lib/toast";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { setAuthUser } from "@/store/slices/auth-slice";
import { PhoneInputWithCountry } from "@/components/phone-input-with-country";
import { useLocale } from "@/providers/locale-provider";
import { useTheme } from "@/providers/theme-provider";

const BRAND = "#27BB97";
const TEXT_PRIMARY = "#1A1A1A";
const TEXT_MUTED = "#6B7280";

export function ChangePhoneScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const { colors } = useTheme();
  const user = useAppSelector((s) => s.auth.user);
  const { phoneCode: localePhoneCode, isoCountryCode: localeIso } = useLocale();

  const [phoneCode, setPhoneCode] = useState(localePhoneCode);
  const [phoneIso, setPhoneIso] = useState(localeIso);
  const [phoneDigits, setPhoneDigits] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [maskedPhone, setMaskedPhone] = useState("");
  const [loading, setLoading] = useState(false);

  const fullPhone = phoneDigits ? `${phoneCode}${phoneDigits}` : "";

  const handleSendOTP = async () => {
    if (!phoneDigits.trim()) {
      showErrorToast("Phone required", "Please enter your new phone number.");
      return;
    }
    setLoading(true);
    try {
      const res = await sendRecoveryPhoneOTP(fullPhone, "sms");
      if (res.success) {
        setMaskedPhone(res.phone || fullPhone);
        setStep("otp");
      } else {
        showErrorToast("Failed", res.message || "Could not send OTP");
      }
    } catch (e: unknown) {
      showErrorToast("Error", e instanceof Error ? e.message : "Could not send OTP");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (!otp.trim()) {
      showErrorToast("OTP required", "Please enter the verification code.");
      return;
    }
    setLoading(true);
    try {
      const res = await verifyRecoveryPhoneOTP(fullPhone, otp.trim());
      if (res.success) {
        // Update Redux user state so security screen reflects the change
        if (user) {
          dispatch(setAuthUser({
            ...user,
            phone: res.phone ?? fullPhone,
            phoneVerified: res.phoneVerified ?? true,
          }));
        }
        // Navigate back to security screen
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace("/(tabs)/dashboard-home" as Href);
        }
      } else {
        showErrorToast("Failed", res.message || "Invalid or expired OTP");
      }
    } catch (e: unknown) {
      showErrorToast("Error", e instanceof Error ? e.message : "Verification failed");
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    if (step === "otp") {
      setStep("phone");
      setOtp("");
      return;
    }
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)/dashboard-home" as Href);
    }
  };

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      {/* Header */}
      <View
        className="flex-row items-center px-5"
        style={{ paddingTop: insets.top + 8, paddingBottom: 12 }}
      >
        <Pressable
          onPress={handleBack}
          hitSlop={12}
          className="mr-2 h-10 w-10 items-center justify-center"
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        >
          <MaterialIcons name="chevron-left" size={32} color={colors.icon} />
        </Pressable>
        <Text
          className="text-[22px]"
          style={{ fontFamily: ListifyFonts.bold, color: colors.textPrimary }}
        >
          {step === "otp" ? "Enter OTP" : "Update Recovery Phone"}
        </Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
      >
        {/* Info card */}
        <View
          className="mb-6 rounded-2xl p-5"
          style={{ backgroundColor: colors.surface, elevation: 2, shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } }}
        >
          <View className="mb-2 flex-row items-center gap-3">
            <View className="h-11 w-11 items-center justify-center rounded-2xl" style={{ backgroundColor: "rgba(39,187,151,0.12)" }}>
              <MaterialIcons name="phone-android" size={22} color={BRAND} />
            </View>
            <Text className="text-[16px]" style={{ fontFamily: ListifyFonts.semiBold, color: TEXT_PRIMARY }}>
              Recovery phone
            </Text>
          </View>
          {user?.phone ? (
            <Text className="text-[13px]" style={{ fontFamily: ListifyFonts.regular, color: TEXT_MUTED }}>
              Current: {`${String(user.phone).slice(0, 3)}******${String(user.phone).slice(-2)}`}
            </Text>
          ) : (
            <Text className="text-[13px]" style={{ fontFamily: ListifyFonts.regular, color: TEXT_MUTED }}>
              No recovery phone set yet. Add one to improve account security.
            </Text>
          )}
        </View>

        {step === "phone" ? (
          <View
            className="rounded-2xl bg-white p-5"
            style={{ elevation: 2, shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } }}
          >
            <Text className="mb-2 text-[13px]" style={{ fontFamily: ListifyFonts.medium, color: TEXT_MUTED }}>
              New phone number
            </Text>
            <PhoneInputWithCountry
              phoneCode={phoneCode}
              phone={phoneDigits}
              isoCode={phoneIso}
              onChangePhoneCode={(code, iso) => {
                setPhoneCode(code);
                setPhoneIso(iso);
              }}
              onChangePhone={setPhoneDigits}
            />
            <Text className="mt-3 text-[12px]" style={{ fontFamily: ListifyFonts.regular, color: TEXT_MUTED }}>
              We'll send a one-time code to this number via SMS.
            </Text>
          </View>
        ) : (
          <View
            className="rounded-2xl bg-white p-5"
            style={{ elevation: 2, shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } }}
          >
            <Text className="mb-1 text-[15px]" style={{ fontFamily: ListifyFonts.semiBold, color: TEXT_PRIMARY }}>
              Verification code
            </Text>
            <Text className="mb-4 text-[13px]" style={{ fontFamily: ListifyFonts.regular, color: TEXT_MUTED }}>
              Sent to {maskedPhone}
            </Text>
            <TextInput
              value={otp}
              onChangeText={(t) => setOtp(t.replace(/\D/g, "").slice(0, 6))}
              keyboardType="number-pad"
              placeholder="000000"
              placeholderTextColor="#9CA3AF"
              maxLength={6}
              className="h-14 rounded-xl bg-[#F6F7F8] px-4 text-center text-[24px] tracking-widest"
              style={{ fontFamily: ListifyFonts.bold, color: TEXT_PRIMARY, letterSpacing: 8 }}
            />
            <Pressable
              onPress={() => void handleSendOTP()}
              className="mt-3"
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <Text className="text-center text-[13px]" style={{ fontFamily: ListifyFonts.medium, color: BRAND }}>
                Resend code
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      {/* Footer button */}
      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: "#E5E7EB",
          backgroundColor: colors.surface,
          paddingHorizontal: 20,
          paddingTop: 12,
          paddingBottom: Math.max(insets.bottom, 12),
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.06,
          shadowRadius: 8,
          elevation: 16,
        }}
      >
        <Pressable
          onPress={step === "phone" ? () => void handleSendOTP() : () => void handleVerifyOTP()}
          disabled={loading}
          style={({ pressed }) => ({
            minHeight: 52,
            borderRadius: 16,
            backgroundColor: "#1A1A1A",
            alignItems: "center",
            justifyContent: "center",
            opacity: loading ? 0.6 : pressed ? 0.9 : 1,
          })}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text className="text-[16px] text-white" style={{ fontFamily: ListifyFonts.bold }}>
              {step === "phone" ? "Send OTP" : "Verify & Save"}
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

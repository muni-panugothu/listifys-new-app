/**
 * ChangePhonePrimaryScreen
 *
 * Two-step flow for changing the user's PRIMARY phone number (not recovery phone).
 *  Step 1 – Phone country picker + digits → "Send OTP" (Twilio Verify)
 *  Step 2 – 6-digit OTP input with 5-min countdown & 60s resend cooldown → "Verify & Update"
 *    On success: dispatches setAuthUser, refreshes profile, navigates back
 */
import { MaterialIcons } from "@expo/vector-icons";
import { type Href, useRouter } from "@/lib/safe-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ListifyFonts } from "@/constants/typography";
import { requestPhoneChange, verifyPhoneChange } from "@/features/auth/services/auth-api";
import { showErrorToast } from "@/lib/toast";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { fetchProfile, setAuthUser } from "@/store/slices/auth-slice";
import { PhoneInputWithCountry } from "@/components/phone-input-with-country";
import { useLocale } from "@/providers/locale-provider";
import { useTheme } from "@/providers/theme-provider";

const BRAND = "#27BB97";
const TEXT_PRIMARY = "#1A1A1A";
const TEXT_MUTED = "#6B7280";
const OTP_EXPIRE_SECS = 300;
const RESEND_COOLDOWN_SECS = 60;

// ── Countdown hook ────────────────────────────────────────────────────────────
function useCountdown(initial: number) {
  const [secs, setSecs] = useState(0);
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = (from = initial) => {
    setSecs(from);
    if (ref.current) clearInterval(ref.current);
    ref.current = setInterval(() => {
      setSecs((s) => {
        if (s <= 1) { clearInterval(ref.current!); ref.current = null; return 0; }
        return s - 1;
      });
    }, 1000);
  };

  useEffect(() => () => { if (ref.current) clearInterval(ref.current); }, []);
  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  return { secs, start, fmt };
}

// ── 6-box OTP input ───────────────────────────────────────────────────────────
function OtpInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const inputs = useRef<(TextInput | null)[]>([]);
  const digits = value.padEnd(6, " ").split("").slice(0, 6);

  const handleChange = (text: string, idx: number) => {
    const d = text.replace(/\D/g, "").slice(-1);
    const arr = (value + "      ").split("").slice(0, 6);
    arr[idx] = d || " ";
    const next = arr.join("").trimEnd();
    onChange(next);
    if (d && idx < 5) inputs.current[idx + 1]?.focus();
  };

  const handleKeyPress = (key: string, idx: number) => {
    if (key === "Backspace" && !digits[idx]?.trim() && idx > 0) {
      const arr = (value + "      ").split("").slice(0, 6);
      arr[idx - 1] = " ";
      onChange(arr.join("").trimEnd());
      inputs.current[idx - 1]?.focus();
    }
  };

  return (
    <View style={{ flexDirection: "row", justifyContent: "center", gap: 10, marginVertical: 24 }}>
      {digits.map((d, i) => (
        <TextInput
          key={i}
          ref={(r) => { inputs.current[i] = r; }}
          value={d.trim()}
          onChangeText={(t) => handleChange(t, i)}
          onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, i)}
          keyboardType="number-pad"
          maxLength={1}
          selectTextOnFocus
          style={{
            width: 48,
            height: 56,
            borderRadius: 14,
            borderWidth: 2,
            borderColor: d.trim() ? BRAND : "#E5E7EB",
            backgroundColor: d.trim() ? "rgba(39,187,151,0.07)" : "#F9FAFB",
            textAlign: "center",
            fontSize: 22,
            fontFamily: ListifyFonts.bold,
            color: TEXT_PRIMARY,
          }}
        />
      ))}
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────
export function ChangePhonePrimaryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const { colors } = useTheme();
  const user = useAppSelector((s) => s.auth.user);
  const { phoneCode: localePhoneCode, isoCountryCode: localeIso } = useLocale();

  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phoneCode, setPhoneCode] = useState(localePhoneCode);
  const [phoneIso, setPhoneIso] = useState(localeIso);
  const [phoneDigits, setPhoneDigits] = useState("");
  const [otp, setOtp] = useState("");
  const [maskedPhone, setMaskedPhone] = useState("");
  const [loading, setLoading] = useState(false);

  const expireTimer = useCountdown(OTP_EXPIRE_SECS);
  const resendTimer = useCountdown(RESEND_COOLDOWN_SECS);

  const fullPhone = phoneDigits ? `${phoneCode}${phoneDigits}` : "";

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/dashboard-home" as Href);
  };

  // ── Step 1: send OTP ───────────────────────────────────────────────────────
  const handleSendOTP = async () => {
    if (!phoneDigits.trim()) { showErrorToast("Required", "Please enter your new phone number."); return; }
    Keyboard.dismiss();
    setLoading(true);
    try {
      const res = await requestPhoneChange(fullPhone, "sms");
      setMaskedPhone(res.phone ?? fullPhone);
      setStep("otp");
      expireTimer.start(res.expiresIn ?? OTP_EXPIRE_SECS);
      resendTimer.start(RESEND_COOLDOWN_SECS);
    } catch (e: unknown) {
      showErrorToast("Error", e instanceof Error ? e.message : "Failed to send OTP. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2: verify OTP ─────────────────────────────────────────────────────
  const handleVerify = async () => {
    const code = otp.replace(/\s/g, "");
    if (code.length !== 6) { showErrorToast("Incomplete", "Please enter all 6 digits."); return; }
    Keyboard.dismiss();
    setLoading(true);
    try {
      const res = await verifyPhoneChange(fullPhone, code);
      if (user && res.phone) {
        dispatch(setAuthUser({ ...user, phone: res.phone, phoneVerified: true }));
      }
      await dispatch(fetchProfile());
      handleBack();
    } catch (e: unknown) {
      showErrorToast("Incorrect OTP", e instanceof Error ? e.message : "Invalid or expired code.");
      setOtp("");
    } finally {
      setLoading(false);
    }
  };

  // ── Resend ─────────────────────────────────────────────────────────────────
  const handleResend = async () => {
    setLoading(true);
    try {
      const res = await requestPhoneChange(fullPhone, "sms");
      setMaskedPhone(res.phone ?? fullPhone);
      setOtp("");
      expireTimer.start(res.expiresIn ?? OTP_EXPIRE_SECS);
      resendTimer.start(RESEND_COOLDOWN_SECS);
    } catch (e: unknown) {
      showErrorToast("Failed", e instanceof Error ? e.message : "Could not resend OTP.");
    } finally {
      setLoading(false);
    }
  };

  const otpExpired = step === "otp" && expireTimer.secs === 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingTop: insets.top + 8,
          paddingBottom: 12,
          paddingHorizontal: 20,
          backgroundColor: colors.background,
        }}
      >
        <Pressable
          onPress={handleBack}
          hitSlop={12}
          style={({ pressed }) => ({
            opacity: pressed ? 0.7 : 1,
            marginRight: 4,
            width: 40,
            height: 40,
            alignItems: "center",
            justifyContent: "center",
          })}
        >
          <MaterialIcons name="chevron-left" size={32} color={colors.icon} />
        </Pressable>
        <Text style={{ fontSize: 22, fontFamily: ListifyFonts.bold, color: colors.textPrimary }}>
          Change Phone Number
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Step indicator */}
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 28, marginTop: 4 }}>
          {(["phone", "otp"] as const).map((s, i) => (
            <View key={s} style={{ flexDirection: "row", alignItems: "center", flex: i < 1 ? 1 : undefined }}>
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: step === s ? BRAND : (i < (step === "otp" ? 1 : 0) ? BRAND : "#E5E7EB"),
                }}
              >
                {i < (step === "otp" ? 1 : 0) ? (
                  <MaterialIcons name="check" size={18} color="#fff" />
                ) : (
                  <Text style={{ color: step === s ? "#fff" : TEXT_MUTED, fontFamily: ListifyFonts.bold, fontSize: 13 }}>{i + 1}</Text>
                )}
              </View>
              <Text style={{ marginLeft: 8, fontFamily: step === s ? ListifyFonts.semiBold : ListifyFonts.regular, color: step === s ? TEXT_PRIMARY : TEXT_MUTED, fontSize: 13 }}>
                {s === "phone" ? "New Number" : "Verify OTP"}
              </Text>
              {i < 1 && <View style={{ flex: 1, height: 2, backgroundColor: step === "otp" ? BRAND : "#E5E7EB", marginHorizontal: 10 }} />}
            </View>
          ))}
        </View>

        {/* ── Step 1: phone picker ── */}
        {step === "phone" && (
          <View
            style={{
              backgroundColor: colors.surface,
              borderRadius: 20,
              padding: 24,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.05,
              shadowRadius: 10,
              elevation: 3,
            }}
          >
            <View style={{ alignItems: "center", marginBottom: 24 }}>
              <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: "rgba(39,187,151,0.12)", alignItems: "center", justifyContent: "center" }}>
                <MaterialIcons name="phone-iphone" size={30} color={BRAND} />
              </View>
              <Text style={{ marginTop: 14, fontSize: 18, fontFamily: ListifyFonts.bold, color: TEXT_PRIMARY }}>Enter new number</Text>
              <Text style={{ marginTop: 6, fontSize: 13.5, fontFamily: ListifyFonts.regular, color: TEXT_MUTED, textAlign: "center" }}>
                {user?.phone ? `Current: ${user.phone}` : "Enter the phone number you'd like to use."}
              </Text>
            </View>

            <Text style={{ fontSize: 13, fontFamily: ListifyFonts.medium, color: TEXT_MUTED, marginBottom: 8 }}>New phone number</Text>
            <PhoneInputWithCountry
              phoneCode={phoneCode}
              phone={phoneDigits}
              isoCode={phoneIso}
              onChangePhoneCode={(code, iso) => { setPhoneCode(code); setPhoneIso(iso); }}
              onChangePhone={setPhoneDigits}
            />

            <Pressable
              onPress={handleSendOTP}
              disabled={loading}
              style={({ pressed }) => ({
                marginTop: 24,
                height: 52,
                borderRadius: 16,
                backgroundColor: "#1A1A1A",
                alignItems: "center",
                justifyContent: "center",
                opacity: loading ? 0.6 : pressed ? 0.88 : 1,
              })}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={{ fontSize: 16, fontFamily: ListifyFonts.semiBold, color: "#fff" }}>Send Verification Code</Text>
              )}
            </Pressable>
          </View>
        )}

        {/* ── Step 2: OTP ── */}
        {step === "otp" && (
          <View
            style={{
              backgroundColor: colors.surface,
              borderRadius: 20,
              padding: 24,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.05,
              shadowRadius: 10,
              elevation: 3,
            }}
          >
            <View style={{ alignItems: "center", marginBottom: 8 }}>
              <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: "rgba(39,187,151,0.12)", alignItems: "center", justifyContent: "center" }}>
                <MaterialIcons name="sms" size={30} color={BRAND} />
              </View>
              <Text style={{ marginTop: 14, fontSize: 18, fontFamily: ListifyFonts.bold, color: TEXT_PRIMARY }}>Enter the code</Text>
              <Text style={{ marginTop: 6, fontSize: 13.5, fontFamily: ListifyFonts.regular, color: TEXT_MUTED, textAlign: "center" }}>
                Sent via SMS to
              </Text>
              <Text style={{ fontSize: 14, fontFamily: ListifyFonts.semiBold, color: TEXT_PRIMARY, marginTop: 2 }}>
                {maskedPhone}
              </Text>
            </View>

            {/* Countdown */}
            {!otpExpired ? (
              <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6, marginTop: 12 }}>
                <MaterialIcons name="timer" size={16} color={expireTimer.secs < 60 ? "#EF4444" : BRAND} />
                <Text style={{ fontSize: 14, fontFamily: ListifyFonts.semiBold, color: expireTimer.secs < 60 ? "#EF4444" : BRAND }}>
                  Code expires in {expireTimer.fmt(expireTimer.secs)}
                </Text>
              </View>
            ) : (
              <Text style={{ textAlign: "center", marginTop: 12, fontSize: 14, fontFamily: ListifyFonts.medium, color: "#EF4444" }}>
                Code has expired. Please resend.
              </Text>
            )}

            {/* OTP boxes */}
            <OtpInput value={otp} onChange={setOtp} />

            {/* Verify button */}
            <Pressable
              onPress={handleVerify}
              disabled={loading || otpExpired || otp.replace(/\s/g, "").length < 6}
              style={({ pressed }) => ({
                height: 52,
                borderRadius: 16,
                backgroundColor: "#1A1A1A",
                alignItems: "center",
                justifyContent: "center",
                opacity: (loading || otpExpired || otp.replace(/\s/g, "").length < 6) ? 0.5 : pressed ? 0.88 : 1,
              })}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={{ fontSize: 16, fontFamily: ListifyFonts.semiBold, color: "#fff" }}>Verify & Update Number</Text>
              )}
            </Pressable>

            {/* Resend */}
            <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", marginTop: 16, gap: 4 }}>
              <Text style={{ fontSize: 14, fontFamily: ListifyFonts.regular, color: TEXT_MUTED }}>Didn't receive it?</Text>
              {resendTimer.secs > 0 ? (
                <Text style={{ fontSize: 14, fontFamily: ListifyFonts.medium, color: TEXT_MUTED }}>
                  Resend in {resendTimer.secs}s
                </Text>
              ) : (
                <Pressable onPress={handleResend} disabled={loading} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
                  <Text style={{ fontSize: 14, fontFamily: ListifyFonts.semiBold, color: BRAND }}>Resend OTP</Text>
                </Pressable>
              )}
            </View>

            {/* Back link */}
            <Pressable
              onPress={() => { setStep("phone"); setOtp(""); }}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, marginTop: 10, alignItems: "center" })}
            >
              <Text style={{ fontSize: 13, fontFamily: ListifyFonts.medium, color: TEXT_MUTED }}>← Change phone number</Text>
            </Pressable>
          </View>
        )}

        {/* Security note */}
        <View style={{ flexDirection: "row", backgroundColor: "#FFF8E1", borderRadius: 12, padding: 14, marginTop: 20, gap: 10, alignItems: "flex-start" }}>
          <MaterialIcons name="security" size={18} color="#D97706" style={{ marginTop: 1 }} />
          <Text style={{ flex: 1, fontSize: 13, fontFamily: ListifyFonts.regular, color: "#92400E", lineHeight: 19 }}>
            A security alert will be sent to your current phone number via SMS. If you didn't request this change, please secure your account immediately.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

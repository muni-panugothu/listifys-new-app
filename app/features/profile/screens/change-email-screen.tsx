/**
 * ChangeEmailScreen
 *
 * Two-step flow:
 *  Step 1 – Enter new email → "Send OTP"
 *    • Validates format client-side
 *    • POST /api/auth/email/change-request
 *    • Shows masked address + 5-min countdown
 *
 *  Step 2 – Enter 6-digit OTP → "Verify & Update"
 *    • POST /api/auth/email/change-verify
 *    • Shows attempt counter
 *    • Resend available after 60 s cooldown
 *    • On success → dispatches setAuthUser, navigates back
 */
import { MaterialIcons } from "@expo/vector-icons";
import { type Href, useRouter } from "@/lib/safe-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { KeyboardFormScroll } from "@/components/keyboard-form-scroll";

import { ListifyFonts } from "@/constants/typography";
import { useTheme } from "@/providers/theme-provider";
import { requestEmailChange, verifyEmailChange, AuthApiError } from "@/features/auth/services/auth-api";
import { showErrorToast } from "@/lib/toast";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { fetchProfile, setAuthUser } from "@/store/slices/auth-slice";

const BRAND = "#27BB97";
const TEXT_PRIMARY = "#1A1A1A";
const TEXT_MUTED = "#6B7280";
const OTP_EXPIRE_SECS = 300; // 5 minutes
const RESEND_COOLDOWN_SECS = 60;

function formatEmailChangeError(error: unknown): { title: string; message: string } {
  if (error instanceof AuthApiError) {
    if (error.status === 409) {
      return {
        title: "Email already in use",
        message: "This email address is already registered. Please use a different email.",
      };
    }
    if (error.status === 429) {
      return {
        title: "Too many attempts",
        message: error.message || "Please wait before requesting another code.",
      };
    }
    if (error.status === 503) {
      return {
        title: "Email delivery failed",
        message: error.message || "We couldn't send a verification code. Please try again in a moment.",
      };
    }
    if (error.status === 400 && error.message) {
      return { title: "Invalid email", message: error.message };
    }
    if (error.message && error.message !== "Server error.") {
      return { title: "Error", message: error.message };
    }
    if (error.status === 500) {
      return {
        title: "Something went wrong",
        message: "We couldn't complete your request. Please try again in a moment.",
      };
    }
  }
  const msg = error instanceof Error ? error.message : "Please try again.";
  return { title: "Error", message: msg };
}

// ── Countdown hook ────────────────────────────────────────────────────────────
function useCountdown(initial: number) {
  const [secs, setSecs] = useState(0);
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = (from = initial) => {
    setSecs(from);
    if (ref.current) clearInterval(ref.current);
    ref.current = setInterval(() => {
      setSecs((s) => {
        if (s <= 1) {
          clearInterval(ref.current!);
          ref.current = null;
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  };

  useEffect(() => () => { if (ref.current) clearInterval(ref.current); }, []);

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  return { secs, start, fmt };
}

// ── OTP digit boxes ───────────────────────────────────────────────────────────
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
export function ChangeEmailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const { colors } = useTheme();
  const user = useAppSelector((s) => s.auth.user);

  const [step, setStep] = useState<"email" | "otp">("email");
  const [newEmail, setNewEmail] = useState("");
  const [maskedEmail, setMaskedEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [attemptsLeft, setAttemptsLeft] = useState(5);
  const [loading, setLoading] = useState(false);
  const [devOtpHint, setDevOtpHint] = useState<string | null>(null);

  const expireTimer = useCountdown(OTP_EXPIRE_SECS);
  const resendTimer = useCountdown(RESEND_COOLDOWN_SECS);

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/dashboard-home" as Href);
  };

  // ── Step 1: send OTP ───────────────────────────────────────────────────────
  const handleSendOTP = async () => {
    const email = newEmail.trim().toLowerCase();
    if (!email) { showErrorToast("Required", "Please enter your new email address."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showErrorToast("Invalid", "Please enter a valid email address."); return; }
    Keyboard.dismiss();
    setLoading(true);
    try {
      const res = await requestEmailChange(email);
      setMaskedEmail(res.maskedEmail ?? email);
      if (res.devOtp) {
        setOtp(res.devOtp);
        setDevOtpHint(res.devOtp);
      }
      setStep("otp");
      expireTimer.start(res.expiresIn ?? OTP_EXPIRE_SECS);
      resendTimer.start(RESEND_COOLDOWN_SECS);
    } catch (e: unknown) {
      const { title, message } = formatEmailChangeError(e);
      showErrorToast(title, message);
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
      const res = await verifyEmailChange(newEmail.trim().toLowerCase(), code);
      // Update Redux + refresh profile
      if (user && res.email) {
        dispatch(setAuthUser({ ...user, email: res.email }));
      }
      await dispatch(fetchProfile());
      handleBack();
    } catch (e: unknown) {
      const err = e as { message?: string; attemptsRemaining?: number };
      if (typeof err.attemptsRemaining === "number") setAttemptsLeft(err.attemptsRemaining);
      showErrorToast("Incorrect OTP", err.message ?? "Invalid or expired code.");
      setOtp("");
    } finally {
      setLoading(false);
    }
  };

  // ── Resend ─────────────────────────────────────────────────────────────────
  const handleResend = async () => {
    setLoading(true);
    try {
      const res = await requestEmailChange(newEmail.trim().toLowerCase());
      setMaskedEmail(res.maskedEmail ?? newEmail);
      if (res.devOtp) {
        setOtp(res.devOtp);
        setDevOtpHint(res.devOtp);
      } else {
        setOtp("");
      }
      setAttemptsLeft(5);
      expireTimer.start(res.expiresIn ?? OTP_EXPIRE_SECS);
      resendTimer.start(RESEND_COOLDOWN_SECS);
    } catch (e: unknown) {
      const { title, message } = formatEmailChangeError(e);
      showErrorToast(title, message);
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
          Change Email
        </Text>
      </View>

      <KeyboardFormScroll
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Progress indicator */}
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 28, marginTop: 4 }}>
          {(["email", "otp"] as const).map((s, i) => (
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
                {s === "email" ? "New Email" : "Verify OTP"}
              </Text>
              {i < 1 && <View style={{ flex: 1, height: 2, backgroundColor: step === "otp" ? BRAND : "#E5E7EB", marginHorizontal: 10 }} />}
            </View>
          ))}
        </View>

        {/* ── Step 1: email input ── */}
        {step === "email" && (
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
                <MaterialIcons name="email" size={30} color={BRAND} />
              </View>
              <Text style={{ marginTop: 14, fontSize: 18, fontFamily: ListifyFonts.bold, color: TEXT_PRIMARY }}>Enter new email</Text>
              <Text style={{ marginTop: 6, fontSize: 13.5, fontFamily: ListifyFonts.regular, color: TEXT_MUTED, textAlign: "center" }}>
                {user?.email ? `Current: ${user.email}` : "Enter the email address you'd like to use."}
              </Text>
            </View>

            <Text style={{ fontSize: 13, fontFamily: ListifyFonts.medium, color: TEXT_MUTED, marginBottom: 8 }}>New email address</Text>
            <TextInput
              value={newEmail}
              onChangeText={setNewEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="you@example.com"
              placeholderTextColor="#9CA3AF"
              style={{
                height: 52,
                borderRadius: 14,
                backgroundColor: "#F6F7F8",
                paddingHorizontal: 16,
                fontSize: 15,
                fontFamily: ListifyFonts.regular,
                color: TEXT_PRIMARY,
                borderWidth: 1.5,
                borderColor: newEmail.trim() ? BRAND : "transparent",
              }}
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
                <MaterialIcons name="mark-email-read" size={30} color={BRAND} />
              </View>
              <Text style={{ marginTop: 14, fontSize: 18, fontFamily: ListifyFonts.bold, color: TEXT_PRIMARY }}>Check your inbox</Text>
              <Text style={{ marginTop: 6, fontSize: 13.5, fontFamily: ListifyFonts.regular, color: TEXT_MUTED, textAlign: "center" }}>
                We sent a 6-digit code to
              </Text>
              <Text style={{ fontSize: 14, fontFamily: ListifyFonts.semiBold, color: TEXT_PRIMARY, marginTop: 2 }}>
                {maskedEmail}
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

            {devOtpHint ? (
              <View
                style={{
                  marginBottom: 12,
                  borderRadius: 12,
                  backgroundColor: "#FFFBEB",
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                }}
              >
                <Text
                  style={{
                    textAlign: "center",
                    fontSize: 13,
                    fontFamily: ListifyFonts.medium,
                    color: "#92400E",
                  }}
                >
                  Dev mode: email could not be delivered. Your code is {devOtpHint}
                </Text>
              </View>
            ) : null}

            {/* Attempt counter */}
            {attemptsLeft < 5 && (
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 16 }}>
                <MaterialIcons name="warning-amber" size={16} color="#F59E0B" />
                <Text style={{ fontSize: 13, fontFamily: ListifyFonts.medium, color: "#F59E0B" }}>
                  {attemptsLeft} attempt{attemptsLeft !== 1 ? "s" : ""} remaining
                </Text>
              </View>
            )}

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
                <Text style={{ fontSize: 16, fontFamily: ListifyFonts.semiBold, color: "#fff" }}>Verify & Update Email</Text>
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

            {/* Change email link */}
            <Pressable
              onPress={() => { setStep("email"); setOtp(""); }}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, marginTop: 10, alignItems: "center" })}
            >
              <Text style={{ fontSize: 13, fontFamily: ListifyFonts.medium, color: TEXT_MUTED }}>← Change email address</Text>
            </Pressable>
          </View>
        )}

        {/* Security note */}
        <View style={{ flexDirection: "row", backgroundColor: "#FFF8E1", borderRadius: 12, padding: 14, marginTop: 20, gap: 10, alignItems: "flex-start" }}>
          <MaterialIcons name="security" size={18} color="#D97706" style={{ marginTop: 1 }} />
          <Text style={{ flex: 1, fontSize: 13, fontFamily: ListifyFonts.regular, color: "#92400E", lineHeight: 19 }}>
            A security alert will be sent to your current email address. If you didn't request this change, please secure your account immediately.
          </Text>
        </View>
      </KeyboardFormScroll>
    </View>
  );
}

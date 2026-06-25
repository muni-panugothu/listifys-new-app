/**
 * AuthGateBottomSheet — Flipkart-style bottom sheet that appears when a guest
 * user tries to save, message, or make an offer. Shows phone input → OTP flow,
 * with a "or sign in with Google" option below.
 */
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import { type Href, useRouter } from "@/lib/safe-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardStickyView } from "@/lib/safe-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useKeyboardStickyOffset } from "@/components/chat-keyboard-scroll-view";
import { formatAuthFailureMessage, reportGoogleSignInFailure } from "@/lib/auth-error-display";
import { authTrace } from "@/lib/auth-trace";
import {
  configureGoogleSignIn,
  signInWithGoogleNative,
} from "@/lib/google-sign-in";
import { showErrorToast } from "@/lib/toast";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import type { AuthGateAction } from "@/store/slices/auth-gate-slice";
import { googleLogin, sendPhoneOtp, verifyPhoneOtp } from "@/store/slices/auth-slice";

type Props = {
  visible: boolean;
  onClose: () => void;
  /** What action the user was trying to do (for the title) */
  action?: AuthGateAction;
  onAuthenticated?: () => void;
  emailSignInHref?: Href;
};

const ACTION_TITLES: Record<string, string> = {
  save: "save this item",
  message: "message the seller",
  messages: "view your messages",
  offer: "make an offer",
  general: "continue",
  sell: "post your ad",
  profile: "open your profile",
  notifications: "view your notifications",
};

export function AuthGateBottomSheet({
  visible,
  onClose,
  action = "general",
  onAuthenticated,
  emailSignInHref = "/sign-in",
}: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const stickyOffset = useKeyboardStickyOffset();
  const dispatch = useAppDispatch();
  const { isAuthenticated, status } = useAppSelector((s) => s.auth);
  const slideAnim = useRef(new Animated.Value(0)).current;

  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [localError, setLocalError] = useState("");

  const isLoading = status === "loading";

  // Close on successful auth
  useEffect(() => {
    if (isAuthenticated && visible) {
      onAuthenticated?.();
      onClose();
    }
  }, [isAuthenticated, visible, onAuthenticated, onClose]);

  // Animate in
  useEffect(() => {
    if (visible) {
      setStep("phone");
      setPhone("");
      setOtp("");
      setLocalError("");
      Animated.spring(slideAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      }).start();
    } else {
      Keyboard.dismiss();
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, slideAnim]);

  useEffect(() => {
    if (visible) {
      void configureGoogleSignIn().catch(() => {});
    }
  }, [visible]);

  const handleClose = useCallback(() => {
    Keyboard.dismiss();
    onClose();
  }, [onClose]);

  const handleSendOtp = useCallback(async () => {
    const cleaned = phone.trim().replace(/\s+/g, "");
    if (cleaned.length < 10) {
      setLocalError("Enter a valid phone number");
      return;
    }
    setLocalError("");
    const formattedPhone = cleaned.startsWith("+") ? cleaned : `+91${cleaned}`;
    try {
      const result = await dispatch(sendPhoneOtp({ phone: formattedPhone })).unwrap();
      if (result.success) {
        setStep("otp");
      }
    } catch (err: any) {
      setLocalError(typeof err === "string" ? err : "Failed to send OTP");
    }
  }, [phone, dispatch]);

  const handleVerifyOtp = useCallback(async () => {
    if (otp.length < 4) {
      setLocalError("Enter the OTP sent to your phone");
      return;
    }
    setLocalError("");
    const formattedPhone = phone.trim().startsWith("+") ? phone.trim() : `+91${phone.trim()}`;
    try {
      await dispatch(verifyPhoneOtp({ phone: formattedPhone, otp })).unwrap();
      // Auth slice will set isAuthenticated → useEffect above closes sheet
    } catch (err: any) {
      setLocalError(typeof err === "string" ? err : "Invalid OTP");
    }
  }, [otp, phone, dispatch]);

  const handleGoogleSignIn = useCallback(async () => {
    try {
      setIsGoogleLoading(true);
      authTrace("auth-gate.google_start");
      const idToken = await signInWithGoogleNative();
      authTrace("auth-gate.google_native_ok");
      await dispatch(googleLogin({ idToken })).unwrap();
      authTrace("auth-gate.google_backend_ok");
      Keyboard.dismiss();
      onAuthenticated?.();
      onClose();
    } catch (err) {
      reportGoogleSignInFailure(err, showErrorToast, "Google sign in");
    } finally {
      setIsGoogleLoading(false);
    }
  }, [dispatch, onAuthenticated, onClose]);

  const title = useMemo(
    () => `Sign in to ${ACTION_TITLES[action] ?? "continue"}`,
    [action],
  );

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <Pressable onPress={handleClose} className="flex-1 bg-black/40" />

      <KeyboardStickyView offset={stickyOffset}>
        <Animated.View
          style={{
            transform: [{
              translateY: slideAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [600, 0],
              }),
            }],
          }}
        >
          <View
            className="rounded-t-3xl bg-white"
            style={{
              paddingBottom: Math.max(insets.bottom, 20),
              shadowColor: "#000",
              shadowOffset: { width: 0, height: -12 },
              shadowOpacity: 0.15,
              shadowRadius: 40,
              elevation: 24,
            }}
          >
            <View className="items-center py-3">
              <View className="h-1.5 w-12 rounded-full bg-slate-200" />
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              bounces={false}
              contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8 }}
            >
              <View className="mb-1 flex-row items-center justify-between">
                <Text className="flex-1 pr-3 text-[22px] font-bold tracking-tight text-[#161D1A]">
                  {title}
                </Text>
                <Pressable onPress={handleClose} className="rounded-full p-2">
                  <MaterialIcons name="close" size={22} color="#94A3B8" />
                </Pressable>
              </View>
              <Text className="mb-6 text-[14px] text-[#6C7A74]">
                {step === "phone"
                  ? "Enter your mobile number to get started"
                  : `We sent a code to +91${phone.replace(/^\+91/, "")}`}
              </Text>

              {localError ? (
                <View className="mb-4 flex-row items-center gap-2 rounded-lg bg-red-50 px-3 py-2">
                  <MaterialIcons name="error-outline" size={18} color="#EF4444" />
                  <Text className="flex-1 text-[13px] text-red-600">{localError}</Text>
                </View>
              ) : null}

              {step === "phone" ? (
                <>
                  <View className="mb-5 h-14 flex-row items-center rounded-xl border-2 border-slate-100 bg-slate-50 px-4">
                    <Text className="mr-2 text-[16px] font-medium text-[#3C4A44]">+91</Text>
                    <View className="mr-2 h-6 w-px bg-slate-200" />
                    <TextInput
                      value={phone}
                      onChangeText={(val) => { setPhone(val.replace(/[^0-9]/g, "")); setLocalError(""); }}
                      placeholder="Enter mobile number"
                      placeholderTextColor="#94A3B8"
                      keyboardType="phone-pad"
                      maxLength={10}
                      className="flex-1 text-[16px] font-medium text-[#161D1A]"
                      style={{ paddingVertical: 0 }}
                    />
                  </View>

                  <Pressable
                    onPress={handleSendOtp}
                    disabled={isLoading}
                    className="mb-4 h-14 items-center justify-center rounded-xl bg-[#27BB97]"
                    style={{
                      opacity: isLoading ? 0.7 : 1,
                      shadowColor: "#27BB97",
                      shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: 0.25,
                      shadowRadius: 8,
                      elevation: 4,
                    }}
                  >
                    {isLoading ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text className="text-[16px] font-bold text-white">Send OTP</Text>
                    )}
                  </Pressable>
                </>
              ) : (
                <>
                  <View className="mb-5 h-14 flex-row items-center rounded-xl border-2 border-slate-100 bg-slate-50 px-4">
                    <MaterialIcons name="lock-outline" size={20} color="#94A3B8" />
                    <TextInput
                      value={otp}
                      onChangeText={(val) => { setOtp(val.replace(/[^0-9]/g, "")); setLocalError(""); }}
                      placeholder="Enter OTP"
                      placeholderTextColor="#94A3B8"
                      keyboardType="number-pad"
                      maxLength={6}
                      className="ml-3 flex-1 text-[18px] font-bold tracking-[8px] text-[#161D1A]"
                      style={{ paddingVertical: 0 }}
                    />
                  </View>

                  <Pressable
                    onPress={handleVerifyOtp}
                    disabled={isLoading}
                    className="mb-3 h-14 items-center justify-center rounded-xl bg-[#27BB97]"
                    style={{
                      opacity: isLoading ? 0.7 : 1,
                      shadowColor: "#27BB97",
                      shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: 0.25,
                      shadowRadius: 8,
                      elevation: 4,
                    }}
                  >
                    {isLoading ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text className="text-[16px] font-bold text-white">Verify & Continue</Text>
                    )}
                  </Pressable>

                  <Pressable
                    onPress={() => { setStep("phone"); setOtp(""); setLocalError(""); }}
                    className="mb-2 items-center py-2"
                  >
                    <Text className="text-[14px] font-medium text-[#27BB97]">Change number</Text>
                  </Pressable>
                </>
              )}

              <View className="my-4 flex-row items-center">
                <View className="h-px flex-1 bg-slate-200" />
                <Text className="mx-4 text-[12px] font-medium uppercase tracking-wider text-[#94A3B8]">or</Text>
                <View className="h-px flex-1 bg-slate-200" />
              </View>

              <Pressable
                onPress={handleGoogleSignIn}
                disabled={isGoogleLoading}
                className="mb-3 h-14 flex-row items-center justify-center gap-3 rounded-xl border-2 border-slate-100 bg-white"
                style={{ opacity: isGoogleLoading ? 0.7 : 1 }}
              >
                {isGoogleLoading ? (
                  <ActivityIndicator color="#4285F4" />
                ) : (
                  <>
                    <Ionicons name="logo-google" size={20} color="#4285F4" />
                    <Text className="text-[15px] font-semibold text-[#161D1A]">
                      Sign in with Google
                    </Text>
                  </>
                )}
              </Pressable>

              <Pressable
                onPress={() => { handleClose(); router.push(emailSignInHref); }}
                className="items-center py-3"
              >
                <Text className="text-[14px] text-[#6C7A74]">
                  Have an account?{" "}
                  <Text className="font-semibold text-[#27BB97]">Sign in with email</Text>
                </Text>
              </Pressable>
            </ScrollView>
          </View>
        </Animated.View>
      </KeyboardStickyView>
    </Modal>
  );
}

import { type Href, useLocalSearchParams, useRouter } from "@/lib/safe-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import {
  Keyboard,
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
import { AuthSkipButton } from "@/features/auth/components/auth-skip-button";
import { AuthSocialRow } from "@/features/auth/components/auth-social-row";
import { AUTH_API_BASE_URL } from "@/features/auth/services/auth-api";
import { validateSignInInput } from "@/lib/auth-validation";
import {
  configureGoogleSignIn,
  signInWithGoogleNative,
} from "@/lib/google-sign-in";
import {
  formatAuthFailureMessage,
  reportAuthSliceError,
  reportGoogleSignInFailure,
} from "@/lib/auth-error-display";
import { navigateAfterAuthentication } from "@/lib/auth-navigation";
import { authTrace } from "@/lib/auth-trace";
import { showErrorToast } from "@/lib/toast";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { hideAuthGate } from "@/store/slices/auth-gate-slice";
import { clearError, googleLogin, login, resetAuthStatus } from "@/store/slices/auth-slice";

export function SignInScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ redirectTo?: string | string[] }>();
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const { status, error, isAuthenticated } = useAppSelector((s) => s.auth);
  const [credential, setCredential] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const contentPaddingBottom = useMemo(
    () => Math.max(insets.bottom + 24, 24),
    [insets.bottom],
  );
  const isLoading = status === "loading";
  const redirectTo = useMemo(() => {
    const raw = params.redirectTo;
    return Array.isArray(raw) ? raw[0] : raw;
  }, [params.redirectTo]);

  useEffect(() => {
    void configureGoogleSignIn().catch(() => {});
    dispatch(resetAuthStatus());
  }, [dispatch]);

  useEffect(() => {
    if (!isAuthenticated || status !== "succeeded") return;

    authTrace("sign-in.effect_nav", { redirectTo: redirectTo ?? null });
    Keyboard.dismiss();
    dispatch(hideAuthGate());
    void navigateAfterAuthentication(router, {
      redirectTo,
      source: "sign-in.effect",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, isAuthenticated, redirectTo, status]);

  useEffect(() => {
    if (!error) return;
    reportAuthSliceError(error, showErrorToast, "Sign In Failed", "Sign in");
    dispatch(clearError());
  }, [dispatch, error]);

  const handleSignIn = async () => {
    const validation = validateSignInInput(credential, password);
    if (!validation.ok) {
      showErrorToast("Missing Details", validation.message);
      return;
    }
    try {
      await dispatch(
        login({ identity: validation.identity, password: validation.password }),
      ).unwrap();
      Keyboard.dismiss();
      dispatch(hideAuthGate());
      authTrace("sign-in.password_success");
      await navigateAfterAuthentication(router, { redirectTo, source: "sign-in.password" });
    } catch (err) {
      showErrorToast("Sign In Failed", formatAuthFailureMessage(err, "Sign in"));
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      setIsGoogleLoading(true);
      authTrace("sign-in.google_start");
      const idToken = await signInWithGoogleNative();
      authTrace("sign-in.google_native_ok");
      await dispatch(googleLogin({ idToken })).unwrap();
      authTrace("sign-in.google_backend_ok");
      Keyboard.dismiss();
      dispatch(hideAuthGate());
      await navigateAfterAuthentication(router, { redirectTo, source: "sign-in.google" });
    } catch (err) {
      reportGoogleSignInFailure(err, showErrorToast, "Google sign in");
    } finally {
      setIsGoogleLoading(false);
    }
  };

  return (
    <View className="flex-1" style={{ backgroundColor: AuthUI.bg }}>
      <StatusBar style="dark" />
      <AuthSkipButton />

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
              Sign In
            </Text>
            <Text
              className="mb-8 mt-2 text-center text-[14px]"
              style={{ fontFamily: ListifyFonts.regular, color: AuthUI.subtitle }}
            >
              Hi Welcome back, you&apos;ve been missed
            </Text>

            <AuthField
              label="Email"
              value={credential}
              onChangeText={setCredential}
              placeholder="example@gmail.com"
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="username"
            />
            <AuthField
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              isPassword
              showPassword={showPassword}
              onTogglePassword={() => setShowPassword((v) => !v)}
              autoComplete="password"
            />

            <Pressable
              onPress={() => router.push("/forgot-password" as Href)}
              hitSlop={8}
              style={({ pressed }) => ({
                alignSelf: "flex-end",
                marginBottom: 24,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text
                style={{
                  fontFamily: ListifyFonts.medium,
                  color: AuthUI.link,
                  fontSize: 13,
                }}
              >
                Forgot Password?
              </Text>
            </Pressable>

            <AuthPrimaryButton
              label="Sign In"
              onPress={handleSignIn}
              loading={isLoading}
              disabled={isGoogleLoading}
            />

            <AuthSocialRow
              mode="sign-in"
              onGooglePress={handleGoogleSignIn}
              googleLoading={isGoogleLoading}
              disabled={isLoading}
            />

            <Text
              className="mt-8 text-center text-[14px]"
              style={{ fontFamily: ListifyFonts.regular, color: AuthUI.subtitle }}
            >
              Don&apos;t have an account?{" "}
              <Text
                style={{ fontFamily: ListifyFonts.semiBold, color: AuthUI.link }}
                onPress={() => router.push("/sign-up" as Href)}
              >
                Sign Up
              </Text>
            </Text>

            {__DEV__ ? (
              <Text
                className="mt-6 text-center text-[11px]"
                style={{ color: AuthUI.muted }}
              >
                API: {AUTH_API_BASE_URL}
              </Text>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

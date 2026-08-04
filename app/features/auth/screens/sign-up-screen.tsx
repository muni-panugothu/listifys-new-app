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
import { AuthSkipButton } from "@/features/auth/components/auth-skip-button";
import { AuthSocialRow } from "@/features/auth/components/auth-social-row";
import { validateSignUpInput } from "@/lib/auth-validation";
import { reportAuthSliceError, reportGoogleSignInFailure } from "@/lib/auth-error-display";
import { navigateAfterAuthentication } from "@/lib/auth-navigation";
import { authTrace } from "@/lib/auth-trace";
import {
  configureGoogleSignIn,
  signInWithGoogleNative,
} from "@/lib/google-sign-in";
import { showErrorToast } from "@/lib/toast";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  clearError,
  clearRegistrationEmail,
  googleLogin,
  register,
} from "@/store/slices/auth-slice";

export function SignUpScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const { status, error, registrationEmail, isAuthenticated } = useAppSelector(
    (s) => s.auth,
  );
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const prevRegEmail = useRef<string | null>(registrationEmail);

  const contentPaddingBottom = useMemo(
    () => Math.max(insets.bottom + 24, 24),
    [insets.bottom],
  );
  const isLoading = status === "loading";

  useEffect(() => {
    dispatch(clearRegistrationEmail());
    prevRegEmail.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    authTrace("sign-up.effect_nav");
    void navigateAfterAuthentication(router, { source: "sign-up.effect" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  useEffect(() => {
    if (registrationEmail && registrationEmail !== prevRegEmail.current) {
      prevRegEmail.current = registrationEmail;
      router.push("/otp-verification" as Href);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registrationEmail]);

  useEffect(() => {
    if (!error) return;
    reportAuthSliceError(error, showErrorToast, "Sign Up Failed", "Sign up");
    dispatch(clearError());
  }, [error, dispatch]);

  useEffect(() => {
    void configureGoogleSignIn().catch(() => {});
  }, []);

  const handleCreateAccount = () => {
    if (!acceptedTerms) {
      showErrorToast("Terms required", "Please accept the Terms & Condition to continue.");
      return;
    }

    const validation = validateSignUpInput(fullName, email, password);
    if (!validation.ok) {
      showErrorToast("Sign Up", validation.message);
      return;
    }

    dispatch(
      register({
        name: validation.name,
        email: validation.email,
        password: validation.password,
      }),
    );
  };

  const handleGoogleSignIn = async () => {
    try {
      setIsGoogleLoading(true);
      authTrace("sign-up.google_start");
      const idToken = await signInWithGoogleNative();
      authTrace("sign-up.google_native_ok");
      await dispatch(googleLogin({ idToken })).unwrap();
      authTrace("sign-up.google_backend_ok");
      await navigateAfterAuthentication(router, { source: "sign-up.google" });
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
              Create Account
            </Text>
            <Text
              className="mb-8 mt-2 px-2 text-center text-[14px] leading-5"
              style={{ fontFamily: ListifyFonts.regular, color: AuthUI.subtitle }}
            >
              Fill your information below or register with your social account.
            </Text>

            <AuthField
              label="Name"
              value={fullName}
              onChangeText={setFullName}
              placeholder="John Doe"
              autoCapitalize="words"
            />
            <AuthField
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="example@gmail.com"
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <AuthField
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              isPassword
              showPassword={showPassword}
              onTogglePassword={() => setShowPassword((v) => !v)}
            />

            <Pressable
              onPress={() => setAcceptedTerms((v) => !v)}
              className="mb-6 flex-row items-center"
              hitSlop={6}
            >
              <View
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 5,
                  borderWidth: acceptedTerms ? 0 : 1.5,
                  borderColor: AuthUI.muted,
                  backgroundColor: acceptedTerms ? AuthUI.primary : "transparent",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {acceptedTerms ? (
                  <Text style={{ color: "#FFF", fontSize: 12, fontWeight: "700" }}>✓</Text>
                ) : null}
              </View>
              <Text
                className="ml-2.5 text-[14px]"
                style={{
                  fontFamily: ListifyFonts.medium,
                  color: AuthUI.text,
                  textDecorationLine: "underline",
                }}
              >
                Agree with Terms & Condition
              </Text>
            </Pressable>

            <AuthPrimaryButton
              label="Sign Up"
              onPress={handleCreateAccount}
              loading={isLoading}
              disabled={isGoogleLoading}
            />

            <AuthSocialRow
              mode="sign-up"
              onGooglePress={handleGoogleSignIn}
              googleLoading={isGoogleLoading}
              disabled={isLoading}
            />

            <Text
              className="mt-8 text-center text-[14px]"
              style={{ fontFamily: ListifyFonts.regular, color: AuthUI.subtitle }}
            >
              Already have an account?{" "}
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

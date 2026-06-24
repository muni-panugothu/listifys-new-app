import { MaterialIcons } from "@expo/vector-icons";
import { type Href, useLocalSearchParams, useRouter } from "@/lib/safe-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AuthSkipButton } from "@/features/auth/components/auth-skip-button";
import { AUTH_API_BASE_URL } from "@/features/auth/services/auth-api";
import { validateSignInInput } from "@/lib/auth-validation";
import {
  configureGoogleSignIn,
  signInWithGoogleNative,
} from "@/lib/google-sign-in";
import { formatAuthFailureMessage, reportAuthSliceError, reportGoogleSignInFailure } from "@/lib/auth-error-display";
import { showErrorToast } from "@/lib/toast";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { hideAuthGate } from "@/store/slices/auth-gate-slice";
import { clearError, googleLogin, login } from "@/store/slices/auth-slice";

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
  }, []);

  // Navigate only after a fresh login on this screen — not stale session state.
  useEffect(() => {
    if (!isAuthenticated || status !== "succeeded") return;

    Keyboard.dismiss();
    dispatch(hideAuthGate());
    if (redirectTo && redirectTo.startsWith("/")) {
      router.replace(redirectTo as Href);
      return;
    }
    router.replace("/(tabs)/home-feed-root" as Href);
    // `router` intentionally omitted from deps – its reference changes on every
    // navigation (safe-router rebuilds on pathname), which would cause this
    // effect to re-fire after the user navigates away and bounce them back.
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
      // Mirror Google login: await + unwrap so navigation is driven imperatively,
      // not via a useEffect. This guarantees keyboard is dismissed and the Redux
      // state is fully committed before we push the tab navigator.
      await dispatch(login({ identity: validation.identity, password: validation.password })).unwrap();
      Keyboard.dismiss();
      dispatch(hideAuthGate());
      if (redirectTo && redirectTo.startsWith("/")) {
        router.replace(redirectTo as Href);
      } else {
        router.replace("/(tabs)/home-feed-root" as Href);
      }
    } catch (err) {
      showErrorToast("Sign In Failed", formatAuthFailureMessage(err, "Sign in"));
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      setIsGoogleLoading(true);
      const idToken = await signInWithGoogleNative();
      await dispatch(googleLogin({ idToken })).unwrap();
    } catch (err) {
      reportGoogleSignInFailure(err, showErrorToast, "Google sign in");
    } finally {
      setIsGoogleLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-white">
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
            paddingTop: insets.top + 16,
            paddingBottom: contentPaddingBottom,
            paddingHorizontal: 16,
            flexGrow: 1,
            justifyContent: "center",
          }}
        >
          <View className="w-full self-center" style={{ maxWidth: 430 }}>
            <View className="w-full items-center">
              <Text className="mb-5 text-[30px] font-extrabold text-gray-800">Login</Text>

              <View className="w-full flex-col gap-3">
                <TextInput
                  value={credential}
                  onChangeText={setCredential}
                  placeholder="Email or phone"
                  placeholderTextColor="#9CA3AF"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoComplete="username"
                  className="w-full rounded-full border border-gray-300 p-4 text-gray-800"
                />
                <View className="w-full flex-row items-center rounded-full border border-gray-300 pr-4">
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Password"
                    placeholderTextColor="#9CA3AF"
                    secureTextEntry={!showPassword}
                    autoComplete="password"
                    className="flex-1 p-4 text-gray-800"
                  />
                  <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={8}>
                    <MaterialIcons
                      name={showPassword ? "visibility" : "visibility-off"}
                      size={20}
                      color="#9CA3AF"
                    />
                  </Pressable>
                </View>
              </View>

              <Pressable onPress={() => router.push("/forgot-password" as Href)}>
                <Text className="my-5 font-bold text-gray-800 underline">Forgot Password?</Text>
              </Pressable>

              <Pressable
                onPress={handleSignIn}
                disabled={isLoading || isGoogleLoading}
                style={({ pressed }) => ({
                  opacity: pressed ? 0.9 : isLoading ? 0.7 : 1,
                })}
                className="w-full items-center rounded-full bg-black px-5 py-3"
              >
                {isLoading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text className="text-center font-semibold text-white">Login</Text>
                )}
              </Pressable>
            </View>

            <View className="my-7 w-full flex-row items-center gap-3">
              <View className="h-px flex-1 bg-gray-400" />
              <Text className="text-gray-400">or</Text>
              <View className="h-px flex-1 bg-gray-400" />
            </View>

            <View className="w-full flex-col gap-2">
              <Pressable
                onPress={handleGoogleSignIn}
                disabled={isLoading || isGoogleLoading}
                style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
                className="flex-row items-center justify-center gap-4 rounded-full bg-gray-200 px-6 py-3"
              >
                <Image source={require("../../../assets/google.jpg")} className="h-8 w-8 rounded-full" />
                <Text className="font-semibold text-black">
                  {isGoogleLoading ? "Connecting..." : "Continue with Google"}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => router.push("/mobile" as Href)}
                className="flex-row items-center justify-center gap-4 rounded-full bg-gray-200 px-6 py-3"
              >
                <Image
                  source={require("../../../assets/mobile.jpg")}
                  className="h-8 w-10 rounded-lg"
                  resizeMode="contain"
                />
                <Text className="font-semibold text-black">Continue with Mobile</Text>
              </Pressable>
            </View>

            <Text className="mt-4 text-center text-gray-500">
              Don&apos;t have an account?{" "}
              <Text
                className="text-[17px] font-bold text-gray-800"
                onPress={() => router.push("/sign-up" as Href)}
              >
                Sign Up
              </Text>
            </Text>

            {__DEV__ ? (
              <Text className="mt-6 text-center text-[11px] text-gray-400">
                API: {AUTH_API_BASE_URL}
              </Text>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

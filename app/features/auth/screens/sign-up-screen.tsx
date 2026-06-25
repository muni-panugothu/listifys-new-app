import { MaterialIcons } from "@expo/vector-icons";
import { type Href, useRouter } from "@/lib/safe-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
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
import { clearError, clearRegistrationEmail, googleLogin, register } from "@/store/slices/auth-slice";

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
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  // Track previous registrationEmail so we only navigate when it freshly becomes non-null
  const prevRegEmail = useRef<string | null>(registrationEmail);

  const contentPaddingBottom = useMemo(
    () => Math.max(insets.bottom + 24, 24),
    [insets.bottom],
  );
  const isLoading = status === "loading";

  // Clear any stale registration session the moment this screen mounts so going back
  // from OTP doesn't immediately redirect here again.
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

  // Only navigate when registrationEmail transitions from null → value (fresh registration)
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
              <Text className="text-gray-800 text-[30px] font-extrabold mb-5">
                Sign Up
              </Text>

              <View className="w-full flex flex-col gap-3">
                <TextInput
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder="Full Name"
                  placeholderTextColor="#9CA3AF"
                  autoCapitalize="words"
                  className="border border-gray-300 p-4 rounded-full w-full text-gray-800"
                />
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Email"
                  placeholderTextColor="#9CA3AF"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  className="border border-gray-300 p-4 rounded-full w-full text-gray-800"
                />
                <View className="border border-gray-300 rounded-full w-full flex-row items-center pr-4">
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Password"
                    placeholderTextColor="#9CA3AF"
                    secureTextEntry={!showPassword}
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

              <Pressable
                onPress={handleCreateAccount}
                disabled={isLoading || isGoogleLoading}
                style={({ pressed }) => [
                  { opacity: pressed ? 0.9 : 1 },
                  { opacity: isLoading ? 0.7 : 1 },
                ]}
                className="bg-black text-white px-5 py-3 rounded-full w-full items-center mt-5"
              >
                {isLoading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text className="text-white text-center font-semibold">
                    Create Account
                  </Text>
                )}
              </Pressable>
            </View>

            <View className="flex-row items-center gap-3 w-full my-7">
              <View className="flex-1 bg-gray-400 h-px" />
              <Text className="text-gray-400">or</Text>
              <View className="flex-1 bg-gray-400 h-px" />
            </View>

            <View className="w-full flex flex-col gap-2">
              <Pressable
                onPress={handleGoogleSignIn}
                disabled={isLoading || isGoogleLoading}
                style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1 }]}
                className="bg-gray-200 text-black px-6 py-3 rounded-full flex-row items-center justify-center gap-4"
              >
                <Image
                  source={require("../../../assets/google.jpg")}
                  className="h-8 w-8 rounded-full"
                />
                <Text className="font-semibold text-black">
                  {isGoogleLoading ? "Connecting..." : "Continue with Google"}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  router.push("/mobile" as Href);
                }}
                className="bg-gray-200 text-black px-6 py-3 rounded-full flex-row items-center justify-center gap-4"
              >
                <Image
                  source={require("../../../assets/mobile.jpg")}
                  className="h-8 w-10 rounded-lg"
                  resizeMode="contain"
                />
                <Text className="font-semibold text-black">Continue with Mobile</Text>
              </Pressable>
            </View>

            <Text className="text-gray-500 text-center mt-4">
              Already have an account?{" "}
              <Text
                className="text-[14px] font-bold text-gray-800"
                onPress={() => {
                  router.push("/sign-in" as Href);
                }}
              >
                Login
              </Text>
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

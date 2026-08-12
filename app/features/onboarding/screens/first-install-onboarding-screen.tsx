import { type Href, useRouter } from "@/lib/safe-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  Image,
  Text,
  View,
  useColorScheme,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewToken,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialIcons } from "@expo/vector-icons";

import { SafePressable } from "@/components/safe-pressable";
import { ListifyColors } from "@/constants/listify-theme";
import { ListifyFonts } from "@/constants/typography";
import { FirstInstallOnboardingSlide } from "@/features/onboarding/components/first-install-onboarding-slide";
import { FIRST_INSTALL_SLIDES } from "@/features/onboarding/data/first-install-slides";
import { reportGoogleSignInFailure } from "@/lib/auth-error-display";
import { navigateAfterAuthentication } from "@/lib/auth-navigation";
import { authTrace } from "@/lib/auth-trace";
import {
  configureGoogleSignIn,
  signInWithGoogleNative,
} from "@/lib/google-sign-in";
import { showErrorToast } from "@/lib/toast";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { googleLogin } from "@/store/slices/auth-slice";
import { completeFirstInstallIntro } from "@/store/slices/onboarding-slice";

const googleIcon = require("../../../assets/auth/google.png");
const appleIcon = require("../../../assets/auth/apple.png");

export function FirstInstallOnboardingScreen() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const isAuthenticated = useAppSelector((s) => s.auth.isAuthenticated);

  const listRef = useRef<FlatList<(typeof FIRST_INSTALL_SLIDES)[number]>>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const exitStartedRef = useRef(false);

  const colors = {
    bg: isDark ? "#0F1412" : "#FFFFFF",
    heading: isDark ? "#F3F4F6" : "#111827",
    muted: isDark ? "#9CA3AF" : "#6B7280",
    progressInactive: isDark ? "#374151" : "#E5E7EB",
    footerTray: isDark ? "#1A211E" : "#F3F4F6",
    socialBorder: isDark ? "#374151" : "#E5E7EB",
    socialBg: isDark ? "#111827" : "#FFFFFF",
  };

  const markIntroComplete = useCallback(async () => {
    try {
      await dispatch(completeFirstInstallIntro()).unwrap();
    } catch {
      // Continue navigation even if storage write fails.
    }
  }, [dispatch]);

  const finishIntroOnce = useCallback(async () => {
    if (exitStartedRef.current) return false;
    exitStartedRef.current = true;
    await markIntroComplete();
    return true;
  }, [markIntroComplete]);

  const goToAuthWelcome = useCallback(async () => {
    if (!(await finishIntroOnce())) return;
    router.replace("/onboarding-slide-3" as Href);
  }, [finishIntroOnce, router]);

  const goToSignUp = useCallback(async () => {
    if (!(await finishIntroOnce())) return;
    router.replace("/sign-up" as Href);
  }, [finishIntroOnce, router]);

  const goToSignIn = useCallback(async () => {
    if (!(await finishIntroOnce())) return;
    router.replace("/sign-in" as Href);
  }, [finishIntroOnce, router]);

  useEffect(() => {
    void configureGoogleSignIn().catch(() => {});
  }, []);

  useEffect(() => {
    if (!isAuthenticated || exitStartedRef.current) return;
    void (async () => {
      await markIntroComplete();
      await navigateAfterAuthentication(router, {
        source: "first-install-onboarding.effect",
      });
    })();
  }, [isAuthenticated, markIntroComplete, router]);

  const handleGoogleSignIn = useCallback(async () => {
    if (isGoogleLoading) return;
    try {
      setIsGoogleLoading(true);
      authTrace("first-install.google_start");
      const idToken = await signInWithGoogleNative();
      authTrace("first-install.google_native_ok");
      await dispatch(googleLogin({ idToken })).unwrap();
      authTrace("first-install.google_backend_ok");
      await markIntroComplete();
      exitStartedRef.current = true;
      await navigateAfterAuthentication(router, {
        source: "first-install.google",
      });
    } catch (err) {
      reportGoogleSignInFailure(err, showErrorToast, "Google sign in");
    } finally {
      setIsGoogleLoading(false);
    }
  }, [dispatch, isGoogleLoading, markIntroComplete, router]);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const index = viewableItems[0]?.index;
      if (typeof index === "number") {
        setActiveIndex(index);
      }
    },
  ).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 55,
  }).current;

  const onMomentumScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const index = Math.round(event.nativeEvent.contentOffset.x / width);
      setActiveIndex(index);
    },
    [width],
  );

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.bg,
        paddingTop: insets.top,
        paddingBottom: Math.max(insets.bottom, 16),
      }}
    >
      <StatusBar style={isDark ? "light" : "dark"} />

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 20,
          paddingBottom: 4,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {FIRST_INSTALL_SLIDES.map((slide, index) => {
            const isActive = index === activeIndex;
            return (
              <View
                key={slide.id}
                style={{
                  width: isActive ? 22 : 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: isActive
                    ? ListifyColors.primary
                    : colors.progressInactive,
                }}
              />
            );
          })}
        </View>

        <SafePressable
          onPress={() => {
            void goToAuthWelcome();
          }}
          hitSlop={12}
          sharedKey="first-install-skip"
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            opacity: pressed ? 0.65 : 1,
            paddingVertical: 4,
            paddingHorizontal: 2,
          })}
        >
          <Text
            style={{
              fontFamily: ListifyFonts.medium,
              fontSize: 15,
              color: colors.muted,
            }}
          >
            Skip
          </Text>
          <MaterialIcons
            name="chevron-right"
            size={20}
            color={colors.muted}
            style={{ marginLeft: -2 }}
          />
        </SafePressable>
      </View>

      <FlatList
        ref={listRef}
        data={FIRST_INSTALL_SLIDES}
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1 }}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumScrollEnd}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        getItemLayout={(_, index) => ({
          length: width,
          offset: width * index,
          index,
        })}
        renderItem={({ item }) => (
          <FirstInstallOnboardingSlide
            slide={item}
            width={width}
            isDark={isDark}
          />
        )}
      />

      <View style={{ paddingHorizontal: 16, paddingTop: 6 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: colors.footerTray,
            borderRadius: 999,
            padding: 6,
            gap: 8,
          }}
        >
          <SafePressable
            onPress={() => {
              void handleGoogleSignIn();
            }}
            disabled={isGoogleLoading}
            sharedKey="first-install-google"
            style={({ pressed }) => ({
              width: 48,
              height: 48,
              borderRadius: 24,
              borderWidth: 1,
              borderColor: colors.socialBorder,
              backgroundColor: colors.socialBg,
              alignItems: "center",
              justifyContent: "center",
              opacity: isGoogleLoading ? 0.55 : pressed ? 0.85 : 1,
            })}
          >
            <Image
              source={googleIcon}
              style={{ width: 26, height: 26 }}
              resizeMode="contain"
            />
          </SafePressable>

          <SafePressable
            onPress={() =>
              showErrorToast(
                "Coming soon",
                "Apple sign in will be available in a future update.",
              )
            }
            sharedKey="first-install-apple"
            style={({ pressed }) => ({
              width: 48,
              height: 48,
              borderRadius: 24,
              borderWidth: 1,
              borderColor: colors.socialBorder,
              backgroundColor: colors.socialBg,
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Image
              source={appleIcon}
              style={{ width: 24, height: 24 }}
              resizeMode="contain"
            />
          </SafePressable>

          <SafePressable
            onPress={() => {
              void goToSignUp();
            }}
            sharedKey="first-install-create-account"
            style={({ pressed }) => ({
              flex: 1,
              height: 48,
              borderRadius: 999,
              backgroundColor: ListifyColors.primary,
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.9 : 1,
            })}
          >
            <Text
              style={{
                fontFamily: ListifyFonts.semiBold,
                fontSize: 15,
                color: "#FFFFFF",
              }}
            >
              Create Account
            </Text>
          </SafePressable>
        </View>

        <SafePressable
          onPress={() => {
            void goToSignIn();
          }}
          sharedKey="first-install-sign-in"
          style={({ pressed }) => ({
            marginTop: 16,
            alignItems: "center",
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text
            style={{
              fontFamily: ListifyFonts.regular,
              fontSize: 14,
              color: colors.muted,
              textAlign: "center",
            }}
          >
            Already have an account?{" "}
            <Text
              style={{
                fontFamily: ListifyFonts.semiBold,
                color: colors.heading,
              }}
            >
              Sign in
            </Text>
          </Text>
        </SafePressable>
      </View>
    </View>
  );
}

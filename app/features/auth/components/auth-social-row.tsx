import { type ImageSourcePropType, Image, Pressable, Text, View } from "react-native";
import { type Href, useRouter } from "@/lib/safe-router";

import { AuthUI } from "@/constants/auth-ui";
import { ListifyFonts } from "@/constants/typography";
import { showErrorToast } from "@/lib/toast";

const SOCIAL_ICON_SIZE = 56;

type AuthSocialRowProps = {
  mode: "sign-in" | "sign-up";
  onGooglePress: () => void;
  googleLoading?: boolean;
  disabled?: boolean;
};

type SocialItem = {
  key: string;
  source: ImageSourcePropType;
  onPress: () => void;
};

export function AuthSocialRow({
  mode,
  onGooglePress,
  googleLoading,
  disabled,
}: AuthSocialRowProps) {
  const router = useRouter();
  const dividerLabel = mode === "sign-in" ? "Or sign in with" : "Or sign up with";

  const items: SocialItem[] = [
    {
      key: "apple",
      source: require("../../../assets/auth/apple.png"),
      onPress: () =>
        showErrorToast("Coming soon", "Apple sign in will be available in a future update."),
    },
    {
      key: "google",
      source: require("../../../assets/auth/google.png"),
      onPress: onGooglePress,
    },
    {
      key: "facebook",
      source: require("../../../assets/auth/facebook.png"),
      onPress: () =>
        showErrorToast("Coming soon", "Facebook sign in will be available in a future update."),
    },
  ];

  return (
    <View className="w-full items-center">
      <View className="my-7 w-full flex-row items-center gap-3">
        <View className="h-px flex-1" style={{ backgroundColor: AuthUI.divider }} />
        <Text
          style={{
            fontFamily: ListifyFonts.regular,
            color: AuthUI.muted,
            fontSize: 13,
          }}
        >
          {dividerLabel}
        </Text>
        <View className="h-px flex-1" style={{ backgroundColor: AuthUI.divider }} />
      </View>

      <View className="flex-row items-center justify-center gap-5">
        {items.map((item) => {
          const isGoogle = item.key === "google";
          const itemDisabled = disabled || (isGoogle && googleLoading);
          return (
            <Pressable
              key={item.key}
              onPress={item.onPress}
              disabled={itemDisabled}
              style={({ pressed }) => ({
                opacity: itemDisabled ? 0.55 : pressed ? 0.85 : 1,
                width: SOCIAL_ICON_SIZE,
                height: SOCIAL_ICON_SIZE,
                borderRadius: SOCIAL_ICON_SIZE / 2,
                borderWidth: 1,
                borderColor: AuthUI.socialBorder,
                backgroundColor: "#FFFFFF",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
              })}
            >
              <Image
                source={item.source}
                style={{ width: SOCIAL_ICON_SIZE - 2, height: SOCIAL_ICON_SIZE - 2 }}
                resizeMode="cover"
              />
            </Pressable>
          );
        })}
      </View>

      <Pressable
        onPress={() => router.push("/mobile" as Href)}
        disabled={disabled}
        hitSlop={8}
        style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, marginTop: 18 })}
      >
        <Text
          style={{
            fontFamily: ListifyFonts.medium,
            color: AuthUI.link,
            fontSize: 14,
            textDecorationLine: "underline",
          }}
        >
          Continue with Mobile
        </Text>
      </Pressable>
    </View>
  );
}

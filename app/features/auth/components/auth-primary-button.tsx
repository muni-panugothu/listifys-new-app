import { ActivityIndicator, Pressable, Text } from "react-native";

import { AuthUI } from "@/constants/auth-ui";
import { ListifyFonts } from "@/constants/typography";

type AuthPrimaryButtonProps = {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
};

export function AuthPrimaryButton({
  label,
  onPress,
  loading,
  disabled,
}: AuthPrimaryButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => ({
        width: "100%",
        minHeight: 52,
        borderRadius: AuthUI.buttonRadius,
        backgroundColor: AuthUI.primary,
        alignItems: "center",
        justifyContent: "center",
        opacity: isDisabled ? 0.65 : pressed ? 0.9 : 1,
        paddingHorizontal: 20,
        paddingVertical: 14,
      })}
    >
      {loading ? (
        <ActivityIndicator color="#FFFFFF" />
      ) : (
        <Text
          style={{
            color: "#FFFFFF",
            fontSize: 16,
            fontFamily: ListifyFonts.semiBold,
          }}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

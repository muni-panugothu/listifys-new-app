import { ActivityIndicator, Pressable, type PressableProps, Text, View } from "react-native";

import { ListifyColors } from "@/constants/listify-theme";
import { ListifyFonts } from "@/constants/typography";
import { useSafePress } from "@/lib/use-safe-press";

type SafeButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";

type SafeButtonProps = Omit<PressableProps, "children"> & {
  title: string;
  variant?: SafeButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  cooldownMs?: number;
  sharedKey?: string;
  fullWidth?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
};

const VARIANT_STYLES: Record<
  SafeButtonVariant,
  { bg: string; pressedBg: string; color: string; borderColor?: string }
> = {
  primary: {
    bg: ListifyColors.primary,
    pressedBg: ListifyColors.primaryDark,
    color: "#FFFFFF",
  },
  secondary: {
    bg: ListifyColors.secondaryBlue,
    pressedBg: "#1F66B8",
    color: "#FFFFFF",
  },
  outline: {
    bg: "transparent",
    pressedBg: "rgba(39, 187, 151, 0.10)",
    color: ListifyColors.primary,
    borderColor: ListifyColors.primary,
  },
  ghost: {
    bg: "transparent",
    pressedBg: "rgba(0, 0, 0, 0.04)",
    color: ListifyColors.heading,
  },
  danger: {
    bg: ListifyColors.error,
    pressedBg: "#DC2626",
    color: "#FFFFFF",
  },
};

/**
 * Pressable button with built-in protection against:
 *   - rapid double / triple taps
 *   - taps fired while an async handler is in-flight
 *   - taps fired during a navigation transition
 *
 * Pass `loading` to render a spinner while you do async work; the button
 * automatically prevents new taps while loading.
 */
export function SafeButton({
  title,
  onPress,
  variant = "primary",
  loading = false,
  disabled = false,
  cooldownMs = 250,
  sharedKey,
  fullWidth = true,
  leftIcon,
  rightIcon,
  style,
  ...rest
}: SafeButtonProps) {
  const styles = VARIANT_STYLES[variant];
  const isDisabled = disabled || loading;

  const safeOnPress = useSafePress(
    isDisabled ? undefined : (onPress as (() => void) | undefined),
    { cooldownMs, sharedKey },
  );

  return (
    <Pressable
      {...rest}
      onPress={safeOnPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        {
          backgroundColor: pressed && !isDisabled ? styles.pressedBg : styles.bg,
          borderRadius: 14,
          paddingVertical: 14,
          paddingHorizontal: 20,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          opacity: isDisabled ? 0.55 : 1,
          ...(styles.borderColor
            ? { borderWidth: 1.5, borderColor: styles.borderColor }
            : null),
          ...(fullWidth ? { width: "100%" } : null),
        },
        typeof style === "function" ? style({ pressed }) : style,
      ]}
    >
      {leftIcon && !loading ? <View>{leftIcon}</View> : null}
      {loading ? <ActivityIndicator color={styles.color} size="small" /> : null}
      <Text
        style={{
          color: styles.color,
          fontFamily: ListifyFonts.semiBold,
          fontSize: 15,
        }}
      >
        {title}
      </Text>
      {rightIcon && !loading ? <View>{rightIcon}</View> : null}
    </Pressable>
  );
}

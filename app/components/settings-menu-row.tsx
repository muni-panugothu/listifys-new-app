import { MaterialIcons } from "@expo/vector-icons";
import { Pressable, Switch, Text, View } from "react-native";

import { ListifyFonts } from "@/constants/typography";
import { useTheme } from "@/providers/theme-provider";

type SettingsMenuRowProps = {
  icon: React.ComponentProps<typeof MaterialIcons>["name"];
  iconBg: string;
  iconColor: string;
  label: string;
  subtitle?: string;
  type: "navigate" | "toggle";
  value?: boolean;
  onToggle?: (value: boolean) => void;
  onPress?: () => void;
  disabled?: boolean;
  showDivider?: boolean;
};

export function SettingsMenuRow({
  icon,
  iconBg,
  iconColor,
  label,
  subtitle,
  type,
  value,
  onToggle,
  onPress,
  disabled,
  showDivider,
}: SettingsMenuRowProps) {
  const { colors } = useTheme();

  return (
    <>
      <Pressable
        onPress={type === "navigate" ? onPress : undefined}
        disabled={disabled || type === "toggle"}
        className="flex-row items-center justify-between px-4 py-3.5"
        style={({ pressed }) => ({
          opacity: disabled ? 0.5 : pressed && type === "navigate" ? 0.88 : 1,
        })}
      >
        <View className="min-w-0 flex-1 flex-row items-center gap-3 pr-3">
          <View
            className="h-11 w-11 items-center justify-center rounded-2xl"
            style={{ backgroundColor: iconBg }}
          >
            <MaterialIcons name={icon} size={22} color={iconColor} />
          </View>
          <View className="min-w-0 flex-1">
            <Text
              className="text-[16px]"
              style={{
                fontFamily: ListifyFonts.medium,
                color: colors.textPrimary,
              }}
            >
              {label}
            </Text>
            {subtitle ? (
              <Text
                className="mt-0.5 text-[12px]"
                style={{
                  fontFamily: ListifyFonts.regular,
                  color: colors.textTertiary,
                }}
                numberOfLines={2}
              >
                {subtitle}
              </Text>
            ) : null}
          </View>
        </View>
        {type === "toggle" ? (
          <Switch
            value={value}
            onValueChange={onToggle}
            disabled={disabled}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={colors.textOnPrimary}
          />
        ) : (
          <MaterialIcons name="chevron-right" size={22} color={colors.iconMuted} />
        )}
      </Pressable>
      {showDivider ? (
        <View
          className="mx-4 h-px"
          style={{ backgroundColor: colors.border }}
        />
      ) : null}
    </>
  );
}

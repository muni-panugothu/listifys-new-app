import { MaterialIcons } from "@expo/vector-icons";
import { type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { KeyboardFormScroll } from "@/components/keyboard-form-scroll";
import { SellStepIndicator } from "@/components/sell-step-indicator";
import { ListifyFonts } from "@/constants/typography";
import { useTheme } from "@/providers/theme-provider";

type SellFlowLayoutProps = {
  step: 1 | 2 | 3;
  title: string;
  subtitle?: string;
  children: ReactNode;
  onBack: () => void;
  rightAction?: ReactNode;
  footerLabel?: string;
  footerMeta?: string;
  primaryLabel?: string;
  onPrimaryPress?: () => void;
  primaryDisabled?: boolean;
  primaryLoading?: boolean;
  /** Keeps taps on list rows working while the subcategory search keyboard is open. */
  keyboardPersistTaps?: "always" | "handled" | "never";
};

export function SellSectionCard({
  title,
  required,
  children,
  className,
}: {
  title?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const { colors } = useTheme();

  return (
    <View className={className ?? "mb-5"}>
      {title ? (
        <Text
          className="mb-3 text-[13px] uppercase tracking-wide"
          style={{ fontFamily: ListifyFonts.semiBold, color: colors.textTertiary }}
        >
          {title}
          {required ? (
            <Text style={{ color: colors.danger }}> *</Text>
          ) : null}
        </Text>
      ) : null}
      <View
        className="overflow-hidden rounded-2xl"
        style={{
          backgroundColor: colors.surface,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.04,
          shadowRadius: 8,
          elevation: 2,
        }}
      >
        {children}
      </View>
    </View>
  );
}

export function SellFlowLayout({
  step,
  title,
  subtitle,
  children,
  onBack,
  rightAction,
  footerLabel,
  footerMeta,
  primaryLabel = "Next",
  onPrimaryPress,
  primaryDisabled = false,
  primaryLoading = false,
  keyboardPersistTaps = "handled",
}: SellFlowLayoutProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const showFooter = Boolean(primaryLabel && onPrimaryPress);
  const footerBottomPad = Math.max(insets.bottom, 8);

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <View
        className="flex-row items-center justify-between px-5"
        style={{ paddingTop: insets.top + 8, paddingBottom: 12 }}
      >
        <View className="flex-1 flex-row items-center">
          <Pressable
            onPress={onBack}
            hitSlop={12}
            className="mr-2 h-10 w-10 items-center justify-center"
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          >
            <MaterialIcons name="chevron-left" size={32} color={colors.icon} />
          </Pressable>
          <View className="flex-1">
            <Text
              className="text-[22px]"
              style={{ fontFamily: ListifyFonts.bold, color: colors.textPrimary }}
              numberOfLines={1}
            >
              {title}
            </Text>
            {subtitle ? (
              <Text
                className="text-[13px]"
                style={{ fontFamily: ListifyFonts.regular, color: colors.textSecondary }}
                numberOfLines={1}
              >
                {subtitle}
              </Text>
            ) : null}
          </View>
        </View>
        {rightAction ? <View className="ml-2">{rightAction}</View> : null}
      </View>

      <KeyboardFormScroll
        bottomOffset={showFooter ? footerBottomPad + 72 : 24}
        keyboardVerticalOffset={insets.top}
        keyboardShouldPersistTaps={keyboardPersistTaps}
        contentContainerStyle={{
          paddingHorizontal: 20,
        }}
      >
        <SellStepIndicator currentStep={step} />
        {children}
      </KeyboardFormScroll>

      {showFooter ? (
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: colors.border,
            backgroundColor: colors.surface,
            paddingHorizontal: 20,
            paddingTop: 12,
            paddingBottom: footerBottomPad,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: -2 },
            shadowOpacity: 0.06,
            shadowRadius: 8,
            elevation: 16,
          }}
        >
          {(footerLabel || footerMeta) ? (
            <View style={{ marginBottom: 10 }}>
              {footerLabel ? (
                <Text
                  style={{
                    fontFamily: ListifyFonts.regular,
                    fontSize: 11,
                    color: colors.textTertiary,
                  }}
                >
                  {footerLabel}
                </Text>
              ) : null}
              {footerMeta ? (
                <Text
                  style={{
                    fontFamily: ListifyFonts.semiBold,
                    fontSize: 14,
                    color: colors.textPrimary,
                  }}
                  numberOfLines={2}
                >
                  {footerMeta}
                </Text>
              ) : null}
            </View>
          ) : null}
          <Pressable
            onPress={onPrimaryPress}
            disabled={primaryDisabled || primaryLoading}
            style={({ pressed }) => ({
              opacity: primaryDisabled || primaryLoading ? 0.5 : pressed ? 0.9 : 1,
            })}
          >
            <View
              style={{
                minHeight: 52,
                borderRadius: 16,
                backgroundColor: colors.textPrimary,
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "row",
                gap: 6,
              }}
            >
              {primaryLoading ? (
                <ActivityIndicator color={colors.background} />
              ) : (
                <>
                  <Text
                    style={{
                      fontFamily: ListifyFonts.semiBold,
                      fontSize: 16,
                      color: colors.background,
                    }}
                  >
                    {primaryLabel}
                  </Text>
                  <MaterialIcons name="arrow-forward" size={20} color={colors.background} />
                </>
              )}
            </View>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

import { View, Text } from "react-native";

import { ListifyFonts } from "@/constants/typography";
import { useTheme } from "@/providers/theme-provider";

const STEP_LABELS = ["Category", "Details", "Publish"];

type SellStepIndicatorProps = {
  currentStep: 1 | 2 | 3;
};

/** Minimal step progress — matches profile/settings (no icon row). */
export function SellStepIndicator({ currentStep }: SellStepIndicatorProps) {
  const { colors } = useTheme();
  const progressPct = (currentStep / 3) * 100;

  return (
    <View style={{ marginBottom: 20 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <Text
          style={{
            fontFamily: ListifyFonts.medium,
            fontSize: 13,
            color: colors.textSecondary,
          }}
        >
          Step {currentStep} of 3
        </Text>
        <Text
          style={{
            fontFamily: ListifyFonts.semiBold,
            fontSize: 13,
            color: colors.textPrimary,
          }}
        >
          {STEP_LABELS[currentStep - 1]}
        </Text>
      </View>
      <View
        style={{
          height: 4,
          borderRadius: 999,
          backgroundColor: colors.border,
          overflow: "hidden",
        }}
      >
        <View
          style={{
            height: 4,
            width: `${progressPct}%`,
            borderRadius: 999,
            backgroundColor: colors.textPrimary,
          }}
        />
      </View>
    </View>
  );
}

/** Compact preview on sell entry (before step 1). */
export function SellStepPreview() {
  const { colors } = useTheme();

  return (
    <View style={{ marginTop: 20, marginBottom: 4 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <Text
          style={{
            fontFamily: ListifyFonts.medium,
            fontSize: 13,
            color: colors.textSecondary,
          }}
        >
          3 quick steps
        </Text>
        <Text
          style={{
            fontFamily: ListifyFonts.semiBold,
            fontSize: 13,
            color: colors.textPrimary,
          }}
        >
          Category → Details → Publish
        </Text>
      </View>
      <View
        style={{
          height: 4,
          borderRadius: 999,
          backgroundColor: colors.border,
          overflow: "hidden",
        }}
      >
        <View
          style={{
            height: 4,
            width: "12%",
            borderRadius: 999,
            backgroundColor: colors.textPrimary,
          }}
        />
      </View>
    </View>
  );
}

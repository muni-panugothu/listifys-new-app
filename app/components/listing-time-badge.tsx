import { memo } from "react";
import { Platform, Text, View, type ViewStyle } from "react-native";

import { ListifyFonts } from "@/constants/typography";
import { formatTimeAgo } from "@/lib/format-time-ago";
import { useTheme } from "@/providers/theme-provider";

type ListingTimeBadgeProps = {
  date?: string | null;
  style?: ViewStyle;
};

function ListingTimeBadgeImpl({ date, style }: ListingTimeBadgeProps) {
  const { colors, isDark } = useTheme();
  const label = formatTimeAgo(date);
  if (!label) return null;

  return (
    <View
      style={[
        {
          position: "absolute",
          left: 8,
          top: 8,
          zIndex: 2,
          backgroundColor: colors.surfaceElevated,
          paddingHorizontal: 8,
          paddingVertical: 4,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: colors.border,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: isDark ? 0.25 : 0.08,
          shadowRadius: 3,
          elevation: 2,
        },
        style,
      ]}
    >
      <Text
        style={{
          fontFamily: ListifyFonts.medium,
          fontSize: 11,
          color: colors.textPrimary,
          lineHeight: 14,
          ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
        }}
      >
        {label}
      </Text>
    </View>
  );
}

export const ListingTimeBadge = memo(ListingTimeBadgeImpl);

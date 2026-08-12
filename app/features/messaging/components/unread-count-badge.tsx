import { Text, View } from "react-native";

import { ListifyFonts } from "@/constants/typography";

type UnreadCountBadgeProps = {
  count: number;
  backgroundColor?: string;
};

/** Circular unread badge — number centered inside the circle. */
export function UnreadCountBadge({
  count,
  backgroundColor = "#FF3B30",
}: UnreadCountBadgeProps) {
  if (count <= 0) return null;

  const label = count > 99 ? "99+" : String(count);
  const digits = label.length;
  const size = digits >= 3 ? 26 : digits === 2 ? 22 : 20;

  return (
    <View
      style={{
        minWidth: size,
        height: size,
        borderRadius: size / 2,
        paddingHorizontal: digits > 1 ? 5 : 0,
        backgroundColor,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text
        style={{
          fontFamily: ListifyFonts.bold,
          fontSize: digits >= 3 ? 10 : 11,
          color: "#FFFFFF",
          textAlign: "center",
          includeFontPadding: false,
          lineHeight: digits >= 3 ? 12 : 13,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

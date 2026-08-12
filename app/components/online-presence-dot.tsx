import { View, type ViewStyle } from "react-native";

const ONLINE_GREEN = "#22C55E";

type OnlinePresenceDotProps = {
  visible?: boolean;
  size?: number;
  borderColor?: string;
  borderWidth?: number;
  style?: ViewStyle;
};

/** Green online indicator — bottom-right of avatars (WhatsApp / Instagram style). */
export function OnlinePresenceDot({
  visible = false,
  size = 14,
  borderColor = "#FFFFFF",
  borderWidth = 2.5,
  style,
}: OnlinePresenceDotProps) {
  if (!visible) return null;

  return (
    <View
      style={[
        {
          position: "absolute",
          bottom: 0,
          right: 0,
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: ONLINE_GREEN,
          borderWidth,
          borderColor,
        },
        style,
      ]}
    />
  );
}

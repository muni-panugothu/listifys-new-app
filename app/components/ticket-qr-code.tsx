import { useMemo } from "react";
import { View, type ViewStyle } from "react-native";
import { Image } from "@/lib/nativewind-interop";

type TicketQrCodeProps = {
  value: string;
  size?: number;
  style?: ViewStyle;
};

/** QR via image URL — no native WebView or SVG dependencies. */
export function TicketQrCode({ value, size = 120, style }: TicketQrCodeProps) {
  const uri = useMemo(() => {
    const dim = Math.max(64, Math.round(size));
    return `https://api.qrserver.com/v1/create-qr-code/?size=${dim}x${dim}&data=${encodeURIComponent(value)}&margin=0`;
  }, [size, value]);

  return (
    <View
      style={[
        {
          width: size,
          height: size,
          overflow: "hidden",
          backgroundColor: "#FFFFFF",
          alignItems: "center",
          justifyContent: "center",
        },
        style,
      ]}
    >
      <Image
        source={{ uri }}
        style={{ width: size, height: size, backgroundColor: "#FFFFFF" }}
        contentFit="contain"
        accessibilityLabel="Ticket QR code"
      />
    </View>
  );
}

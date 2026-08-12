import { MaterialIcons } from "@expo/vector-icons";
import { ActivityIndicator, View } from "react-native";

import type { ChatMessage } from "@/features/messaging/services/chat-api";

type MessageStatusIconProps = {
  status: ChatMessage["status"];
  readColor?: string;
  mutedColor?: string;
  size?: number;
};

/** WhatsApp-style delivery ticks for inbox rows and bubbles. */
export function MessageStatusIcon({
  status,
  readColor = "#FF4D6A",
  mutedColor = "#B0B6BF",
  size = 15,
}: MessageStatusIconProps) {
  if (status === "sending") {
    return (
      <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size={10} color={mutedColor} />
      </View>
    );
  }

  if (status === "sent") {
    return <MaterialIcons name="check" size={size} color={mutedColor} />;
  }

  return (
    <MaterialIcons
      name="done-all"
      size={size}
      color={status === "read" ? readColor : mutedColor}
    />
  );
}

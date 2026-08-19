import { MaterialIcons } from "@expo/vector-icons";
import { memo } from "react";
import { Platform, Pressable, Text, View } from "react-native";

import { formatEventDisplayLabel } from "@/lib/event-dates";
import type { FeaturedEventDummy } from "@/features/events/data/events-discovery";
import { ListifyFonts } from "@/constants/typography";
import { Image } from "@/lib/nativewind-interop";

type EventsDistrictCardProps = {
  event: FeaturedEventDummy;
  cardWidth: number;
  onPress?: () => void;
};

function EventsDistrictCardImpl({
  event,
  cardWidth,
  onPress,
}: EventsDistrictCardProps) {
  const imageHeight = cardWidth * 0.72;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        width: cardWidth,
        opacity: pressed ? 0.92 : 1,
      })}
    >
      <View
        style={{
          height: imageHeight,
          borderRadius: 18,
          overflow: "hidden",
          backgroundColor: "#2A2A2E",
        }}
      >
        <Image
          source={event.image}
          contentFit="cover"
          transition={140}
          cachePolicy="memory-disk"
          recyclingKey={event.id}
          style={{ width: "100%", height: "100%" }}
        />
      </View>

      <View
        style={{
          marginTop: 10,
          flexDirection: "row",
          alignItems: "center",
          gap: 4,
        }}
      >
        <MaterialIcons name="location-on" size={14} color="#FF4D8D" />
        <Text
          numberOfLines={1}
          style={{
            flex: 1,
            fontFamily: ListifyFonts.medium,
            fontSize: 12,
            color: "rgba(255,255,255,0.72)",
            ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
          }}
        >
          {event.venue}
        </Text>
      </View>

      <Text
        numberOfLines={2}
        style={{
          marginTop: 4,
          fontFamily: ListifyFonts.bold,
          fontSize: 16,
          lineHeight: 20,
          color: "#FFFFFF",
          ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
        }}
      >
        {event.title}
      </Text>

      <Text
        numberOfLines={1}
        style={{
          marginTop: 4,
          fontFamily: ListifyFonts.regular,
          fontSize: 12,
          color: "rgba(255,255,255,0.55)",
          ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
        }}
      >
        {formatEventDisplayLabel({
          eventDate: event.eventDate,
          eventTime: event.eventTime,
        })}
      </Text>
    </Pressable>
  );
}

export const EventsDistrictCard = memo(EventsDistrictCardImpl);

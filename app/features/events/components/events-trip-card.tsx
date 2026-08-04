import { MaterialIcons } from "@expo/vector-icons";
import { memo } from "react";
import { Platform, Pressable, Text, View } from "react-native";

import { ListifyFonts } from "@/constants/typography";
import type { EventsTripDummy } from "@/features/events/data/events-hub-discovery";
import { Image } from "@/lib/nativewind-interop";

type EventsTripCardProps = {
  event: EventsTripDummy;
  cardWidth: number;
  isSaved: boolean;
  onPress?: () => void;
  onToggleSave?: () => void;
};

function EventsTripCardImpl({
  event,
  cardWidth,
  isSaved,
  onPress,
  onToggleSave,
}: EventsTripCardProps) {
  const imageHeight = cardWidth * 1.28;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        width: cardWidth,
        opacity: pressed ? 0.94 : 1,
      })}
    >
      <View
        style={{
          height: imageHeight,
          borderRadius: 20,
          overflow: "hidden",
          backgroundColor: "#2A2A2E",
        }}
      >
        <Image
          source={event.image}
          contentFit="cover"
          transition={160}
          cachePolicy="memory-disk"
          recyclingKey={event.id}
          style={{ width: "100%", height: "100%" }}
        />

        {event.badge ? (
          <View
            style={{
              position: "absolute",
              top: 12,
              left: 12,
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: 999,
              backgroundColor: "#FF4D8D",
            }}
          >
            <MaterialIcons name="flight" size={13} color="#FFFFFF" />
            <Text
              style={{
                fontFamily: ListifyFonts.semiBold,
                fontSize: 11,
                color: "#FFFFFF",
                ...(Platform.OS === "android"
                  ? { includeFontPadding: false }
                  : {}),
              }}
            >
              {event.badge}
            </Text>
          </View>
        ) : null}

        <Pressable
          onPress={(e) => {
            e.stopPropagation();
            onToggleSave?.();
          }}
          hitSlop={8}
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            width: 34,
            height: 34,
            borderRadius: 17,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(0,0,0,0.45)",
          }}
        >
          <MaterialIcons
            name={isSaved ? "bookmark" : "bookmark-border"}
            size={18}
            color="#FFFFFF"
          />
        </Pressable>
      </View>

      <Text
        numberOfLines={2}
        style={{
          marginTop: 10,
          fontFamily: ListifyFonts.bold,
          fontSize: 16,
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
        {event.venue}
      </Text>
    </Pressable>
  );
}

export const EventsTripCard = memo(EventsTripCardImpl);

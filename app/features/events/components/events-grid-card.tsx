import { MaterialIcons } from "@expo/vector-icons";
import { memo } from "react";
import { Platform, Pressable, Text, View } from "react-native";

import { ListifyFonts } from "@/constants/typography";
import type { FeaturedEventDummy } from "@/features/events/data/events-discovery";
import { formatEventDisplayLabel } from "@/lib/event-dates";
import { Image } from "@/lib/nativewind-interop";
import { useTheme } from "@/providers/theme-provider";

export type EventsGridCardProps = {
  event: FeaturedEventDummy;
  cardWidth: number;
  isSaved: boolean;
  onPress: () => void;
  onToggleSave: () => void;
};

function EventsGridCardImpl({
  event,
  cardWidth,
  isSaved,
  onPress,
  onToggleSave,
}: EventsGridCardProps) {
  const { colors, isDark } = useTheme();
  const imageHeight = cardWidth * 1.35;
  const dateLabel = formatEventDisplayLabel({
    eventDate: event.eventDate,
    eventTime: event.eventTime,
  });

  return (
    <Pressable onPress={onPress} style={{ width: cardWidth }}>
      <View
        style={{
          height: imageHeight,
          borderRadius: 14,
          overflow: "hidden",
          backgroundColor: colors.surfaceMuted,
        }}
      >
        <Image
          source={event.image}
          contentFit="cover"
          transition={140}
          cachePolicy="memory-disk"
          recyclingKey={event.image}
          style={{ width: "100%", height: "100%" }}
        />

        <Pressable
          onPress={(e) => {
            e.stopPropagation();
            onToggleSave();
          }}
          hitSlop={8}
          style={{
            position: "absolute",
            top: 10,
            right: 10,
            width: 30,
            height: 30,
            borderRadius: 8,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: isDark
              ? "rgba(0,0,0,0.5)"
              : "rgba(255,255,255,0.92)",
          }}
        >
          <MaterialIcons
            name={isSaved ? "bookmark" : "bookmark-border"}
            size={17}
            color={isDark ? "#FFFFFF" : "#111827"}
          />
        </Pressable>
      </View>

      <Text
        numberOfLines={2}
        style={{
          marginTop: 8,
          fontFamily: ListifyFonts.bold,
          fontSize: 14,
          lineHeight: 18,
          color: colors.textPrimary,
          ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
        }}
      >
        {event.title}
      </Text>

      {dateLabel ? (
        <Text
          numberOfLines={1}
          style={{
            marginTop: 4,
            fontFamily: ListifyFonts.regular,
            fontSize: 12,
            color: colors.textSecondary,
            ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
          }}
        >
          {dateLabel}
        </Text>
      ) : null}

      {event.venue ? (
        <Text
          numberOfLines={1}
          style={{
            marginTop: 2,
            fontFamily: ListifyFonts.regular,
            fontSize: 12,
            color: colors.textSecondary,
            ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
          }}
        >
          {event.venue}
        </Text>
      ) : null}
    </Pressable>
  );
}

export const EventsGridCard = memo(EventsGridCardImpl);

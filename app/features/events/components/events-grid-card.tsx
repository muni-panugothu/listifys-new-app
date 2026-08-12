import { MaterialIcons } from "@expo/vector-icons";
import { memo } from "react";
import { Platform, Pressable, Text, View } from "react-native";

import { ListifyFonts } from "@/constants/typography";
import { EventListingMedia } from "@/features/events/components/event-listing-media";
import type { ListingItem } from "@/features/listing/services/listing-api";
import { formatEventDisplayLabel } from "@/lib/event-dates";import { useEventsTheme } from "@/features/events/theme/events-theme";
import { useTheme } from "@/providers/theme-provider";

export type EventsGridCardProps = {
  event: ListingItem;
  cardWidth: number;
  isSaved: boolean;
  isMediaActive?: boolean;
  onPress: () => void;
  onToggleSave: () => void;
};

function EventsGridCardImpl({
  event,
  cardWidth,
  isSaved,
  isMediaActive = false,
  onPress,
  onToggleSave,
}: EventsGridCardProps) {
  const { colors } = useTheme();
  const { bookmarkBg, bookmarkIcon } = useEventsTheme();
  const imageHeight = cardWidth * 1.35;
  const venue =
    ((event as { venue?: string }).venue as string | undefined)?.trim() ||
    event.location?.trim() ||
    "";
  const dateLabel = formatEventDisplayLabel({
    eventDate: (event.eventDate as string | undefined) ?? "",
    eventTime: (event.eventTime as string | undefined) ?? "",
    startDate: event.startDate as string | undefined,
    endDate: event.endDate as string | undefined,
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
        <EventListingMedia
          listing={event}
          recyclingKey={`grid-${event._id}`}
          isActive={isMediaActive}
          autoPlay={isMediaActive}
          loop={isMediaActive}
          muted
          style={{ width: "100%", height: "100%" }}
          placeholderIconSize={32}
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
            backgroundColor: bookmarkBg,
          }}
        >
          <MaterialIcons
            name={isSaved ? "bookmark" : "bookmark-border"}
            size={17}
            color={bookmarkIcon}
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

      {venue ? (
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
          {venue}
        </Text>
      ) : null}
    </Pressable>
  );
}

export const EventsGridCard = memo(EventsGridCardImpl);

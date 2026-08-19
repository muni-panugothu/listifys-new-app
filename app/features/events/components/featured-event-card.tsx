import { MaterialIcons } from "@expo/vector-icons";
import { memo } from "react";
import { Platform, Pressable, Text, View } from "react-native";

import { ListifyFonts } from "@/constants/typography";
import { EventListingMedia } from "@/features/events/components/event-listing-media";
import {
  getComedyCategoryLabel,
  getEventDurationLabel,
} from "@/features/events/data/comedy-event-meta";
import type { ListingItem } from "@/features/listing/services/listing-api";
import { formatEventDisplayLabel } from "@/lib/event-dates";
import { useEventsTheme } from "@/features/events/theme/events-theme";
import { useTheme } from "@/providers/theme-provider";

export type FeaturedEventCardProps = {
  event: ListingItem;
  cardWidth: number;
  isSaved: boolean;
  offerLabel?: string | null;
  /** carousel ≈ 3:4 poster; feed is shorter for full-width rows */
  variant?: "carousel" | "feed";
  onPress: () => void;
  onToggleSave: () => void;
};

function FeaturedEventCardImpl({
  event,
  cardWidth,
  isSaved,
  offerLabel,
  variant = "carousel",
  onPress,
  onToggleSave,
}: FeaturedEventCardProps) {
  const { colors } = useTheme();
  const { bookmarkBg, bookmarkIcon } = useEventsTheme();
  // Reference comedy posters are tall ~3:4
  const imageHeight = cardWidth * (variant === "feed" ? 0.72 : 1.35);
  const venue =
    ((event as { venue?: string }).venue as string | undefined)?.trim() ||
    event.location?.trim() ||
    "";
  const eventDate = (event as { eventDate?: string }).eventDate ?? "";
  const eventTime = (event as { eventTime?: string }).eventTime ?? "";
  const startDate = (event as { startDate?: string }).startDate;
  const endDate = (event as { endDate?: string }).endDate;
  const dateLabel = formatEventDisplayLabel({
    eventDate,
    eventTime,
    startDate,
    endDate,
    startTime: (event as { startTime?: string }).startTime,
    endTime: (event as { endTime?: string }).endTime,
  });
  const comedyCategory = getComedyCategoryLabel(event);
  const eventDuration = getEventDurationLabel(event);

  return (
    <Pressable onPress={onPress} style={{ width: cardWidth }}>
      <View
        style={{
          height: imageHeight,
          borderRadius: 16,
          overflow: "hidden",
          backgroundColor: colors.surfaceMuted,
        }}
      >
        <EventListingMedia
          listing={event}
          recyclingKey={`featured-${event._id}`}
          loop
          muted
          style={{ width: "100%", height: "100%" }}
          placeholderIconSize={40}
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
            width: 32,
            height: 32,
            borderRadius: 8,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: bookmarkBg,
          }}
        >
          <MaterialIcons
            name={isSaved ? "bookmark" : "bookmark-border"}
            size={18}
            color={bookmarkIcon}
          />
        </Pressable>
      </View>

      {venue ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 3,
            marginTop: 10,
            paddingRight: 2,
          }}
        >
          <MaterialIcons name="location-on" size={14} color="#E91E8C" />
          <Text
            numberOfLines={1}
            style={{
              flex: 1,
              fontFamily: ListifyFonts.regular,
              fontSize: 12,
              color: colors.textPrimary,
              ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
            }}
          >
            {venue}
          </Text>
        </View>
      ) : null}

      <Text
        numberOfLines={2}
        style={{
          marginTop: 4,
          fontFamily: ListifyFonts.bold,
          fontSize: 16,
          lineHeight: 21,
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

      {comedyCategory ? (
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
          Category: {comedyCategory}
        </Text>
      ) : null}

      {eventDuration ? (
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
          Duration: {eventDuration}
        </Text>
      ) : null}

      {offerLabel ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            marginTop: 6,
          }}
        >
          <MaterialIcons name="local-offer" size={14} color={colors.primary} />
          <Text
            numberOfLines={1}
            style={{
              fontFamily: ListifyFonts.semiBold,
              fontSize: 12,
              color: colors.primary,
              ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
            }}
          >
            {offerLabel}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export const FeaturedEventCard = memo(
  FeaturedEventCardImpl,
  (prev, next) =>
    prev.event._id === next.event._id &&
    prev.isSaved === next.isSaved &&
    prev.cardWidth === next.cardWidth &&
    prev.offerLabel === next.offerLabel &&
    prev.variant === next.variant,
);

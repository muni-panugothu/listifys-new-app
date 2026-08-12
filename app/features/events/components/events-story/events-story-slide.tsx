import { MaterialIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { memo } from "react";
import { Dimensions, Platform, Pressable, Share, Text, View } from "react-native";

import { ListifyFonts } from "@/constants/typography";
import {
  EventListingMedia,
  getEventMediaPosterUrl,
  getEventPrimaryMedia,
} from "@/features/events/components/event-listing-media";
import {
  buildEventDateAccent,
  buildEventPriceLabel,
} from "@/features/events/utils/event-detail-helpers";
import type { ListingItem } from "@/features/listing/services/listing-api";
import { Image } from "@/lib/nativewind-interop";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const CARD_WIDTH = SCREEN_WIDTH * 0.82;
const CARD_HEIGHT = Math.min(SCREEN_HEIGHT * 0.52, CARD_WIDTH * 1.18);

export type EventsStorySlideProps = {
  event: ListingItem;
  isSaved: boolean;
  isoCountryCode?: string | null;
  isActive?: boolean;
  isPaused?: boolean;
  onToggleSave: () => void;
  onVideoEnded?: () => void;
  onVideoProgress?: (progress: number, durationSec: number) => void;
};

function buildVenueLabel(event: ListingItem): string {
  const venue = ((event as { venue?: string }).venue as string | undefined)?.trim();
  const location = event.location?.trim();
  if (venue && location && !venue.includes(location.split(",")[0] ?? "")) {
    return `${venue} | ${location}`;
  }
  return venue || location || "Venue to be announced";
}

function EventsStorySlideImpl({
  event,
  isSaved,
  isoCountryCode,
  isActive = false,
  isPaused = false,
  onToggleSave,
  onVideoEnded,
  onVideoProgress,
}: EventsStorySlideProps) {
  const primaryMedia = getEventPrimaryMedia(event);
  const posterUrl = getEventMediaPosterUrl(event);
  const isVideo = primaryMedia?.type === "video";
  const dateLabel = buildEventDateAccent(event);
  const priceLabel = buildEventPriceLabel(event, isoCountryCode);
  const venueLabel = buildVenueLabel(event);

  const handleShare = async () => {
    try {
      await Share.share({
        message: `${event.title}\n${venueLabel}`,
      });
    } catch {
      /* ignore */
    }
  };

  return (
    <View style={{ flex: 1, justifyContent: "space-between" }}>
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        {posterUrl ? (
          <>
            <Image
              source={posterUrl}
              contentFit="cover"
              blurRadius={Platform.OS === "ios" ? 28 : 0}
              transition={180}
              cachePolicy="memory-disk"
              recyclingKey={`${event._id}-story-bg`}
              style={{
                position: "absolute",
                width: SCREEN_WIDTH * 1.2,
                height: SCREEN_HEIGHT * 0.72,
                opacity: Platform.OS === "ios" ? 0.42 : 0.28,
                transform: [{ scale: 1.15 }],
              }}
            />
            {Platform.OS === "android" ? (
              <View
                style={{
                  position: "absolute",
                  width: SCREEN_WIDTH * 1.2,
                  height: SCREEN_HEIGHT * 0.72,
                  backgroundColor: "rgba(0,0,0,0.55)",
                }}
              />
            ) : null}
          </>
        ) : null}

        <View
          style={{
            width: CARD_WIDTH,
            height: CARD_HEIGHT,
            borderRadius: 22,
            overflow: "hidden",
            backgroundColor: "rgba(255,255,255,0.06)",
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 16 },
            shadowOpacity: 0.45,
            shadowRadius: 24,
            elevation: 14,
          }}
        >
          <EventListingMedia
            listing={event}
            recyclingKey={`${event._id}-story-fg`}
            isActive={isActive}
            autoPlay={isActive}
            paused={isPaused}
            muted
            onVideoEnded={onVideoEnded}
            onVideoProgress={onVideoProgress}
            placeholderIconSize={48}
            style={{ width: "100%", height: "100%" }}
          />

          {isVideo ? (
            <View
              style={{
                position: "absolute",
                bottom: 14,
                left: 14,
                width: 34,
                height: 34,
                borderRadius: 17,
                backgroundColor: "rgba(0,0,0,0.45)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <MaterialIcons name="volume-off" size={18} color="#FFFFFF" />
            </View>
          ) : null}
        </View>
      </View>

      <LinearGradient
        colors={["transparent", "rgba(0,0,0,0.55)", "rgba(0,0,0,0.92)"]}
        style={{
          paddingHorizontal: 22,
          paddingTop: 28,
          paddingBottom: 8,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <Text
            numberOfLines={2}
            style={{
              flex: 1,
              fontFamily: ListifyFonts.bold,
              fontSize: 26,
              lineHeight: 32,
              color: "#FFFFFF",
              ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
            }}
          >
            {event.title}
          </Text>

          <View style={{ flexDirection: "row", gap: 10, paddingTop: 4 }}>
            <Pressable
              onPress={onToggleSave}
              hitSlop={8}
              style={{
                width: 42,
                height: 42,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.35)",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "rgba(0,0,0,0.25)",
              }}
            >
              <MaterialIcons
                name={isSaved ? "bookmark" : "bookmark-border"}
                size={22}
                color="#FFFFFF"
              />
            </Pressable>
            <Pressable
              onPress={() => void handleShare()}
              hitSlop={8}
              style={{
                width: 42,
                height: 42,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.35)",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "rgba(0,0,0,0.25)",
              }}
            >
              <MaterialIcons
                name={Platform.OS === "ios" ? "ios-share" : "share"}
                size={20}
                color="#FFFFFF"
              />
            </Pressable>
          </View>
        </View>

        {dateLabel ? (
          <Text
            numberOfLines={2}
            style={{
              marginTop: 10,
              fontFamily: ListifyFonts.medium,
              fontSize: 14,
              color: "rgba(255,255,255,0.82)",
            }}
          >
            {dateLabel}
          </Text>
        ) : null}

        <Text
          numberOfLines={2}
          style={{
            marginTop: 6,
            fontFamily: ListifyFonts.regular,
            fontSize: 14,
            color: "rgba(255,255,255,0.72)",
          }}
        >
          {venueLabel}
        </Text>

        <Text
          style={{
            marginTop: 6,
            fontFamily: ListifyFonts.semiBold,
            fontSize: 14,
            color: "rgba(255,255,255,0.88)",
          }}
        >
          {priceLabel}
        </Text>
      </LinearGradient>
    </View>
  );
}

export const EventsStorySlide = memo(EventsStorySlideImpl);

import { MaterialIcons } from "@expo/vector-icons";
import { memo } from "react";
import { Platform, Pressable, Text, View } from "react-native";

import { ListifyFonts } from "@/constants/typography";
import type { ListingItem } from "@/features/listing/services/listing-api";
import { formatEventDisplayLabel } from "@/lib/event-dates";
import { Image } from "@/lib/nativewind-interop";
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
  });

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
        {event.images?.[0] ? (
          <Image
            source={event.images[0]}
            contentFit="cover"
            transition={140}
            cachePolicy="memory-disk"
            recyclingKey={event.images[0]}
            style={{ width: "100%", height: "100%" }}
          />
        ) : (
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <MaterialIcons name="event" size={40} color={colors.iconMuted} />
          </View>
        )}

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
            backgroundColor: "rgba(0,0,0,0.55)",
          }}
        >
          <MaterialIcons
            name={isSaved ? "bookmark" : "bookmark-border"}
            size={18}
            color="#FFFFFF"
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

export const FeaturedEventCard = memo(FeaturedEventCardImpl);

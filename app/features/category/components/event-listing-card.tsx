import { MaterialIcons } from "@expo/vector-icons";
import { memo } from "react";
import { Pressable, Text, View } from "react-native";

import { ListifyFonts } from "@/constants/typography";
import { EventListingMedia } from "@/features/events/components/event-listing-media";
import type { ListingItem } from "@/features/listing/services/listing-api";
import { formatEventDisplayLabel } from "@/lib/event-dates";
import { useTheme } from "@/providers/theme-provider";

type EventListingCardProps = {
  event: ListingItem;
  priceLabel: string;
  isSaved: boolean;
  onPress: () => void;
  onToggleSave: () => void;
};

function EventListingCardImpl({
  event,
  priceLabel,
  isSaved,
  onPress,
  onToggleSave,
}: EventListingCardProps) {
  const { colors, isDark } = useTheme();
  const eventDate = (event as { eventDate?: string }).eventDate ?? "";
  const eventTime = (event as { eventTime?: string }).eventTime ?? "";
  const startDate = (event as { startDate?: string }).startDate;
  const endDate = (event as { endDate?: string }).endDate;
  const dateLabel = formatEventDisplayLabel({ eventDate, eventTime, startDate, endDate });
  const featured = (event as { featured?: boolean }).featured;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        overflow: "hidden",
        borderRadius: 12,
        backgroundColor: isDark ? colors.surfaceElevated : colors.surface,
        opacity: pressed ? 0.97 : 1,
        borderWidth: 1,
        borderColor: colors.border,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: isDark ? 0.28 : 0.06,
        shadowRadius: 6,
        elevation: 2,
      })}
    >
      <View
        style={{
          position: "relative",
          height: 224,
          width: "100%",
          overflow: "hidden",
          backgroundColor: colors.surfaceMuted,
        }}
      >
        <EventListingMedia
          listing={event}
          recyclingKey={`listing-${event._id}`}
          loop
          muted
          style={{ height: "100%", width: "100%" }}
          placeholderIconSize={44}
        />
        {featured ? (
          <View
            style={{
              position: "absolute",
              left: 12,
              top: 12,
              borderRadius: 999,
              backgroundColor: colors.primary,
              paddingHorizontal: 12,
              paddingVertical: 4,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.2,
              shadowRadius: 4,
              elevation: 4,
            }}
          >
            <Text
              style={{
                fontSize: 10,
                textTransform: "uppercase",
                color: colors.textOnPrimary,
                fontFamily: ListifyFonts.bold,
                letterSpacing: 1.5,
              }}
            >
              Trending
            </Text>
          </View>
        ) : null}
        <Pressable
          onPress={onToggleSave}
          style={{
            position: "absolute",
            right: 12,
            top: 12,
            height: 40,
            width: 40,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 20,
            backgroundColor: isDark ? "rgba(22,26,31,0.75)" : "rgba(255,255,255,0.7)",
            borderWidth: 1,
            borderColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.5)",
          }}
        >
          <MaterialIcons
            name={isSaved ? "favorite" : "favorite-border"}
            size={20}
            color={isSaved ? "#BA1A1A" : colors.textPrimary}
          />
        </Pressable>
      </View>

      <View style={{ padding: 16 }}>
        {dateLabel ? (
          <View style={{ marginBottom: 4, flexDirection: "row", alignItems: "center", gap: 4 }}>
            <MaterialIcons name="schedule" size={14} color={colors.primary} />
            <Text
              style={{
                fontSize: 12,
                color: colors.primary,
                fontFamily: ListifyFonts.medium,
              }}
            >
              {dateLabel}
            </Text>
          </View>
        ) : null}
        <Text
          numberOfLines={2}
          style={{
            marginBottom: 4,
            fontSize: 18,
            color: colors.textPrimary,
            fontFamily: ListifyFonts.semiBold,
            lineHeight: 24,
          }}
        >
          {event.title}
        </Text>
        {event.location ? (
          <View style={{ marginBottom: 16, flexDirection: "row", alignItems: "center", gap: 4 }}>
            <MaterialIcons name="location-on" size={15} color={colors.iconMuted} />
            <Text
              numberOfLines={1}
              style={{
                flex: 1,
                fontSize: 14,
                color: colors.textSecondary,
                fontFamily: ListifyFonts.regular,
              }}
            >
              {event.location}
            </Text>
          </View>
        ) : (
          <View style={{ marginBottom: 16 }} />
        )}
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-end",
            justifyContent: "space-between",
            paddingTop: 12,
            borderTopWidth: 1,
            borderTopColor: colors.border,
          }}
        >
          <View>
            <Text
              style={{
                fontSize: 12,
                color: colors.textSecondary,
                fontFamily: ListifyFonts.medium,
              }}
            >
              Entry Price
            </Text>
            <Text
              style={{
                fontSize: 16,
                color: colors.textPrimary,
                fontFamily: ListifyFonts.bold,
              }}
            >
              {priceLabel}
            </Text>
          </View>
          <Pressable
            onPress={onPress}
            style={({ pressed }) => ({
              borderRadius: 8,
              backgroundColor: colors.primary,
              paddingHorizontal: 24,
              paddingVertical: 8,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text
              style={{
                fontSize: 12,
                color: colors.textOnPrimary,
                fontFamily: ListifyFonts.semiBold,
              }}
            >
              Book Now
            </Text>
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

export const EventListingCard = memo(EventListingCardImpl);

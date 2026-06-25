import { MaterialIcons } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";

import { ListifyFonts } from "@/constants/typography";
import type { ListingItem } from "@/features/listing/services/listing-api";
import { Image } from "@/lib/nativewind-interop";

function formatEventDate(dateStr?: string, timeStr?: string): string {
  const parts: string[] = [];
  if (dateStr) {
    try {
      const d = new Date(dateStr);
      parts.push(
        d.toLocaleDateString("en-IN", { month: "short", day: "numeric" }),
      );
    } catch {
      parts.push(dateStr);
    }
  }
  if (timeStr) parts.push(timeStr);
  return parts.join(" • ");
}

type EventListingCardProps = {
  event: ListingItem;
  priceLabel: string;
  isSaved: boolean;
  onPress: () => void;
  onToggleSave: () => void;
};

export function EventListingCard({
  event,
  priceLabel,
  isSaved,
  onPress,
  onToggleSave,
}: EventListingCardProps) {
  const eventDate = (event as { eventDate?: string }).eventDate ?? "";
  const eventTime = (event as { eventTime?: string }).eventTime ?? "";
  const dateLabel = formatEventDate(eventDate, eventTime);
  const featured = (event as { featured?: boolean }).featured;

  return (
    <Pressable
      onPress={onPress}
      className="overflow-hidden rounded-xl bg-white"
      style={({ pressed }) => ({
        opacity: pressed ? 0.97 : 1,
        borderWidth: 1,
        borderColor: "#F1F5F9",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
        elevation: 2,
      })}
    >
      {/* Image Section */}
      <View className="relative h-56 w-full overflow-hidden bg-[#F3F4F6]">
        {event.images?.[0] ? (
          <Image
            source={event.images[0]}
            contentFit="cover"
            transition={120}
            cachePolicy="memory-disk"
            recyclingKey={event.images[0]}
            className="h-full w-full"
          />
        ) : (
          <View className="h-full w-full items-center justify-center">
            <MaterialIcons name="event" size={44} color="#D1D5DB" />
          </View>
        )}
        {/* Trending badge */}
        {featured ? (
          <View
            className="absolute left-3 top-3 rounded-full bg-[#27BB97] px-3 py-1"
            style={{
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.2,
              shadowRadius: 4,
              elevation: 4,
            }}
          >
            <Text
              className="text-[10px] uppercase text-white"
              style={{ fontFamily: ListifyFonts.bold, letterSpacing: 1.5 }}
            >
              Trending
            </Text>
          </View>
        ) : null}
        {/* Save / Favourite button */}
        <Pressable
          onPress={onToggleSave}
          className="absolute right-3 top-3 h-10 w-10 items-center justify-center rounded-full bg-white/70"
          style={{
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.5)",
          }}
        >
          <MaterialIcons
            name={isSaved ? "favorite" : "favorite-border"}
            size={20}
            color={isSaved ? "#BA1A1A" : "#161D1A"}
          />
        </Pressable>
      </View>

      {/* Content Section */}
      <View className="p-4">
        {/* Date & time */}
        {dateLabel ? (
          <View className="mb-1 flex-row items-center gap-1">
            <MaterialIcons name="schedule" size={14} color="#27BB97" />
            <Text
              className="text-[12px] text-[#27BB97]"
              style={{ fontFamily: ListifyFonts.medium }}
            >
              {dateLabel}
            </Text>
          </View>
        ) : null}
        {/* Title */}
        <Text
          numberOfLines={2}
          className="mb-1 text-[18px] text-[#161D1A]"
          style={{ fontFamily: ListifyFonts.semiBold, lineHeight: 24 }}
        >
          {event.title}
        </Text>
        {/* Location */}
        {event.location ? (
          <View className="mb-4 flex-row items-center gap-1">
            <MaterialIcons name="location-on" size={15} color="#6C7A74" />
            <Text
              numberOfLines={1}
              className="flex-1 text-[14px] text-[#6C7A74]"
              style={{ fontFamily: ListifyFonts.regular }}
            >
              {event.location}
            </Text>
          </View>
        ) : (
          <View className="mb-4" />
        )}
        {/* Price row + Book Now button */}
        <View
          className="flex-row items-end justify-between pt-3"
          style={{ borderTopWidth: 1, borderTopColor: "#F8FAFC" }}
        >
          <View>
            <Text
              className="text-[12px] text-[#6C7A74]"
              style={{ fontFamily: ListifyFonts.medium }}
            >
              Entry Price
            </Text>
            <Text
              className="text-[16px] text-[#161D1A]"
              style={{ fontFamily: ListifyFonts.bold }}
            >
              {priceLabel}
            </Text>
          </View>
          <Pressable
            onPress={onPress}
            className="rounded-lg bg-[#27BB97] px-6 py-2"
            style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
          >
            <Text
              className="text-[12px] text-white"
              style={{ fontFamily: ListifyFonts.semiBold }}
            >
              Book Now
            </Text>
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

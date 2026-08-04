import { MaterialIcons } from "@expo/vector-icons";
import { memo } from "react";
import { Platform, Pressable, Text, View } from "react-native";

import { ListifyFonts } from "@/constants/typography";
import type { EventsArtistItem } from "@/features/events/data/events-discovery";
import { Image } from "@/lib/nativewind-interop";
import { useTheme } from "@/providers/theme-provider";

const AVATAR_SIZE = 88;

export type EventsArtistCardProps = {
  artist: EventsArtistItem;
  cardWidth: number;
  isSaved: boolean;
  onPress: () => void;
  onToggleSave: () => void;
};

function EventsArtistCardImpl({
  artist,
  cardWidth,
  isSaved,
  onPress,
  onToggleSave,
}: EventsArtistCardProps) {
  const { colors, isDark } = useTheme();
  const cardBg = isDark ? "#1C1C1E" : colors.surfaceMuted;

  return (
    <Pressable
      onPress={onPress}
      style={{ width: cardWidth, paddingTop: AVATAR_SIZE / 2 }}
    >
      <View
        style={{
          borderRadius: 22,
          backgroundColor: cardBg,
          paddingTop: AVATAR_SIZE / 2 + 12,
          paddingBottom: 16,
          paddingHorizontal: 14,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: isDark ? 0.35 : 0.08,
          shadowRadius: 10,
          elevation: 4,
        }}
      >
        <View
          style={{
            position: "absolute",
            alignSelf: "center",
            top: -AVATAR_SIZE / 2,
            left: cardWidth / 2 - AVATAR_SIZE / 2,
            width: AVATAR_SIZE,
            height: AVATAR_SIZE,
            borderRadius: AVATAR_SIZE / 2,
            overflow: "hidden",
            borderWidth: 3,
            borderColor: cardBg,
            backgroundColor: colors.surfaceMuted,
          }}
        >
          <Image
            source={artist.avatar}
            contentFit="cover"
            transition={140}
            cachePolicy="memory-disk"
            recyclingKey={artist.avatar}
            style={{ width: "100%", height: "100%" }}
          />
        </View>

        <Pressable
          onPress={(e) => {
            e.stopPropagation();
            onToggleSave();
          }}
          hitSlop={10}
          style={{
            position: "absolute",
            right: 12,
            top: 12,
            width: 32,
            height: 32,
            borderRadius: 16,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: isDark ? "rgba(0,0,0,0.55)" : colors.surface,
          }}
        >
          <MaterialIcons
            name={isSaved ? "bookmark" : "bookmark-border"}
            size={18}
            color={isSaved ? colors.primary : colors.icon}
          />
        </Pressable>

        <Text
          numberOfLines={1}
          style={{
            marginTop: 4,
            fontFamily: ListifyFonts.bold,
            fontSize: 18,
            textAlign: "center",
            color: colors.textPrimary,
            ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
          }}
        >
          {artist.name}
        </Text>

        <Text
          numberOfLines={1}
          style={{
            marginTop: 2,
            fontFamily: ListifyFonts.regular,
            fontSize: 13,
            textAlign: "center",
            color: colors.textSecondary,
            ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
          }}
        >
          {artist.profession}
        </Text>

        <View
          style={{
            marginTop: 14,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 4,
          }}
        >
          {artist.stats.map((stat, idx) => (
            <View
              key={`${stat.icon}-${idx}`}
              style={{
                flex: 1,
                alignItems: "center",
                borderRightWidth: idx < artist.stats.length - 1 ? 1 : 0,
                borderRightColor: colors.border,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <MaterialIcons name={stat.icon} size={15} color={colors.icon} />
                <Text
                  numberOfLines={1}
                  style={{
                    fontFamily: ListifyFonts.semiBold,
                    fontSize: 12,
                    color: colors.textPrimary,
                    ...(Platform.OS === "android"
                      ? { includeFontPadding: false }
                      : {}),
                  }}
                >
                  {stat.value}
                </Text>
              </View>
            </View>
          ))}
        </View>

        <Text
          numberOfLines={1}
          style={{
            marginTop: 14,
            fontFamily: ListifyFonts.regular,
            fontSize: 13,
            textAlign: "center",
            color: colors.textPrimary,
            ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
          }}
        >
          {artist.eventDate}
        </Text>
      </View>
    </Pressable>
  );
}

export const EventsArtistCard = memo(EventsArtistCardImpl);

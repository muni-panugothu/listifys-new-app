/**
 * LocationSuggestionItem
 *
 * Renders a single row in the location autocomplete list.
 */
import { MaterialIcons } from "@expo/vector-icons";
import { memo } from "react";
import { Pressable, Text, View } from "react-native";

import { HighlightedText } from "@/components/highlighted-text";
import { ListifyFonts } from "@/constants/typography";
import type { MatchedSubstring, PlacePrediction, RecentLocation } from "@/lib/google-places.service";
import { useTheme } from "@/providers/theme-provider";

type PredictionItemProps = {
  prediction: PlacePrediction;
  onPress: (prediction: PlacePrediction) => void;
  isLast: boolean;
};

export const PlacePredictionItem = memo(function PlacePredictionItem({
  prediction,
  onPress,
  isLast,
}: PredictionItemProps) {
  const { colors } = useTheme();
  const { main_text, secondary_text, main_text_matched_substrings } =
    prediction.structured_formatting;

  return (
    <Pressable
      onPress={() => onPress(prediction)}
      android_ripple={{ color: colors.primarySoft, borderless: false }}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingVertical: 13,
        backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: colors.border,
      })}
    >
      <IconCircle icon="location-on" color={colors.primary} bg={colors.primarySoftStrong} />

      <View style={{ flex: 1, gap: 3 }}>
        <HighlightedText
          text={main_text}
          matchedSubstrings={main_text_matched_substrings as MatchedSubstring[]}
          style={{ fontSize: 14.5, lineHeight: 20 }}
          numberOfLines={1}
        />
        {secondary_text ? (
          <Text
            numberOfLines={1}
            style={{
              fontSize: 12,
              color: colors.textSecondary,
              fontFamily: ListifyFonts.regular,
              lineHeight: 17,
            }}
          >
            {secondary_text}
          </Text>
        ) : null}
      </View>

      <MaterialIcons
        name="north-west"
        size={15}
        color={colors.iconMuted}
        style={{ marginLeft: 10, flexShrink: 0 }}
      />
    </Pressable>
  );
});

type RecentItemProps = {
  item: RecentLocation;
  onPress: (item: RecentLocation) => void;
  isLast: boolean;
};

export const RecentLocationItem = memo(function RecentLocationItem({
  item,
  onPress,
  isLast,
}: RecentItemProps) {
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={() => onPress(item)}
      android_ripple={{ color: colors.surfaceMuted, borderless: false }}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingVertical: 13,
        backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: colors.border,
      })}
    >
      <IconCircle icon="history" color={colors.textSecondary} bg={colors.surfaceMuted} />

      <View style={{ flex: 1, gap: 3 }}>
        <Text
          numberOfLines={1}
          style={{
            fontSize: 14.5,
            fontFamily: ListifyFonts.medium,
            color: colors.textPrimary,
            lineHeight: 20,
          }}
        >
          {item.title}
        </Text>
        {item.subtitle ? (
          <Text
            numberOfLines={1}
            style={{
              fontSize: 12,
              color: colors.textSecondary,
              fontFamily: ListifyFonts.regular,
              lineHeight: 17,
            }}
          >
            {item.subtitle}
          </Text>
        ) : null}
      </View>

      <MaterialIcons
        name="north-west"
        size={15}
        color={colors.iconMuted}
        style={{ marginLeft: 10, flexShrink: 0 }}
      />
    </Pressable>
  );
});

function IconCircle({
  icon,
  color,
  bg,
}: {
  icon: React.ComponentProps<typeof MaterialIcons>["name"];
  color: string;
  bg: string;
}) {
  return (
    <View
      style={{
        width: 38,
        height: 38,
        borderRadius: 19,
        backgroundColor: bg,
        alignItems: "center",
        justifyContent: "center",
        marginRight: 13,
        flexShrink: 0,
      }}
    >
      <MaterialIcons name={icon} size={19} color={color} />
    </View>
  );
}

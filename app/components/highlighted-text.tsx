/**
 * HighlightedText
 *
 * Renders text with bold segments using Google's exact `matched_substrings`
 * offsets returned by the Places Autocomplete API.
 *
 * Falls back to a full regular-weight render if no substrings are provided.
 */
import { memo } from "react";
import { Text, type TextStyle } from "react-native";

import { ListifyFonts } from "@/constants/typography";
import { useTheme } from "@/providers/theme-provider";
import type { MatchedSubstring } from "@/lib/google-places.service";

type Props = {
  text: string;
  matchedSubstrings?: MatchedSubstring[];
  /** Base style applied to the outer Text wrapper. */
  style?: TextStyle;
  numberOfLines?: number;
};

type Segment = { text: string; bold: boolean };

function buildSegments(text: string, substrings: MatchedSubstring[]): Segment[] {
  if (!substrings.length) return [{ text, bold: false }];

  const sorted = [...substrings].sort((a, b) => a.offset - b.offset);
  const segments: Segment[] = [];
  let cursor = 0;

  for (const { offset, length } of sorted) {
    if (offset > cursor) {
      segments.push({ text: text.slice(cursor, offset), bold: false });
    }
    if (length > 0) {
      segments.push({ text: text.slice(offset, offset + length), bold: true });
    }
    cursor = Math.max(cursor, offset + length);
  }

  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), bold: false });
  }

  return segments.filter((s) => s.text.length > 0);
}

export const HighlightedText = memo(function HighlightedText({
  text,
  matchedSubstrings = [],
  style,
  numberOfLines = 1,
}: Props) {
  const { colors } = useTheme();
  const segments = buildSegments(text, matchedSubstrings);

  return (
    <Text numberOfLines={numberOfLines} style={style}>
      {segments.map((seg, i) => (
        <Text
          key={i}
          style={{
            fontFamily: seg.bold ? ListifyFonts.bold : ListifyFonts.regular,
            color: seg.bold ? colors.textPrimary : colors.textSecondary,
          }}
        >
          {seg.text}
        </Text>
      ))}
    </Text>
  );
});

import { MaterialIcons } from "@expo/vector-icons";
import { Text, View } from "react-native";

import { ListifyFonts } from "@/constants/typography";
import {
  getDynamicFieldsForEvent,
  resolveEventCategoryLabel,
  resolveEventTypeLabel,
} from "@/features/events/data/events-form-schema";
import { useTheme } from "@/providers/theme-provider";
import type { ListingItem } from "@/features/listing/services/listing-api";

type CategoryListing = ListingItem & {
  eventCategory?: string | null;
  eventType?: string | null;
  categoryData?: Record<string, unknown> | null;
  eventFormat?: string | null;
};

function formatValue(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value.trim() || null;
  if (Array.isArray(value)) return value.filter(Boolean).join(", ") || null;
  return null;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        gap: 12,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}
    >
      <Text
        style={{
          flex: 1,
          fontFamily: ListifyFonts.regular,
          fontSize: 14,
          color: colors.textSecondary,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          flex: 1.2,
          fontFamily: ListifyFonts.medium,
          fontSize: 14,
          color: colors.textPrimary,
          textAlign: "right",
        }}
      >
        {value}
      </Text>
    </View>
  );
}

export function EventCategoryDetailSections({ listing }: { listing: CategoryListing }) {
  const { colors } = useTheme();
  const eventCategory = listing.eventCategory;
  const eventType = listing.eventType;
  const categoryData = listing.categoryData ?? {};

  const mainLabel = resolveEventCategoryLabel(eventCategory);
  const typeLabel = resolveEventTypeLabel(eventCategory, eventType);
  const fields = getDynamicFieldsForEvent(eventCategory, eventType);

  const rows = fields
    .map((field) => {
      const raw = categoryData[field.key];
      const formatted = formatValue(raw);
      if (!formatted) return null;
      return { label: field.label, value: formatted };
    })
    .filter(Boolean) as Array<{ label: string; value: string }>;

  if (!mainLabel && rows.length === 0) return null;

  return (
    <View
      style={{
        marginTop: 20,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        paddingHorizontal: 16,
        paddingVertical: 4,
      }}
    >
      <View style={{ paddingVertical: 14 }}>
        <Text
          style={{
            fontFamily: ListifyFonts.bold,
            fontSize: 16,
            color: colors.textPrimary,
          }}
        >
          {mainLabel && typeLabel ? `${mainLabel} · ${typeLabel}` : "Event Details"}
        </Text>
      </View>
      {rows.map((row) => (
        <DetailRow key={row.label} label={row.label} value={row.value} />
      ))}
    </View>
  );
}

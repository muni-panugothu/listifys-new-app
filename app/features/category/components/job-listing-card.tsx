import { MaterialIcons } from "@expo/vector-icons";
import { memo } from "react";
import { Pressable, Text, View } from "react-native";

import { ListingTimeBadge } from "@/components/listing-time-badge";
import { ListifyFonts } from "@/constants/typography";
import type { ListingItem } from "@/features/listing/services/listing-api";
import { Image } from "@/lib/nativewind-interop";
import { useTheme } from "@/providers/theme-provider";

type JobListingCardProps = {
  job: ListingItem;
  salaryText: string;
  isSaved: boolean;
  onPress: () => void;
  onToggleSave: () => void;
};

function JobListingCardImpl({
  job,
  salaryText,
  isSaved,
  onPress,
  onToggleSave,
}: JobListingCardProps) {
  const { colors, isDark } = useTheme();
  const companyName = (job as { companyName?: string }).companyName ?? job.sellerName ?? "";
  const companyLogo = (job as { companyLogo?: string }).companyLogo ?? null;
  const jobType = (job as { jobType?: string }).jobType ?? "";
  const workMode = (job as { workMode?: string }).workMode ?? "";
  const isNew = job.createdAt
    ? Date.now() - new Date(job.createdAt).getTime() < 3 * 24 * 60 * 60 * 1000
    : false;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        overflow: "hidden",
        borderRadius: 16,
        backgroundColor: isDark ? colors.surfaceElevated : colors.surface,
        opacity: pressed ? 0.96 : 1,
        borderWidth: 1,
        borderColor: colors.border,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: isDark ? 0.28 : 0.06,
        shadowRadius: 8,
        elevation: 2,
      })}
    >
      <ListingTimeBadge
        date={job.createdAt}
        style={{ left: 12, top: 12, position: "absolute", zIndex: 3 }}
      />
      <View style={{ padding: 16 }}>
        <View style={{ marginBottom: 12, flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
          <View
            style={{
              height: 48,
              width: 48,
              overflow: "hidden",
              borderRadius: 12,
              backgroundColor: colors.surfaceMuted,
            }}
          >
            {companyLogo ? (
              <Image
                source={companyLogo}
                contentFit="cover"
                transition={120}
                cachePolicy="memory-disk"
                recyclingKey={companyLogo}
                style={{ height: "100%", width: "100%" }}
              />
            ) : (
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                <MaterialIcons name="business" size={22} color={colors.iconMuted} />
              </View>
            )}
          </View>
          <View style={{ minWidth: 0, flex: 1 }}>
            <Text
              numberOfLines={2}
              style={{
                fontSize: 17,
                color: colors.textPrimary,
                fontFamily: ListifyFonts.semiBold,
              }}
            >
              {job.title}
            </Text>
            {companyName ? (
              <Text
                style={{
                  marginTop: 2,
                  fontSize: 14,
                  color: colors.textSecondary,
                  fontFamily: ListifyFonts.regular,
                }}
              >
                {companyName}
              </Text>
            ) : null}
          </View>
          {isNew ? (
            <View
              style={{
                borderRadius: 6,
                backgroundColor: colors.primarySoft,
                paddingHorizontal: 8,
                paddingVertical: 4,
              }}
            >
              <Text
                style={{
                  fontSize: 10,
                  color: colors.primary,
                  fontFamily: ListifyFonts.bold,
                }}
              >
                NEW
              </Text>
            </View>
          ) : null}
        </View>

        {jobType || workMode || job.subcategory ? (
          <View style={{ marginBottom: 12, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {jobType ? (
              <View
                style={{
                  borderRadius: 999,
                  backgroundColor: colors.surfaceMuted,
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                }}
              >
                <Text
                  style={{
                    fontSize: 11,
                    color: colors.textSecondary,
                    fontFamily: ListifyFonts.medium,
                  }}
                >
                  {jobType}
                </Text>
              </View>
            ) : null}
            {workMode ? (
              <View
                style={{
                  borderRadius: 999,
                  backgroundColor: isDark ? "rgba(59,130,246,0.18)" : "#EFF6FF",
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                }}
              >
                <Text
                  style={{
                    fontSize: 11,
                    color: isDark ? "#93C5FD" : "#2563EB",
                    fontFamily: ListifyFonts.medium,
                  }}
                >
                  {workMode}
                </Text>
              </View>
            ) : null}
            {job.subcategory ? (
              <View
                style={{
                  borderRadius: 999,
                  backgroundColor: colors.primarySoft,
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                }}
              >
                <Text
                  style={{
                    fontSize: 11,
                    color: colors.primary,
                    fontFamily: ListifyFonts.medium,
                  }}
                >
                  {job.subcategory}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <Text
          style={{
            fontSize: 16,
            color: colors.textPrimary,
            fontFamily: ListifyFonts.bold,
          }}
        >
          {salaryText}
        </Text>
        {job.location ? (
          <View style={{ marginTop: 4, flexDirection: "row", alignItems: "center", gap: 4 }}>
            <MaterialIcons name="location-on" size={14} color={colors.iconMuted} />
            <Text
              numberOfLines={1}
              style={{
                flex: 1,
                fontSize: 13,
                color: colors.textTertiary,
                fontFamily: ListifyFonts.regular,
              }}
            >
              {job.location}
            </Text>
          </View>
        ) : null}

        <View style={{ marginTop: 16, flexDirection: "row", gap: 8 }}>
          <Pressable
            onPress={onPress}
            style={{
              flex: 1,
              alignItems: "center",
              borderRadius: 12,
              paddingVertical: 12,
              backgroundColor: colors.primary,
            }}
          >
            <Text
              style={{
                fontSize: 14,
                color: colors.textOnPrimary,
                fontFamily: ListifyFonts.semiBold,
              }}
            >
              View details
            </Text>
          </Pressable>
          <Pressable
            onPress={onToggleSave}
            style={{
              height: 48,
              width: 48,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.borderStrong,
              backgroundColor: colors.surface,
            }}
          >
            <MaterialIcons
              name={isSaved ? "bookmark" : "bookmark-border"}
              size={22}
              color={isSaved ? colors.primary : colors.textPrimary}
            />
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

export const JobListingCard = memo(JobListingCardImpl);

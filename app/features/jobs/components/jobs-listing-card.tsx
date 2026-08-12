import { MaterialIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { memo } from "react";
import { Platform, Pressable, Text, View } from "react-native";

import { ListifyFonts } from "@/constants/typography";
import { CompanyLogo } from "@/features/jobs/components/company-logo";
import { JOBS_BLUE, JOBS_UI_ICONS } from "@/features/jobs/data/jobs-discovery";
import {
  formatJobSalary,
  getCompanyDisplayName,
  getCompanyLocation,
  getJobApplicantCount,
  type JobListingExtras,
} from "@/features/jobs/utils/jobs-formatters";
import { Image } from "@/lib/nativewind-interop";
import { useTheme } from "@/providers/theme-provider";

type JobsListingCardProps = {
  job: JobListingExtras;
  isoCountryCode?: string | null;
  isSaved: boolean;
  onPress: () => void;
  onToggleSave: () => void;
};

function JobsListingCardImpl({
  job,
  isoCountryCode,
  isSaved,
  onPress,
  onToggleSave,
}: JobsListingCardProps) {
  const { colors, isDark } = useTheme();
  const companyName = getCompanyDisplayName(job);
  const location = getCompanyLocation(job);
  const salaryText = formatJobSalary(job, isoCountryCode);
  const workMode = job.workMode ?? "";
  const jobType = job.jobType ?? job.employmentType ?? "";
  const extraCount = [job.subcategory, jobType].filter(Boolean).length;
  const applicantCount = getJobApplicantCount(job);
  const isVerified = Boolean(
    (job.seller as { isVerified?: boolean } | undefined)?.isVerified,
  );

  const tagPills = [workMode || jobType, extraCount > 0 ? `+${extraCount}` : ""].filter(Boolean);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        borderRadius: 20,
        backgroundColor: isDark ? colors.surfaceElevated : "#FFFFFF",
        transform: [{ scale: pressed ? 0.985 : 1 }],
        borderWidth: 1,
        borderColor: isDark ? colors.border : "#EEF2F7",
        shadowColor: "#94A3B8",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: isDark ? 0.2 : 0.12,
        shadowRadius: 14,
        elevation: 3,
        overflow: "hidden",
      })}
    >
      <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
          <CompanyLogo job={job} size={46} imageSize={46} />

          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Text
                numberOfLines={1}
                style={{
                  flexShrink: 1,
                  fontFamily: ListifyFonts.bold,
                  fontSize: 16,
                  color: colors.textPrimary,
                }}
              >
                {companyName}
              </Text>
              {isVerified ? (
                <MaterialIcons name="verified" size={16} color={JOBS_BLUE} />
              ) : null}
            </View>
            {location ? (
              <Text
                numberOfLines={1}
                style={{
                  marginTop: 2,
                  fontFamily: ListifyFonts.regular,
                  fontSize: 12,
                  color: colors.textSecondary,
                }}
              >
                {location}
              </Text>
            ) : null}
            <View style={{ marginTop: 4, flexDirection: "row", alignItems: "center", gap: 4 }}>
              <View
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 7,
                  backgroundColor: "#22C55E",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <MaterialIcons name="check" size={10} color="#FFFFFF" />
              </View>
              <Text style={{ fontFamily: ListifyFonts.medium, fontSize: 12, color: colors.textSecondary }}>
                Trusted
              </Text>
            </View>
          </View>

          <Pressable onPress={onToggleSave} hitSlop={10}>
            <Image
              source={JOBS_UI_ICONS.bookmark}
              contentFit="contain"
              style={{ width: 22, height: 28, tintColor: isSaved ? "#EF4444" : colors.iconMuted }}
            />
          </Pressable>
        </View>

        <View style={{ marginTop: 14, flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              numberOfLines={2}
              style={{
                fontFamily: ListifyFonts.bold,
                fontSize: 18,
                lineHeight: 24,
                color: colors.textPrimary,
              }}
            >
              {job.title}
            </Text>
            <Text
              style={{
                marginTop: 6,
                fontFamily: ListifyFonts.regular,
                fontSize: 14,
                color: colors.textSecondary,
              }}
            >
              {salaryText}
              {!salaryText.includes("Month") && salaryText !== "Salary not disclosed" ? " / Month" : ""}
            </Text>
          </View>
          {tagPills.length > 0 ? (
            <View style={{ alignItems: "flex-end", gap: 6 }}>
              {tagPills.map((tag) => (
                <View
                  key={tag}
                  style={{
                    borderRadius: 999,
                    backgroundColor: isDark ? colors.surfaceMuted : "#F3F4F6",
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                  }}
                >
                  <Text style={{ fontFamily: ListifyFonts.medium, fontSize: 11, color: colors.textSecondary }}>
                    {tag}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      </View>

      <LinearGradient
        colors={isDark ? ["transparent", "rgba(91,157,245,0.1)"] : ["#FFFFFF", "#EAF3FF"]}
        style={{
          paddingHorizontal: 16,
          paddingVertical: 14,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          {[0, 1, 2].map((i) => (
            <View
              key={i}
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                marginLeft: i === 0 ? 0 : -8,
                borderWidth: 2,
                borderColor: isDark ? colors.surfaceElevated : "#FFFFFF",
                backgroundColor: ["#CBD5E1", "#94A3B8", "#64748B"][i],
              }}
            />
          ))}
          {applicantCount > 0 ? (
            <Text
              style={{
                marginLeft: 8,
                fontFamily: ListifyFonts.medium,
                fontSize: 13,
                color: colors.textSecondary,
              }}
            >
              +{applicantCount}
            </Text>
          ) : null}
        </View>

        <Pressable onPress={onPress} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text
            style={{
              fontFamily: ListifyFonts.bold,
              fontSize: 15,
              color: JOBS_BLUE,
              ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
            }}
          >
            Apply
          </Text>
          <Image
            source={JOBS_UI_ICONS.applyArrow}
            contentFit="contain"
            style={{ width: 16, height: 16, tintColor: JOBS_BLUE }}
          />
        </Pressable>
      </LinearGradient>
    </Pressable>
  );
}

export const JobsListingCard = memo(JobsListingCardImpl);

import { MaterialIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { memo, useMemo } from "react";
import { Platform, Pressable, Text, View } from "react-native";

import { ListifyFonts } from "@/constants/typography";
import { CompanyLogo } from "@/features/jobs/components/company-logo";
import {
  JOBS_APPLY_TEAL,
  JOBS_CARD_BG,
  JOBS_UI_ICONS,
} from "@/features/jobs/data/jobs-discovery";
import {
  formatJobSalary,
  getCompanyDisplayName,
  getCompanyInitial,
  getCompanyLocation,
  getExtraTagCount,
  getJobApplicantCount,
  getPrimaryWorkBadge,
  type JobListingExtras,
} from "@/features/jobs/utils/jobs-formatters";
import { Image } from "@/lib/nativewind-interop";
import { useTheme } from "@/providers/theme-provider";

type JobListingCardProps = {
  job: JobListingExtras;
  isoCountryCode?: string | null;
  isSaved: boolean;
  onPress: () => void;
  onToggleSave: () => void;
};

const AVATAR_FALLBACK = ["#CBD5E1", "#94A3B8", "#64748B", "#475569"];

function companyInitial(name: string) {
  return getCompanyInitial(name);
}

function ApplicantAvatarStack({
  job,
  borderColor,
}: {
  job: JobListingExtras;
  borderColor: string;
}) {
  const avatars = job.applicantAvatars ?? [];
  if (avatars.length === 0) return null;

  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      {avatars.slice(0, 4).map((applicant, i) => (
        <View
          key={`${job._id}-avatar-${i}`}
          style={{
            width: 30,
            height: 30,
            borderRadius: 15,
            marginLeft: i === 0 ? 0 : -10,
            borderWidth: 2,
            borderColor,
            overflow: "hidden",
            backgroundColor: applicant.profileImage
              ? "#E2E8F0"
              : AVATAR_FALLBACK[i % AVATAR_FALLBACK.length],
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {applicant.profileImage ? (
            <Image
              source={applicant.profileImage}
              contentFit="cover"
              transition={200}
              cachePolicy="memory-disk"
              style={{ width: 30, height: 30 }}
            />
          ) : applicant.name ? (
            <Text style={{ fontFamily: ListifyFonts.bold, fontSize: 11, color: "#FFFFFF" }}>
              {companyInitial(applicant.name)}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

function JobListingCardImpl({
  job,
  isoCountryCode,
  isSaved,
  onPress,
  onToggleSave,
}: JobListingCardProps) {
  const { colors, isDark } = useTheme();
  const companyName = getCompanyDisplayName(job);
  const location = getCompanyLocation(job);
  const salaryText = formatJobSalary(job, isoCountryCode);
  const salaryPeriod =
    job.salaryType?.toLowerCase().includes("year") ||
    job.salary?.type?.toLowerCase().includes("year")
      ? " / Year"
      : " / Month";
  const primaryBadge = getPrimaryWorkBadge(job);
  const extraCount = getExtraTagCount(job);
  const applicantCount = getJobApplicantCount(job);
  const hasAvatars = (job.applicantAvatars?.length ?? 0) > 0;
  const isVerified = Boolean(
    (job.seller as { isVerified?: boolean } | undefined)?.isVerified,
  );

  const cardBg = isDark ? colors.surfaceElevated : JOBS_CARD_BG;

  const salaryDisplay = useMemo(() => {
    if (salaryText === "Salary not disclosed") return salaryText;
    if (salaryText.includes("/")) return salaryText;
    return `${salaryText}${salaryPeriod}`;
  }, [salaryPeriod, salaryText]);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        borderRadius: 26,
        backgroundColor: cardBg,
        overflow: "hidden",
        transform: [{ scale: pressed ? 0.985 : 1 }],
        shadowColor: "#64748B",
        shadowOffset: { width: 0, height: pressed ? 10 : 8 },
        shadowOpacity: pressed ? 0.18 : 0.1,
        shadowRadius: pressed ? 22 : 16,
        elevation: pressed ? 6 : 4,
      })}
    >
      <View style={{ paddingHorizontal: 18, paddingTop: 18, paddingBottom: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
          <CompanyLogo
            job={job}
            size={48}
            imageSize={40}
            borderWidth={1}
            borderColor={isDark ? colors.border : "#EEF2F7"}
          />

          <View style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
            <Text
              numberOfLines={1}
              style={{
                fontFamily: ListifyFonts.semiBold,
                fontSize: 16,
                color: colors.textPrimary,
              }}
            >
              {companyName}
            </Text>
            <View style={{ marginTop: 4, flexDirection: "row", flexWrap: "wrap", alignItems: "center" }}>
              {location ? (
                <Text
                  numberOfLines={1}
                  style={{
                    fontFamily: ListifyFonts.regular,
                    fontSize: 13,
                    color: "#9CA3AF",
                  }}
                >
                  {location}
                </Text>
              ) : null}
              {location && isVerified ? (
                <Text style={{ fontFamily: ListifyFonts.regular, fontSize: 13, color: "#9CA3AF" }}>
                  {" · "}
                </Text>
              ) : null}
              {isVerified ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Image
                    source={JOBS_UI_ICONS.trusted}
                    contentFit="contain"
                    style={{ width: 14, height: 14 }}
                  />
                  <Text style={{ fontFamily: ListifyFonts.medium, fontSize: 12, color: "#22C55E" }}>
                    Trusted
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

          <Pressable onPress={onToggleSave} hitSlop={12}>
            <MaterialIcons
              name={isSaved ? "bookmark" : "bookmark-border"}
              size={24}
              color={isSaved ? "#EF4444" : colors.iconMuted}
            />
          </Pressable>
        </View>

        <View style={{ marginTop: 16, flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              numberOfLines={2}
              style={{
                fontFamily: ListifyFonts.bold,
                fontSize: 19,
                lineHeight: 26,
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
                color: "#9CA3AF",
              }}
            >
              {salaryDisplay}
            </Text>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingTop: 2, flexShrink: 0 }}>
            {primaryBadge ? (
              <View
                style={{
                  borderRadius: 999,
                  backgroundColor: isDark ? colors.surfaceMuted : "#F3F4F6",
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                }}
              >
                <Text style={{ fontFamily: ListifyFonts.medium, fontSize: 12, color: "#6B7280" }}>
                  {primaryBadge}
                </Text>
              </View>
            ) : null}
            {extraCount > 0 ? (
              <View
                style={{
                  borderRadius: 999,
                  backgroundColor: isDark ? colors.surfaceMuted : "#F3F4F6",
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                }}
              >
                <Text style={{ fontFamily: ListifyFonts.medium, fontSize: 11, color: "#9CA3AF" }}>
                  +{extraCount}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>

      <LinearGradient
        colors={
          isDark
            ? ["transparent", "rgba(39,187,151,0.06)"]
            : ["#FFFFFF", "#F0F8FF"]
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          paddingHorizontal: 18,
          paddingVertical: 16,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", flex: 1, minWidth: 0 }}>
          {hasAvatars ? (
            <>
              <ApplicantAvatarStack job={job} borderColor={cardBg} />
              {applicantCount > 0 ? (
                <Text
                  style={{
                    marginLeft: 8,
                    fontFamily: ListifyFonts.medium,
                    fontSize: 13,
                    color: "#9CA3AF",
                  }}
                >
                  +{applicantCount}
                </Text>
              ) : null}
            </>
          ) : null}
        </View>

        <Pressable
          onPress={onPress}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            opacity: pressed ? 0.75 : 1,
            transform: [{ scale: pressed ? 0.97 : 1 }],
            marginLeft: 12,
          })}
        >
          <Text
            style={{
              fontFamily: ListifyFonts.bold,
              fontSize: 15,
              color: JOBS_APPLY_TEAL,
              ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
            }}
          >
            Apply
          </Text>
          <MaterialIcons name="north-east" size={18} color={JOBS_APPLY_TEAL} />
        </Pressable>
      </LinearGradient>
    </Pressable>
  );
}

export const JobListingCard = memo(JobListingCardImpl);

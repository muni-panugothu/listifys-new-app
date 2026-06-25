import { MaterialIcons } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";

import { ListingTimeBadge } from "@/components/listing-time-badge";
import { ListifyFonts } from "@/constants/typography";
import type { ListingItem } from "@/features/listing/services/listing-api";
import { Image } from "@/lib/nativewind-interop";

type JobListingCardProps = {
  job: ListingItem;
  salaryText: string;
  isSaved: boolean;
  onPress: () => void;
  onToggleSave: () => void;
};

export function JobListingCard({
  job,
  salaryText,
  isSaved,
  onPress,
  onToggleSave,
}: JobListingCardProps) {
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
      className="overflow-hidden rounded-2xl bg-white"
      style={({ pressed }) => ({
        opacity: pressed ? 0.96 : 1,
        borderWidth: 1,
        borderColor: "#F0F0F0",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 2,
      })}
    >
      <ListingTimeBadge
        date={job.createdAt}
        style={{ left: 12, top: 12, position: "absolute", zIndex: 3 }}
      />
      <View className="p-4">
        <View className="mb-3 flex-row items-start gap-3">
          <View className="h-12 w-12 overflow-hidden rounded-xl bg-[#F3F4F6]">
            {companyLogo ? (
              <Image
                source={companyLogo}
                contentFit="cover"
                transition={120}
                cachePolicy="memory-disk"
                recyclingKey={companyLogo}
                className="h-full w-full"
              />
            ) : (
              <View className="h-full w-full items-center justify-center">
                <MaterialIcons name="business" size={22} color="#9CA3AF" />
              </View>
            )}
          </View>
          <View className="min-w-0 flex-1">
            <Text
              numberOfLines={2}
              className="text-[17px] text-[#1A1A1A]"
              style={{ fontFamily: ListifyFonts.semiBold }}
            >
              {job.title}
            </Text>
            {companyName ? (
              <Text
                className="mt-0.5 text-[14px] text-[#6B7280]"
                style={{ fontFamily: ListifyFonts.regular }}
              >
                {companyName}
              </Text>
            ) : null}
          </View>
          {isNew ? (
            <View className="rounded-md bg-[#27BB97]/10 px-2 py-1">
              <Text
                className="text-[10px] text-[#27BB97]"
                style={{ fontFamily: ListifyFonts.bold }}
              >
                NEW
              </Text>
            </View>
          ) : null}
        </View>

        {(jobType || workMode || job.subcategory) ? (
          <View className="mb-3 flex-row flex-wrap gap-2">
            {jobType ? (
              <View className="rounded-full bg-[#F3F4F6] px-2.5 py-1">
                <Text
                  className="text-[11px] text-[#4B5563]"
                  style={{ fontFamily: ListifyFonts.medium }}
                >
                  {jobType}
                </Text>
              </View>
            ) : null}
            {workMode ? (
              <View className="rounded-full bg-[#EFF6FF] px-2.5 py-1">
                <Text
                  className="text-[11px] text-[#2563EB]"
                  style={{ fontFamily: ListifyFonts.medium }}
                >
                  {workMode}
                </Text>
              </View>
            ) : null}
            {job.subcategory ? (
              <View className="rounded-full bg-[#27BB97]/10 px-2.5 py-1">
                <Text
                  className="text-[11px] text-[#27BB97]"
                  style={{ fontFamily: ListifyFonts.medium }}
                >
                  {job.subcategory}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <Text
          className="text-[16px] text-[#1A1A1A]"
          style={{ fontFamily: ListifyFonts.bold }}
        >
          {salaryText}
        </Text>
        {job.location ? (
          <View className="mt-1 flex-row items-center gap-1">
            <MaterialIcons name="location-on" size={14} color="#9CA3AF" />
            <Text
              numberOfLines={1}
              className="flex-1 text-[13px] text-[#9CA3AF]"
              style={{ fontFamily: ListifyFonts.regular }}
            >
              {job.location}
            </Text>
          </View>
        ) : null}

        <View className="mt-4 flex-row gap-2">
          <Pressable
            onPress={onPress}
            className="flex-1 items-center rounded-xl py-3"
            style={{ backgroundColor: "#27BB97" }}
          >
            <Text
              className="text-[14px] text-white"
              style={{ fontFamily: ListifyFonts.semiBold }}
            >
              View details
            </Text>
          </Pressable>
          <Pressable
            onPress={onToggleSave}
            className="h-12 w-12 items-center justify-center rounded-xl border border-[#E5E7EB] bg-white"
          >
            <MaterialIcons
              name={isSaved ? "bookmark" : "bookmark-border"}
              size={22}
              color={isSaved ? "#27BB97" : "#1A1A1A"}
            />
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

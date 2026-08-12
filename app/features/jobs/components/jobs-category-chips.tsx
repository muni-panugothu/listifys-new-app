import { memo } from "react";
import { Platform, Pressable, ScrollView, Text } from "react-native";

import { ListifyFonts } from "@/constants/typography";
import {
  JOBS_CATEGORY_CHIPS,
  JOBS_CHIP_ACTIVE_BG,
  JOBS_CHIP_INACTIVE_BG,
  type JobsCategoryChip,
} from "@/features/jobs/data/jobs-discovery";
import { useTheme } from "@/providers/theme-provider";

type JobsCategoryChipsProps = {
  selectedId: string | null;
  onSelect: (chip: JobsCategoryChip | null) => void;
};

function JobsCategoryChipsImpl({ selectedId, onSelect }: JobsCategoryChipsProps) {
  const { colors } = useTheme();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, gap: 10, paddingVertical: 6 }}
    >
      {JOBS_CATEGORY_CHIPS.map((chip) => {
        const isActive = selectedId === chip.id;
        return (
          <Pressable
            key={chip.id}
            onPress={() => onSelect(isActive ? null : chip)}
            style={({ pressed }) => ({
              borderRadius: 999,
              paddingHorizontal: 16,
              paddingVertical: 10,
              backgroundColor: isActive ? JOBS_CHIP_ACTIVE_BG : JOBS_CHIP_INACTIVE_BG,
              opacity: pressed ? 0.9 : 1,
            })}
          >
            <Text
              style={{
                fontFamily: ListifyFonts.semiBold,
                fontSize: 14,
                color: isActive ? "#FFFFFF" : colors.textPrimary,
                ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
              }}
            >
              {chip.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export const JobsCategoryChips = memo(JobsCategoryChipsImpl);

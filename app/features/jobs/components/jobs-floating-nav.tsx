import { MaterialIcons } from "@expo/vector-icons";
import { memo } from "react";
import { Platform, Pressable, Text, View } from "react-native";

import { ListifyFonts } from "@/constants/typography";
import { JOBS_BLUE } from "@/features/jobs/data/jobs-discovery";

export type JobsFloatingNavTab = "saved" | "applied";

type JobsFloatingNavProps = {
  activeTab: JobsFloatingNavTab;
  onChange: (tab: JobsFloatingNavTab) => void;
  bottomInset: number;
};

function JobsFloatingNavImpl({ activeTab, onChange, bottomInset }: JobsFloatingNavProps) {
  return (
    <View
      style={{
        position: "absolute",
        left: 16,
        right: 16,
        bottom: Math.max(bottomInset, 12),
        flexDirection: "row",
        backgroundColor: JOBS_BLUE,
        borderRadius: 999,
        padding: 6,
        shadowColor: JOBS_BLUE,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.35,
        shadowRadius: 16,
        elevation: 8,
      }}
    >
      {(
        [
          { id: "saved" as const, label: "Saved", icon: "work" as const },
          { id: "applied" as const, label: "Applied", icon: "description" as const },
        ] as const
      ).map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <Pressable
            key={tab.id}
            onPress={() => onChange(tab.id)}
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              borderRadius: 999,
              paddingVertical: 12,
              backgroundColor: isActive ? "#FFFFFF" : "transparent",
            }}
          >
            <MaterialIcons
              name={tab.icon}
              size={20}
              color={isActive ? "#8B5E3C" : "#FFFFFF"}
            />
            <Text
              style={{
                fontFamily: ListifyFonts.semiBold,
                fontSize: 15,
                color: isActive ? "#8B5E3C" : "#FFFFFF",
                ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
              }}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export const JobsFloatingNav = memo(JobsFloatingNavImpl);

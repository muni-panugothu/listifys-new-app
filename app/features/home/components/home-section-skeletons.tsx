import { Dimensions, View } from "react-native";

import { useTheme } from "@/providers/theme-provider";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const SPOTLIGHT_CARD_W = SCREEN_WIDTH * 0.66;
const SPOTLIGHT_IMAGE_H = SPOTLIGHT_CARD_W * 1.16;
const HORIZONTAL_CARD_W = Math.round(SCREEN_WIDTH * 0.72);
const HORIZONTAL_IMAGE_H = Math.round(HORIZONTAL_CARD_W * 0.62);
const SERVICE_CARD_W = Math.round(SCREEN_WIDTH * 0.86);
const JOB_CARD_H = 168;

function Bone({
  width,
  height,
  radius = 8,
  color,
}: {
  width: number | `${number}%`;
  height: number;
  radius?: number;
  color: string;
}) {
  return (
    <View
      style={{
        width,
        height,
        borderRadius: radius,
        backgroundColor: color,
      }}
    />
  );
}

export function HomeSpotlightSkeleton() {
  const { colors } = useTheme();
  const bone = colors.skeleton;
  return (
    <View style={{ paddingHorizontal: 16, marginTop: 20, marginBottom: 24 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 14 }}>
        <Bone width={180} height={22} radius={6} color={bone} />
        <Bone width={52} height={18} radius={6} color={bone} />
      </View>
      <View style={{ flexDirection: "row", gap: 4 }}>
        {[0, 1].map((i) => (
          <View key={i} style={{ width: SPOTLIGHT_CARD_W }}>
            <Bone width="100%" height={SPOTLIGHT_IMAGE_H} radius={18} color={bone} />
            <View style={{ marginTop: 10, gap: 6 }}>
              <Bone width="78%" height={14} radius={4} color={bone} />
              <Bone width="45%" height={12} radius={4} color={bone} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

export function HomeHorizontalSectionSkeleton({
  titleWidth = 200,
  cardHeight = HORIZONTAL_IMAGE_H + 56,
}: {
  titleWidth?: number;
  cardHeight?: number;
}) {
  const { colors } = useTheme();
  const bone = colors.skeleton;
  return (
    <View style={{ marginBottom: 32 }}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          paddingHorizontal: 16,
          marginBottom: 14,
        }}
      >
        <Bone width={titleWidth} height={22} radius={6} color={bone} />
        <Bone width={22} height={22} radius={11} color={bone} />
      </View>
      <View style={{ flexDirection: "row", paddingHorizontal: 16, gap: 14 }}>
        {[0, 1].map((i) => (
          <View key={i} style={{ width: HORIZONTAL_CARD_W, height: cardHeight }}>
            <Bone width="100%" height={HORIZONTAL_IMAGE_H} radius={16} color={bone} />
            <View style={{ marginTop: 10, gap: 6 }}>
              <Bone width="55%" height={12} radius={4} color={bone} />
              <Bone width="85%" height={15} radius={4} color={bone} />
              <Bone width="65%" height={12} radius={4} color={bone} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

export function HomeServiceSectionSkeleton() {
  const { colors } = useTheme();
  const bone = colors.skeleton;
  return (
    <View style={{ marginBottom: 32 }}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          paddingHorizontal: 16,
          marginBottom: 14,
        }}
      >
        <Bone width={220} height={22} radius={6} color={bone} />
        <Bone width={22} height={22} radius={11} color={bone} />
      </View>
      <View style={{ paddingHorizontal: 16 }}>
        <Bone width={SERVICE_CARD_W} height={120} radius={20} color={bone} />
      </View>
    </View>
  );
}

export function HomeJobSectionSkeleton() {
  const { colors } = useTheme();
  const bone = colors.skeleton;
  return (
    <View style={{ marginBottom: 32 }}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          paddingHorizontal: 16,
          marginBottom: 14,
        }}
      >
        <Bone width={160} height={22} radius={6} color={bone} />
        <Bone width={22} height={22} radius={11} color={bone} />
      </View>
      <View style={{ paddingHorizontal: 16 }}>
        <Bone width={SERVICE_CARD_W} height={JOB_CARD_H} radius={24} color={bone} />
      </View>
    </View>
  );
}

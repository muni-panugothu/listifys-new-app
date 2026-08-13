import { memo, useEffect, useMemo, useState } from "react";
import { Text, View, type ViewStyle } from "react-native";

import { ListifyFonts } from "@/constants/typography";
import {
  getCompanyDisplayName,
  getCompanyInitial,
  resolveCompanyLogoUrl,
  type JobListingExtras,
} from "@/features/jobs/utils/jobs-formatters";
import { Image } from "@/lib/nativewind-interop";

const COMPANY_COLORS = ["#4285F4", "#00A4EF", "#737373", "#F25022", "#34A853"];

function companyColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return COMPANY_COLORS[Math.abs(hash) % COMPANY_COLORS.length];
}

type CompanyLogoProps = {
  job: JobListingExtras;
  size: number;
  imageSize?: number;
  borderWidth?: number;
  borderColor?: string;
  backgroundColor?: string;
  style?: ViewStyle;
};

function CompanyLogoImpl({
  job,
  size,
  imageSize,
  borderWidth = 0,
  borderColor = "transparent",
  backgroundColor = "#FFFFFF",
  style,
}: CompanyLogoProps) {
  const [failed, setFailed] = useState(false);
  const companyName = getCompanyDisplayName(job);
  const logoUrl = useMemo(() => resolveCompanyLogoUrl(job), [job]);
  const initial = useMemo(() => getCompanyInitial(companyName), [companyName]);
  const innerSize = imageSize ?? Math.max(size - borderWidth * 2 - 8, size * 0.72);
  const showImage = Boolean(logoUrl) && !failed;

  useEffect(() => {
    setFailed(false);
  }, [logoUrl]);

  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          overflow: "hidden",
          backgroundColor: showImage ? backgroundColor : companyColor(companyName),
          borderWidth,
          borderColor,
          alignItems: "center",
          justifyContent: "center",
        },
        style,
      ]}
    >
      {showImage ? (
        <Image
          source={logoUrl!}
          contentFit="contain"
          transition={200}
          cachePolicy="memory-disk"
          recyclingKey={logoUrl!}
          onError={() => setFailed(true)}
          style={{ width: innerSize, height: innerSize }}
        />
      ) : (
        <Text
          style={{
            fontFamily: ListifyFonts.bold,
            fontSize: Math.round(size * (initial.length > 1 ? 0.3 : 0.38)),
            color: "#FFFFFF",
          }}
        >
          {initial}
        </Text>
      )}
    </View>
  );
}

export const CompanyLogo = memo(CompanyLogoImpl);

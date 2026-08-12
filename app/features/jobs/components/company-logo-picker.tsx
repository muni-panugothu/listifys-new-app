import { MaterialIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useCallback, useMemo } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { ListifyFonts } from "@/constants/typography";
import { JOBS_APPLY_TEAL } from "@/features/jobs/data/jobs-discovery";
import { resolveAbsoluteMediaUrl } from "@/features/auth/services/auth-api";
import { Image } from "@/lib/nativewind-interop";
import { showErrorToast } from "@/lib/toast";
import { useTheme } from "@/providers/theme-provider";

const MAX_LOGO_BYTES = 2 * 1024 * 1024;

type CompanyLogoPickerProps = {
  companyName?: string;
  logoUri: string;
  uploadedLogoUrl?: string;
  isUploading?: boolean;
  onPick: (uri: string) => void;
  onRemove: () => void;
};

export function CompanyLogoPicker({
  companyName,
  logoUri,
  uploadedLogoUrl,
  isUploading = false,
  onPick,
  onRemove,
}: CompanyLogoPickerProps) {
  const { colors, isDark } = useTheme();

  const previewUri = useMemo(() => {
    if (logoUri) {
      return logoUri.startsWith("http")
        ? resolveAbsoluteMediaUrl(logoUri) ?? logoUri
        : logoUri;
    }
    if (uploadedLogoUrl) {
      return resolveAbsoluteMediaUrl(uploadedLogoUrl) ?? uploadedLogoUrl;
    }
    return null;
  }, [logoUri, uploadedLogoUrl]);

  const handlePick = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });

    if (result.canceled || !result.assets[0]?.uri) return;

    const asset = result.assets[0];
    if (asset.fileSize && asset.fileSize > MAX_LOGO_BYTES) {
      showErrorToast("Logo must be 2 MB or smaller.");
      return;
    }

    onPick(asset.uri);
  }, [onPick]);

  return (
    <View className="mb-6">
      <Text
        style={{
          fontFamily: ListifyFonts.semiBold,
          fontSize: 14,
          color: colors.textPrimary,
          marginBottom: 10,
        }}
      >
        Company Logo
      </Text>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: 36,
            overflow: "hidden",
            borderWidth: 1,
            borderColor: isDark ? colors.border : "#E5E7EB",
            backgroundColor: isDark ? colors.surfaceMuted : "#F9FAFB",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {isUploading ? (
            <ActivityIndicator color={JOBS_APPLY_TEAL} />
          ) : previewUri ? (
            <Image source={previewUri} contentFit="contain" style={{ width: 56, height: 56 }} />
          ) : (
            <MaterialIcons name="business" size={30} color={colors.iconMuted} />
          )}
        </View>

        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontFamily: ListifyFonts.regular,
              fontSize: 13,
              color: colors.textSecondary,
              lineHeight: 18,
            }}
          >
            {companyName
              ? `Logo for ${companyName}. Saved once and reused on all your job posts.`
              : "Upload your company logo once. It will appear on every job you post."}
          </Text>

          <View style={{ marginTop: 10, flexDirection: "row", gap: 10 }}>
            <Pressable
              onPress={() => void handlePick()}
              disabled={isUploading}
              style={({ pressed }) => ({
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: JOBS_APPLY_TEAL,
                opacity: pressed || isUploading ? 0.8 : 1,
              })}
            >
              <Text style={{ fontFamily: ListifyFonts.semiBold, fontSize: 13, color: "#FFFFFF" }}>
                {previewUri ? "Change Logo" : "Upload Logo"}
              </Text>
            </Pressable>

            {previewUri ? (
              <Pressable
                onPress={onRemove}
                disabled={isUploading}
                style={({ pressed }) => ({
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: colors.border,
                  opacity: pressed || isUploading ? 0.7 : 1,
                })}
              >
                <Text style={{ fontFamily: ListifyFonts.medium, fontSize: 13, color: colors.textSecondary }}>
                  Remove
                </Text>
              </Pressable>
            ) : null}
          </View>

          <Text
            style={{
              marginTop: 8,
              fontFamily: ListifyFonts.regular,
              fontSize: 11,
              color: colors.textTertiary,
            }}
          >
            PNG, JPG, or WebP · Max 2 MB · Square recommended
          </Text>
        </View>
      </View>
    </View>
  );
}

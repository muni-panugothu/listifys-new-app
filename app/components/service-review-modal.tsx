import { MaterialIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  Platform,
  Pressable,
  StatusBar,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "@/lib/safe-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ProfileAvatarImage } from "@/components/profile-avatar-image";
import { ListifyFonts } from "@/constants/typography";
import { submitServiceReview } from "@/features/auth/services/auth-api";
import { uploadListingImages } from "@/features/listing/services/listing-api";
import { Image } from "@/lib/nativewind-interop";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import { useTheme } from "@/providers/theme-provider";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const HERO_HEIGHT = Math.min(Math.round(SCREEN_HEIGHT * 0.32), 280);
const CARD_OVERLAP = 28;
const MAX_REVIEW_CHARS = 1000;
const MIN_REVIEW_CHARS = 10;
const SUBMIT_BAR_HEIGHT = 52;

type ServiceReviewModalProps = {
  visible: boolean;
  listingId: string;
  providerId: string;
  providerName: string;
  serviceTitle?: string;
  categoryLabel?: string;
  coverImage?: string | null;
  locationText?: string;
  averageRating?: number | null;
  reviewCount?: number;
  providerAvatar?: Record<string, unknown> | null;
  onClose: () => void;
  onSubmitted: () => void;
};

export function ServiceReviewModal({
  visible,
  listingId,
  providerId,
  providerName,
  serviceTitle,
  categoryLabel = "Services",
  coverImage,
  locationText,
  averageRating,
  reviewCount = 0,
  providerAvatar,
  onClose,
  onSubmitted,
}: ServiceReviewModalProps) {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const displayTitle = serviceTitle?.trim() || providerName;
  const experienceLabel = serviceTitle?.trim()
    ? serviceTitle.trim()
    : `${providerName}'s ${categoryLabel}`;

  /** One surface color for card + footer so scrolling never reveals mismatched bands. */
  const sheetSurface = colors.surface;

  const circleBtn = useMemo(
    () => ({
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: isDark ? "rgba(30,35,42,0.88)" : "rgba(255,255,255,0.94)",
      alignItems: "center" as const,
      justifyContent: "center" as const,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.35 : 0.12,
      shadowRadius: 6,
      elevation: 4,
    }),
    [isDark],
  );

  const resetForm = useCallback(() => {
    setRating(0);
    setComment("");
    setPhotoUri(null);
    setSubmitting(false);
  }, []);

  useEffect(() => {
    if (visible) resetForm();
  }, [visible, resetForm]);

  const handleClose = useCallback(() => {
    resetForm();
    onClose();
  }, [onClose, resetForm]);

  const handlePickPhoto = useCallback(async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        showErrorToast("Permission needed", "Allow photo access to attach an image.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.82,
        aspect: [4, 3],
      });

      if (!result.canceled && result.assets[0]?.uri) {
        setPhotoUri(result.assets[0].uri);
      }
    } catch {
      showErrorToast("Could not open gallery", "Please try again.");
    }
  }, []);

  const handleSubmit = useCallback(async () => {
    if (submitting) return;

    if (rating < 1) {
      showErrorToast("Rating required", "Please select a star rating.");
      return;
    }

    const text = comment.trim();
    if (text.length < MIN_REVIEW_CHARS) {
      showErrorToast("Review too short", `Please write at least ${MIN_REVIEW_CHARS} characters.`);
      return;
    }

    setSubmitting(true);
    try {
      let uploadedImages: Array<{ url: string; publicId?: string }> | undefined;
      if (photoUri) {
        const uploadResult = await uploadListingImages("services", [photoUri]);
        const urls = uploadResult.images ?? [];
        if (urls.length > 0) {
          uploadedImages = urls.map((url) => ({ url }));
        }
      }

      await submitServiceReview({
        listingId,
        providerId,
        rating,
        comment: text,
        images: uploadedImages,
      });

      showSuccessToast("Review submitted", "Thank you for your feedback.");
      onSubmitted();
      handleClose();
    } catch (e) {
      showErrorToast(
        "Could not submit",
        e instanceof Error ? e.message : "Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }, [comment, handleClose, listingId, onSubmitted, photoUri, providerId, rating, submitting]);

  const canSubmit = rating >= 1 && !submitting;
  const footerBottom = Math.max(insets.bottom, 12);
  const stickyFooterTotal = SUBMIT_BAR_HEIGHT + 12 + footerBottom;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor="transparent"
        translucent
      />

      <View style={{ flex: 1, backgroundColor: sheetSurface }}>
        <KeyboardAwareScrollView
          keyboardShouldPersistTaps="handled"
          bottomOffset={stickyFooterTotal}
          showsVerticalScrollIndicator={false}
          style={{ flex: 1, backgroundColor: sheetSurface }}
          contentContainerStyle={{
            flexGrow: 1,
            backgroundColor: sheetSurface,
            paddingBottom: stickyFooterTotal + 24,
          }}
        >
          {/* Hero cover */}
          <View
            style={{
              height: HERO_HEIGHT,
              width: SCREEN_WIDTH,
              backgroundColor: colors.surfaceMuted,
            }}
          >
            {coverImage ? (
              <Image
                source={coverImage}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={180}
                style={{ width: SCREEN_WIDTH, height: HERO_HEIGHT }}
              />
            ) : (
              <View
                style={{
                  flex: 1,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: colors.surfaceMuted,
                }}
              >
                <MaterialIcons name="home-repair-service" size={48} color={colors.iconMuted} />
              </View>
            )}

            {/* Fade into sheet surface */}
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                height: 48,
                backgroundColor: isDark ? "rgba(22,26,31,0.55)" : "rgba(255,255,255,0.35)",
              }}
            />

            <Pressable
              onPress={handleClose}
              style={({ pressed }) => ({
                position: "absolute",
                top: insets.top + 8,
                left: 16,
                ...circleBtn,
                opacity: pressed ? 0.85 : 1,
              })}
              accessibilityLabel="Go back"
            >
              <MaterialIcons
                name="arrow-back-ios"
                size={18}
                color={colors.icon}
                style={{ marginLeft: 4 }}
              />
            </Pressable>
          </View>

          {/* Review sheet — grows naturally with content (no fixed minHeight) */}
          <View
            style={{
              flex: 1,
              marginTop: -CARD_OVERLAP,
              borderTopLeftRadius: 32,
              borderTopRightRadius: 32,
              backgroundColor: sheetSurface,
              paddingHorizontal: 20,
              paddingTop: providerAvatar ? 36 : 24,
              paddingBottom: 8,
            }}
          >
            {providerAvatar ? (
              <View
                style={{
                  alignItems: "center",
                  marginTop: -68,
                  marginBottom: 12,
                }}
              >
                <View style={{ position: "relative" }}>
                  <View
                    style={{
                      width: 72,
                      height: 72,
                      borderRadius: 36,
                      overflow: "hidden",
                      borderWidth: 3,
                      borderColor: sheetSurface,
                      backgroundColor: colors.surfaceMuted,
                    }}
                  >
                    <ProfileAvatarImage
                      user={providerAvatar}
                      fallbackName={providerName}
                      style={{ width: 72, height: 72 }}
                      iconSize={34}
                    />
                  </View>
                  <View
                    style={{
                      position: "absolute",
                      bottom: 0,
                      right: 0,
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      backgroundColor: colors.primary,
                      borderWidth: 2,
                      borderColor: sheetSurface,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <MaterialIcons name="verified" size={12} color={colors.textOnPrimary} />
                  </View>
                </View>
              </View>
            ) : null}

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 10,
                marginBottom: 12,
              }}
            >
              <View
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 5,
                  borderRadius: 999,
                  backgroundColor: colors.primarySoft,
                }}
              >
                <Text
                  style={{
                    fontFamily: ListifyFonts.semiBold,
                    fontSize: 12,
                    color: colors.primary,
                  }}
                >
                  {categoryLabel}
                </Text>
              </View>

              {averageRating != null && reviewCount > 0 ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <MaterialIcons name="star" size={15} color={colors.warning} />
                  <Text
                    style={{
                      fontFamily: ListifyFonts.semiBold,
                      fontSize: 13,
                      color: colors.textPrimary,
                    }}
                  >
                    {averageRating.toFixed(1)}
                  </Text>
                  <Text
                    style={{
                      fontFamily: ListifyFonts.regular,
                      fontSize: 13,
                      color: colors.textSecondary,
                    }}
                  >
                    ({reviewCount} review{reviewCount === 1 ? "" : "s"})
                  </Text>
                </View>
              ) : null}
            </View>

            <Text
              style={{
                fontFamily: ListifyFonts.bold,
                fontSize: 24,
                color: colors.textPrimary,
                letterSpacing: -0.3,
              }}
            >
              {displayTitle}
            </Text>

            {locationText ? (
              <Text
                style={{
                  marginTop: 6,
                  fontFamily: ListifyFonts.regular,
                  fontSize: 14,
                  color: colors.textSecondary,
                  lineHeight: 20,
                }}
              >
                {locationText}
              </Text>
            ) : null}

            <View
              style={{
                height: 1,
                backgroundColor: colors.border,
                marginVertical: 22,
              }}
            />

            <Text
              style={{
                textAlign: "center",
                fontFamily: ListifyFonts.bold,
                fontSize: 17,
                color: colors.textPrimary,
                lineHeight: 24,
                paddingHorizontal: 8,
              }}
            >
              How was your experience with{"\n"}
              {experienceLabel}?
            </Text>

            <Text
              style={{
                marginTop: 10,
                textAlign: "center",
                fontFamily: ListifyFonts.regular,
                fontSize: 13,
                color: colors.textTertiary,
              }}
            >
              Your overall rating of this product
            </Text>

            <View
              style={{
                flexDirection: "row",
                justifyContent: "center",
                alignItems: "center",
                gap: 6,
                marginTop: 16,
                marginBottom: 24,
              }}
            >
              {Array.from({ length: 5 }).map((_, index) => {
                const star = index + 1;
                const filled = star <= rating;
                return (
                  <Pressable
                    key={star}
                    onPress={() => setRating(star)}
                    hitSlop={10}
                    style={{ padding: 4 }}
                    accessibilityLabel={`Rate ${star} star${star === 1 ? "" : "s"}`}
                  >
                    <MaterialIcons
                      name={filled ? "star" : "star-border"}
                      size={42}
                      color={filled ? colors.warning : colors.borderStrong}
                    />
                  </Pressable>
                );
              })}
            </View>

            <View
              style={{
                height: 1,
                backgroundColor: colors.border,
                marginBottom: 20,
              }}
            />

            <Text
              style={{
                fontFamily: ListifyFonts.bold,
                fontSize: 16,
                color: colors.textPrimary,
                marginBottom: 10,
              }}
            >
              Add detailed review
            </Text>

            <View
              style={{
                borderRadius: 14,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.inputBackground,
                minHeight: 130,
                paddingHorizontal: 14,
                paddingTop: Platform.OS === "ios" ? 14 : 10,
                paddingBottom: 8,
              }}
            >
              <TextInput
                value={comment}
                onChangeText={setComment}
                placeholder="Enter here"
                placeholderTextColor={colors.inputPlaceholder}
                multiline
                textAlignVertical="top"
                maxLength={MAX_REVIEW_CHARS}
                style={{
                  minHeight: 96,
                  fontFamily: ListifyFonts.regular,
                  fontSize: 15,
                  color: colors.textPrimary,
                  lineHeight: 22,
                }}
              />
              <Text
                style={{
                  textAlign: "right",
                  fontFamily: ListifyFonts.regular,
                  fontSize: 12,
                  color: colors.textTertiary,
                }}
              >
                {comment.trim().length}/{MAX_REVIEW_CHARS}
              </Text>
            </View>

            {/* Photo attachment */}
            <View style={{ marginTop: 16 }}>
              {photoUri ? (
                <View
                  style={{
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: colors.surfaceMuted,
                    padding: 12,
                  }}
                >
                  <View
                    style={{
                      width: "100%",
                      aspectRatio: 4 / 3,
                      maxHeight: 200,
                      borderRadius: 10,
                      overflow: "hidden",
                      backgroundColor: colors.surfaceMuted,
                    }}
                  >
                    <Image
                      source={photoUri}
                      contentFit="cover"
                      style={{ width: "100%", height: "100%" }}
                    />
                    <Pressable
                      onPress={() => setPhotoUri(null)}
                      style={{
                        position: "absolute",
                        top: 8,
                        right: 8,
                        width: 28,
                        height: 28,
                        borderRadius: 14,
                        backgroundColor: "rgba(0,0,0,0.6)",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                      accessibilityLabel="Remove photo"
                    >
                      <MaterialIcons name="close" size={18} color="#FFFFFF" />
                    </Pressable>
                  </View>
                  <Pressable onPress={handlePickPhoto} style={{ marginTop: 10, alignSelf: "flex-start" }}>
                    <Text
                      style={{
                        fontFamily: ListifyFonts.medium,
                        fontSize: 14,
                        color: colors.primary,
                      }}
                    >
                      Replace photo
                    </Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  onPress={handlePickPhoto}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    alignSelf: "flex-start",
                  }}
                >
                  <MaterialIcons name="photo-camera" size={20} color={colors.primary} />
                  <Text
                    style={{
                      fontFamily: ListifyFonts.medium,
                      fontSize: 14,
                      color: colors.primary,
                    }}
                  >
                    add photo
                  </Text>
                </Pressable>
              )}
            </View>
          </View>
        </KeyboardAwareScrollView>

        {/* Sticky submit — same surface as sheet, no color band below */}
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            paddingHorizontal: 20,
            paddingTop: 12,
            paddingBottom: footerBottom,
            backgroundColor: sheetSurface,
            borderTopWidth: 1,
            borderTopColor: colors.border,
          }}
        >
          <Pressable
            onPress={() => void handleSubmit()}
            disabled={!canSubmit}
            style={({ pressed }) => ({
              height: SUBMIT_BAR_HEIGHT,
              borderRadius: 999,
              backgroundColor: colors.primary,
              alignItems: "center",
              justifyContent: "center",
              opacity: !canSubmit ? 0.45 : pressed ? 0.92 : 1,
              transform: [{ scale: pressed && canSubmit ? 0.98 : 1 }],
            })}
          >
            {submitting ? (
              <ActivityIndicator color={colors.textOnPrimary} />
            ) : (
              <Text
                style={{
                  fontFamily: ListifyFonts.bold,
                  fontSize: 17,
                  color: colors.textOnPrimary,
                }}
              >
                Submit
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

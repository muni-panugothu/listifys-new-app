import { MaterialIcons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  KeyboardAwareScrollView,
  KeyboardStickyView,
} from "@/lib/safe-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useKeyboardStickyOffset } from "@/components/chat-keyboard-scroll-view";
import { ListifyFonts } from "@/constants/typography";
import { submitServiceReview } from "@/features/auth/services/auth-api";
import { showErrorToast, showSuccessToast } from "@/lib/toast";

type ServiceReviewModalProps = {
  visible: boolean;
  listingId: string;
  providerId: string;
  providerName: string;
  onClose: () => void;
  onSubmitted: () => void;
};

export function ServiceReviewModal({
  visible,
  listingId,
  providerId,
  providerName,
  onClose,
  onSubmitted,
}: ServiceReviewModalProps) {
  const insets = useSafeAreaInsets();
  const stickyOffset = useKeyboardStickyOffset();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (visible) {
      setRating(0);
      setComment("");
    }
  }, [visible]);

  const handleClose = useCallback(() => {
    setRating(0);
    setComment("");
    setSubmitting(false);
    onClose();
  }, [onClose]);

  const handleSubmit = useCallback(async () => {
    if (rating < 1) {
      showErrorToast("Rating required", "Please select a star rating.");
      return;
    }
    const text = comment.trim();
    if (text.length < 10) {
      showErrorToast("Review too short", "Please write at least 10 characters.");
      return;
    }

    setSubmitting(true);
    try {
      await submitServiceReview({
        listingId,
        providerId,
        rating,
        comment: text,
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
  }, [comment, handleClose, listingId, onSubmitted, providerId, rating]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <View style={{ flex: 1 }}>
        <Pressable className="flex-1 bg-black/45" onPress={handleClose} />
        <KeyboardStickyView offset={stickyOffset}>
          <View className="rounded-t-3xl bg-white">
            <KeyboardAwareScrollView
              keyboardShouldPersistTaps="handled"
              bottomOffset={Math.max(insets.bottom, 8)}
              contentContainerStyle={{
                paddingHorizontal: 24,
                paddingTop: 12,
                paddingBottom: Math.max(insets.bottom, 24),
              }}
            >
              <View className="mb-5 items-center">
                <View className="h-1.5 w-12 rounded-full bg-slate-200" />
              </View>

              <View className="mb-1 flex-row items-center justify-between">
                <Text
                  className="text-[22px] text-[#161D1A]"
                  style={{ fontFamily: ListifyFonts.bold }}
                >
                  Write a Review
                </Text>
                <Pressable onPress={handleClose} hitSlop={12} className="rounded-full p-2">
                  <MaterialIcons name="close" size={22} color="#94A3B8" />
                </Pressable>
              </View>

              <Text
                className="mb-5 text-[14px] text-[#6C7A74]"
                style={{ fontFamily: ListifyFonts.regular }}
              >
                Share your experience with {providerName}
              </Text>

              <Text
                className="mb-2 text-[12px] uppercase tracking-wide text-[#6C7A74]"
                style={{ fontFamily: ListifyFonts.medium }}
              >
                Your rating
              </Text>
              <View className="mb-5 flex-row gap-2">
                {Array.from({ length: 5 }).map((_, index) => {
                  const star = index + 1;
                  const filled = star <= rating;
                  return (
                    <Pressable
                      key={star}
                      onPress={() => setRating(star)}
                      hitSlop={8}
                      className="rounded-full p-1"
                    >
                      <MaterialIcons
                        name={filled ? "star" : "star-border"}
                        size={34}
                        color={filled ? "#F59E0B" : "#D1D5DB"}
                      />
                    </Pressable>
                  );
                })}
              </View>

              <Text
                className="mb-2 text-[12px] uppercase tracking-wide text-[#6C7A74]"
                style={{ fontFamily: ListifyFonts.medium }}
              >
                Your review
              </Text>
              <TextInput
                value={comment}
                onChangeText={setComment}
                placeholder="Describe your experience with this service…"
                placeholderTextColor="#CBD5E1"
                multiline
                textAlignVertical="top"
                maxLength={1000}
                className="mb-2 min-h-[120px] rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-[15px] text-[#161D1A]"
                style={{ fontFamily: ListifyFonts.regular }}
              />
              <Text
                className="mb-6 text-right text-[12px] text-[#9CA3AF]"
                style={{ fontFamily: ListifyFonts.regular }}
              >
                {comment.trim().length}/1000
              </Text>

              <Pressable
                onPress={handleSubmit}
                disabled={submitting}
                className="mb-2 items-center rounded-xl bg-[#27BB97] py-4"
                style={({ pressed }) => ({ opacity: pressed || submitting ? 0.85 : 1 })}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text
                    className="text-[16px] text-white"
                    style={{ fontFamily: ListifyFonts.semiBold }}
                  >
                    Submit Review
                  </Text>
                )}
              </Pressable>
            </KeyboardAwareScrollView>
          </View>
        </KeyboardStickyView>
      </View>
    </Modal>
  );
}

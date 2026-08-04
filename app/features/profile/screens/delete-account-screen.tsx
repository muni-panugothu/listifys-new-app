import { MaterialIcons } from "@expo/vector-icons";
import { type Href, useRouter } from "@/lib/safe-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { KeyboardFormScroll } from "@/components/keyboard-form-scroll";
import { ListifyFonts } from "@/constants/typography";
import { useTheme } from "@/providers/theme-provider";
import { deleteAccount, AuthApiError } from "@/features/auth/services/auth-api";
import { showErrorToast } from "@/lib/toast";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { logout } from "@/store/slices/auth-slice";

const CONFIRM_PHRASE = "DELETE MY ACCOUNT";

const DELETE_ITEMS = [
  "All your listings across all categories",
  "All listing images from storage",
  "All conversations and messages",
  "All notifications and saved items",
  "Your profile and account data",
];

export function DeleteAccountScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const { colors } = useTheme();
  const user = useAppSelector((s) => s.auth.user);

  const [confirmation, setConfirmation] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const needsPassword = user?.hasPassword !== false && user?.provider !== "google";
  const canSubmit =
    confirmation.trim() === CONFIRM_PHRASE &&
    (!needsPassword || password.length > 0) &&
    !loading;

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/settings" as Href);
  };

  const handleDelete = () => {
    if (!canSubmit) return;

    Alert.alert(
      "Delete your account?",
      "This is permanent and irreversible. All your data will be removed.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Yes, delete forever",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setLoading(true);
              try {
                await deleteAccount({
                  confirmation: CONFIRM_PHRASE,
                  password: needsPassword ? password : undefined,
                });
                await dispatch(logout());
                router.replace("/sign-in" as Href);
              } catch (error) {
                const message =
                  error instanceof AuthApiError
                    ? error.message
                    : "Failed to delete account. Please try again.";
                showErrorToast("Delete failed", message);
              } finally {
                setLoading(false);
              }
            })();
          },
        },
      ],
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingTop: insets.top + 8,
          paddingBottom: 12,
          paddingHorizontal: 20,
        }}
      >
        <Pressable onPress={handleBack} hitSlop={12} className="mr-1 h-10 w-10 items-center justify-center">
          <MaterialIcons name="chevron-left" size={32} color={colors.icon} />
        </Pressable>
        <Text style={{ fontSize: 22, fontFamily: ListifyFonts.bold, color: colors.textPrimary }}>
          Delete account
        </Text>
      </View>

      <KeyboardFormScroll
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="rounded-2xl p-6" style={{ backgroundColor: colors.surface }}>
          <View className="mb-5 items-center">
            <View className="h-16 w-16 items-center justify-center rounded-full bg-red-50">
              <MaterialIcons name="warning-amber" size={36} color="#EF4444" />
            </View>
            <Text
              className="mt-4 text-center text-[18px] text-[#1A1A1A]"
              style={{ fontFamily: ListifyFonts.bold }}
            >
              Permanently delete your account
            </Text>
            <Text
              className="mt-2 text-center text-[14px] leading-5 text-[#6B7280]"
              style={{ fontFamily: ListifyFonts.regular }}
            >
              Permanently delete your account and all associated data including
              listings, messages, and saved items. This action cannot be undone.
            </Text>
          </View>

          <Text
            className="mb-3 text-[15px] text-[#1A1A1A]"
            style={{ fontFamily: ListifyFonts.semiBold }}
          >
            This will permanently delete:
          </Text>

          {DELETE_ITEMS.map((item) => (
            <View key={item} className="mb-2 flex-row items-start gap-2">
              <MaterialIcons name="remove-circle" size={18} color="#EF4444" style={{ marginTop: 1 }} />
              <Text
                className="flex-1 text-[14px] text-[#374151]"
                style={{ fontFamily: ListifyFonts.regular }}
              >
                {item}
              </Text>
            </View>
          ))}

          <View className="mt-6 rounded-xl bg-[#FEF2F2] p-4">
            <Text
              className="text-[14px] text-[#991B1B]"
              style={{ fontFamily: ListifyFonts.semiBold }}
            >
              Delete your account?
            </Text>
            <Text
              className="mt-1 text-[13px] text-[#B91C1C]"
              style={{ fontFamily: ListifyFonts.regular }}
            >
              This is permanent and irreversible
            </Text>
          </View>

          {needsPassword ? (
            <>
              <Text
                className="mb-2 mt-5 text-[13px] text-[#6B7280]"
                style={{ fontFamily: ListifyFonts.medium }}
              >
                Current password
              </Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                placeholder="Enter your password"
                placeholderTextColor="#9CA3AF"
                className="h-12 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-4 text-[15px] text-[#1A1A1A]"
                style={{ fontFamily: ListifyFonts.regular }}
              />
            </>
          ) : null}

          <Text
            className="mb-2 mt-5 text-[13px] text-[#6B7280]"
            style={{ fontFamily: ListifyFonts.medium }}
          >
            Type &quot;{CONFIRM_PHRASE}&quot; to confirm
          </Text>
          <TextInput
            value={confirmation}
            onChangeText={setConfirmation}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder={CONFIRM_PHRASE}
            placeholderTextColor="#9CA3AF"
            className="h-12 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-4 text-[15px] text-[#1A1A1A]"
            style={{ fontFamily: ListifyFonts.regular }}
          />

          <View className="mt-6 gap-3">
            <Pressable
              onPress={handleDelete}
              disabled={!canSubmit}
              className="h-12 items-center justify-center rounded-xl bg-red-600"
              style={{ opacity: canSubmit ? 1 : 0.5 }}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text
                  className="text-[16px] text-white"
                  style={{ fontFamily: ListifyFonts.semiBold }}
                >
                  Yes, delete forever
                </Text>
              )}
            </Pressable>

            <Pressable
              onPress={handleBack}
              disabled={loading}
              className="h-12 items-center justify-center rounded-xl border border-[#E5E7EB] bg-white"
            >
              <Text
                className="text-[16px] text-[#374151]"
                style={{ fontFamily: ListifyFonts.semiBold }}
              >
                Cancel
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardFormScroll>
    </View>
  );
}

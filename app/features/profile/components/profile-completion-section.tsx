import { MaterialIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { type Href, useRouter } from "@/lib/safe-router";
import { Pressable, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { ProfileAvatarWithProgress } from "@/features/profile/components/profile-avatar-with-progress";
import { ListifyFonts } from "@/constants/typography";
import type { AuthUser } from "@/features/auth/services/auth-api";
import type { ProfileCompletion } from "@/features/profile/types/profile-completion";
import { useOnlinePresence } from "@/hooks/use-online-presence";
import {
  formatPhoneReadable,
  getProfileDisplayName,
} from "@/lib/profile-display-name";
import { useTheme } from "@/providers/theme-provider";
import type { ResolvedThemeMode } from "@/theme/theme-tokens";

type ProfileCompletionSectionProps = {
  user: AuthUser | null;
  completion: ProfileCompletion;
  avatarSize?: number;
  avatarOverlap?: number;
  /** When the parent screen already shows the hero avatar, hide the in-card avatar. */
  hideAvatar?: boolean;
};

const AUTO_NAME_PATTERN = /^User \d{4}$/i;
const CARD_AVATAR_SIZE = 58;

function hasMeaningfulName(user: AuthUser | null | undefined): boolean {
  const name = user?.name?.trim() ?? "";
  if (name.length < 2) return false;
  if (AUTO_NAME_PATTERN.test(name)) return false;
  return true;
}

function getContactLine(user: AuthUser | null): string {
  const provider = user?.provider?.toLowerCase();
  const phone = user?.phone?.trim();
  const email = user?.email?.trim();

  if (provider === "phone" && phone) return formatPhoneReadable(phone);
  if (provider === "google" && email) return email;
  if (email) return email;
  if (phone) return formatPhoneReadable(phone);
  return "";
}

function getCardGradient(mode: ResolvedThemeMode): readonly [string, string] {
  if (mode === "dark") {
    return ["#1A2228", "#14181D"];
  }
  return ["#E8FAF5", "#F5F3FF"];
}


function getPrimaryNameLine(user: AuthUser | null): string {
  if (hasMeaningfulName(user)) return user!.name.trim();
  return "Add your name";
}

function shouldShowNameAsPlaceholder(user: AuthUser | null): boolean {
  return !hasMeaningfulName(user);
}

export function ProfileCompletionSection({
  user,
  completion,
  hideAvatar = false,
}: ProfileCompletionSectionProps) {
  const router = useRouter();
  const { colors, resolvedMode } = useTheme();
  const { isSelfOnline } = useOnlinePresence();
  const displayName = getProfileDisplayName(user, true);
  const contactLine = getContactLine(user);
  const primaryName = getPrimaryNameLine(user);
  const nameIsPlaceholder = shouldShowNameAsPlaceholder(user);
  const nextStepLabel = completion.nextStep?.label ?? null;
  const incompleteCount = completion.totalCount - completion.completedCount;

  const ringProgress =
    completion.totalCount > 0
      ? (completion.completedCount / completion.totalCount) * 100
      : 0;

  const navigateToNext = () => {
    const route = completion.nextStep?.route ?? "/profile-details-edit";
    router.push(route as Href);
  };

  const navigateToEditProfile = () => {
    router.push("/profile-details-edit" as Href);
  };

  if (completion.isComplete) {
    return null;
  }

  const gradient = getCardGradient(resolvedMode);

  return (
    <Animated.View
      entering={FadeInDown.duration(400)}
      style={{ marginTop: hideAvatar ? 0 : -28, marginBottom: 4 }}
    >
      <View
        className="overflow-hidden rounded-3xl"
        style={{
          borderWidth: 1,
          borderColor:
            resolvedMode === "dark"
              ? "rgba(39,187,151,0.18)"
              : "rgba(39,187,151,0.14)",
          shadowColor: "#000",
          shadowOffset: { width: 0, height: resolvedMode === "dark" ? 6 : 3 },
          shadowOpacity: resolvedMode === "dark" ? 0.28 : 0.08,
          shadowRadius: 16,
          elevation: resolvedMode === "dark" ? 6 : 3,
        }}
      >
        <LinearGradient colors={[...gradient]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          {/* Top row — avatar ring + info */}
          <View className="flex-row items-center gap-3.5 px-4 pb-4 pt-4">
          {!hideAvatar ? (
            <ProfileAvatarWithProgress
              user={user}
              fallbackName={displayName}
              avatarSize={CARD_AVATAR_SIZE}
              progress={ringProgress}
              isComplete={completion.isComplete}
              showProgress
              showOnlineDot
              isOnline={isSelfOnline}
              onPress={navigateToEditProfile}
              iconSize={32}
            />
          ) : null}

            <View className="min-h-[58px] flex-1 justify-center">
              {/* Row 1 — name left, next step right */}
              <View className="flex-row items-start justify-between gap-3">
                <Pressable onPress={navigateToEditProfile} className="max-w-[55%] shrink">
                  <Text
                    className="text-[17px] leading-[22px]"
                    style={{
                      fontFamily: ListifyFonts.bold,
                      color: colors.textPrimary,
                      borderBottomWidth: nameIsPlaceholder ? 1 : 0,
                      borderStyle: "dotted",
                      borderBottomColor:
                        resolvedMode === "dark" ? colors.primary : colors.textPrimary,
                      paddingBottom: nameIsPlaceholder ? 2 : 0,
                    }}
                    numberOfLines={2}
                  >
                    {primaryName}
                  </Text>
                </Pressable>

                {nextStepLabel ? (
                  <Pressable
                    onPress={navigateToNext}
                    className="max-w-[45%] shrink-0 items-end"
                  >
                    <Text
                      className="text-right text-[13px] leading-[18px]"
                      style={{
                        fontFamily: ListifyFonts.semiBold,
                        color: colors.primary,
                        borderBottomWidth: 1,
                        borderStyle: "dotted",
                        borderBottomColor: colors.primary,
                        paddingBottom: 2,
                      }}
                      numberOfLines={2}
                    >
                      {nextStepLabel}
                    </Text>
                  </Pressable>
                ) : null}
              </View>

              {/* Row 2 — steps left, contact right */}
              <View className="mt-2 flex-row items-center justify-between gap-3">
                {incompleteCount > 0 ? (
                  <Text
                    className="flex-1 text-[12px]"
                    style={{
                      fontFamily: ListifyFonts.medium,
                      color: colors.textTertiary,
                    }}
                  >
                    {incompleteCount}/{completion.totalCount} steps incomplete
                  </Text>
                ) : (
                  <View className="flex-1" />
                )}

                {contactLine ? (
                  <Text
                    className="shrink-0 text-right text-[13px]"
                    style={{
                      fontFamily: ListifyFonts.regular,
                      color: colors.textSecondary,
                    }}
                    numberOfLines={1}
                  >
                    {contactLine}
                  </Text>
                ) : null}
              </View>
            </View>
          </View>

          {/* Divider */}
          <View
            style={{
              height: 1,
              marginHorizontal: 16,
              backgroundColor:
                resolvedMode === "dark"
                  ? "rgba(255,255,255,0.08)"
                  : "rgba(39,187,151,0.12)",
            }}
          />

          {/* Bottom CTA row */}
          <Pressable
            onPress={navigateToNext}
            className="flex-row items-center gap-3 px-4 py-3.5"
            style={({ pressed }) => ({ opacity: pressed ? 0.88 : 1 })}
          >
            <Text
              className="flex-1 text-[13px] leading-[19px]"
              style={{
                fontFamily: ListifyFonts.regular,
                color: colors.textSecondary,
              }}
            >
              Complete your profile, so we can surprise you on your special days!
            </Text>
            <View
              className="h-9 w-9 items-center justify-center rounded-full"
              style={{ backgroundColor: colors.primarySoftStrong }}
            >
              <MaterialIcons name="arrow-forward" size={18} color={colors.primary} />
            </View>
          </Pressable>
        </LinearGradient>
      </View>
    </Animated.View>
  );
}

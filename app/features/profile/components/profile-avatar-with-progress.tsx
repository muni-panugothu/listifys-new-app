import { Pressable, View, type ViewStyle } from "react-native";

import { ProfileAvatarImage } from "@/components/profile-avatar-image";
import { OnlinePresenceDot } from "@/components/online-presence-dot";
import type { AuthUser } from "@/features/auth/services/auth-api";
import { ProfileProgressRing } from "@/features/profile/components/profile-progress-ring";
import { useTheme } from "@/providers/theme-provider";

const DEFAULT_STROKE = 3.5;
const DEFAULT_GAP = 2.5;

/** Outer ring diameter when the stroke sits flush around the avatar with a small gap. */
export function computeProgressRingSize(
  avatarSize: number,
  stroke = DEFAULT_STROKE,
  gap = DEFAULT_GAP,
) {
  return avatarSize + (gap + stroke) * 2;
}

type ProfileAvatarWithProgressProps = {
  user: AuthUser | null;
  fallbackName: string;
  avatarSize?: number;
  progress?: number;
  isComplete?: boolean;
  /** When true, draws the completion ring hugging the avatar edge. */
  showProgress?: boolean;
  showOnlineDot?: boolean;
  isOnline?: boolean;
  onPress?: () => void;
  iconSize?: number;
  stroke?: number;
  gap?: number;
  style?: ViewStyle;
};

/**
 * Single integrated profile photo — avatar centered with optional completion ring
 * drawn directly on its outer border (not a separate floating indicator).
 */
export function ProfileAvatarWithProgress({
  user,
  fallbackName,
  avatarSize = 108,
  progress = 0,
  isComplete = false,
  showProgress = false,
  showOnlineDot = false,
  isOnline = false,
  onPress,
  iconSize,
  stroke = DEFAULT_STROKE,
  gap = DEFAULT_GAP,
  style,
}: ProfileAvatarWithProgressProps) {
  const { colors, resolvedMode } = useTheme();
  const ringSize = computeProgressRingSize(avatarSize, stroke, gap);
  const outerSize = showProgress ? ringSize : avatarSize;
  const resolvedIconSize = iconSize ?? Math.round(avatarSize * 0.41);
  const dotSize = Math.max(13, Math.round(avatarSize * 0.15));

  const shellShadow: ViewStyle = {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: resolvedMode === "dark" ? 0.35 : 0.14,
    shadowRadius: 8,
    elevation: 6,
  };

  const avatarBody = (
    <View
      style={{
        width: avatarSize,
        height: avatarSize,
        borderRadius: avatarSize / 2,
        overflow: "hidden",
        backgroundColor:
          resolvedMode === "dark" ? colors.surfaceMuted : colors.surface,
      }}
    >
      <ProfileAvatarImage
        user={user}
        fallbackName={fallbackName}
        style={{ width: avatarSize, height: avatarSize }}
        iconSize={resolvedIconSize}
      />
    </View>
  );

  const avatarContent = onPress ? (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Edit profile photo"
      style={({ pressed }) => ({ opacity: pressed ? 0.92 : 1 })}
    >
      {avatarBody}
    </Pressable>
  ) : (
    avatarBody
  );

  return (
    <View
      style={[
        {
          width: outerSize,
          height: outerSize,
          position: "relative",
          alignItems: "center",
          justifyContent: "center",
        },
        shellShadow,
        style,
      ]}
    >
      {showProgress ? (
        <ProfileProgressRing
          size={ringSize}
          stroke={stroke}
          progress={progress}
          isComplete={isComplete}
          segmentCount={Math.round(ringSize * 1.65)}
        >
          {avatarContent}
        </ProfileProgressRing>
      ) : (
        <View
          style={{
            width: avatarSize,
            height: avatarSize,
            borderRadius: avatarSize / 2,
            overflow: "hidden",
            borderWidth: 3,
            borderColor: colors.surface,
          }}
        >
          {onPress ? (
            <Pressable
              onPress={onPress}
              accessibilityRole="button"
              accessibilityLabel="Edit profile photo"
              style={({ pressed }) => ({ opacity: pressed ? 0.92 : 1 })}
            >
              <ProfileAvatarImage
                user={user}
                fallbackName={fallbackName}
                style={{ width: avatarSize, height: avatarSize }}
                iconSize={resolvedIconSize}
              />
            </Pressable>
          ) : (
            <ProfileAvatarImage
              user={user}
              fallbackName={fallbackName}
              style={{ width: avatarSize, height: avatarSize }}
              iconSize={resolvedIconSize}
            />
          )}
        </View>
      )}

      {showOnlineDot ? (
        <OnlinePresenceDot
          visible={isOnline}
          size={dotSize}
          borderColor={colors.surface}
          borderWidth={2.5}
        />
      ) : null}
    </View>
  );
}

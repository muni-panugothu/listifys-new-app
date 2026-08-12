import { MaterialIcons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import { type StyleProp, View, type ViewStyle } from "react-native";

import { Image } from "@/lib/nativewind-interop";
import {
  DEFAULT_PROFILE_AVATAR_URI,
  resolveProfileImageUri,
} from "@/lib/profile-avatar";

type ProfileAvatarImageProps = {
  user?: {
    profileImageUrl?: string | null;
    profileImage?: string | null;
    googleProfileImage?: string | null;
    avatar?: string | null;
    name?: string | null;
  } | null;
  fallbackName?: string;
  className?: string;
  style?: StyleProp<ViewStyle>;
  iconSize?: number;
};

export function ProfileAvatarImage({
  user,
  fallbackName,
  className = "h-full w-full",
  style,
  iconSize = 28,
}: ProfileAvatarImageProps) {
  const [loadFailed, setLoadFailed] = useState(false);
  const uri = useMemo(
    () => resolveProfileImageUri(user, fallbackName),
    [fallbackName, user],
  );

  useEffect(() => {
    setLoadFailed(false);
  }, [uri]);

  const showFallback = loadFailed;

  if (showFallback) {
    return (
      <View
        className={`items-center justify-center bg-[#E5E7EB] ${className}`}
        style={style}
      >
        <MaterialIcons name="person" size={iconSize} color="#9CA3AF" />
      </View>
    );
  }

  return (
    <Image
      source={uri || DEFAULT_PROFILE_AVATAR_URI}
      contentFit="cover"
      transition={200}
      cachePolicy="memory-disk"
      recyclingKey={uri || DEFAULT_PROFILE_AVATAR_URI}
      className={className}
      style={style}
      onError={() => setLoadFailed(true)}
    />
  );
}

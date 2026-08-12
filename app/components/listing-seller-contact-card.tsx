import { MaterialIcons } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";

import { ProfileAvatarImage } from "@/components/profile-avatar-image";
import { ListifyFonts } from "@/constants/typography";
import { Image } from "@/lib/nativewind-interop";
import type { ListingContactPhone } from "@/lib/listing-contact-phone";
import { useTheme } from "@/providers/theme-provider";

type ListingSellerContactCardProps = {
  title: string;
  name: string;
  subtitle?: string;
  avatarUri?: string | null;
  avatarUser?: Record<string, unknown> | null;
  rating?: number;
  reviewsLabel?: string;
  joinedLabel?: string;
  isVerified?: boolean;
  contactPhone: ListingContactPhone | null;
  onProfilePress?: () => void;
  onMessagePress: () => void;
  onCallPress: () => void;
};

function ContactStars({ rating }: { rating: number }) {
  const { colors } = useTheme();
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
      {Array.from({ length: 5 }).map((_, i) => {
        const iconName =
          i < full ? "star" : i === full && half ? "star-half" : "star-border";
        return <MaterialIcons key={i} name={iconName} size={14} color={colors.warning} />;
      })}
      <Text
        style={{
          marginLeft: 4,
          fontSize: 13,
          fontFamily: ListifyFonts.medium,
          color: colors.textSecondary,
        }}
      >
        {rating.toFixed(1)}
      </Text>
    </View>
  );
}

export function ListingSellerContactCard({
  title,
  name,
  subtitle,
  avatarUri,
  avatarUser,
  rating = 0,
  reviewsLabel,
  joinedLabel,
  isVerified = false,
  contactPhone,
  onProfilePress,
  onMessagePress,
  onCallPress,
}: ListingSellerContactCardProps) {
  const { colors, isDark } = useTheme();
  const cardSurface = isDark ? colors.surfaceElevated : colors.surface;

  const actionBtn = {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  };

  return (
    <View style={{ marginTop: 26 }}>
      <Text
        style={{
          fontFamily: ListifyFonts.bold,
          fontSize: 17,
          color: colors.textPrimary,
        }}
      >
        {title}
      </Text>

      <View
        style={{
          marginTop: 16,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: cardSurface,
          padding: 14,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Pressable
            onPress={onProfilePress}
            disabled={!onProfilePress}
            style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}
          >
            <View style={{ position: "relative" }}>
              <View
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 26,
                  overflow: "hidden",
                  backgroundColor: colors.surfaceMuted,
                }}
              >
                {avatarUser ? (
                  <ProfileAvatarImage
                    user={avatarUser}
                    fallbackName={name}
                    style={{ width: 52, height: 52 }}
                    iconSize={26}
                  />
                ) : avatarUri ? (
                  <Image source={avatarUri} contentFit="cover" className="h-full w-full" />
                ) : (
                  <View
                    style={{
                      flex: 1,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: colors.accentPink,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 20,
                        fontFamily: ListifyFonts.bold,
                        color: colors.textOnPrimary,
                      }}
                    >
                      {name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
              </View>
              {isVerified ? (
                <View
                  style={{
                    position: "absolute",
                    bottom: -1,
                    right: -1,
                    width: 18,
                    height: 18,
                    borderRadius: 9,
                    borderWidth: 2,
                    borderColor: cardSurface,
                    backgroundColor: colors.primary,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <MaterialIcons name="verified" size={11} color={colors.textOnPrimary} />
                </View>
              ) : null}
            </View>

            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Text
                  numberOfLines={1}
                  style={{
                    flexShrink: 1,
                    fontFamily: ListifyFonts.bold,
                    fontSize: 15,
                    color: colors.textPrimary,
                  }}
                >
                  {name}
                </Text>
                {isVerified ? (
                  <MaterialIcons name="verified" size={16} color={colors.primary} />
                ) : null}
              </View>
              {subtitle ? (
                <Text
                  numberOfLines={1}
                  style={{
                    marginTop: 2,
                    fontFamily: ListifyFonts.regular,
                    fontSize: 13,
                    color: colors.textSecondary,
                  }}
                >
                  {subtitle}
                </Text>
              ) : null}
              {rating > 0 ? (
                <View style={{ marginTop: 4 }}>
                  <ContactStars rating={rating} />
                </View>
              ) : null}
              {reviewsLabel ? (
                <Text
                  style={{
                    marginTop: 2,
                    fontFamily: ListifyFonts.regular,
                    fontSize: 12,
                    color: colors.textTertiary,
                  }}
                >
                  {reviewsLabel}
                </Text>
              ) : null}
              {joinedLabel ? (
                <Text
                  style={{
                    marginTop: 2,
                    fontFamily: ListifyFonts.regular,
                    fontSize: 12,
                    color: colors.textTertiary,
                  }}
                >
                  {joinedLabel}
                </Text>
              ) : null}
              {contactPhone ? (
                <Pressable onPress={onCallPress} hitSlop={6}>
                  <Text
                    style={{
                      marginTop: 4,
                      fontFamily: ListifyFonts.semiBold,
                      fontSize: 14,
                      color: colors.primary,
                    }}
                  >
                    {contactPhone.display}
                  </Text>
                </Pressable>
              ) : (
                <Text
                  style={{
                    marginTop: 4,
                    fontFamily: ListifyFonts.regular,
                    fontSize: 13,
                    color: colors.textSecondary,
                  }}
                >
                  Contact number not available
                </Text>
              )}
            </View>
          </Pressable>

          <Pressable
            onPress={onMessagePress}
            style={({ pressed }) => [{ ...actionBtn, opacity: pressed ? 0.85 : 1 }]}
            accessibilityLabel="Message seller"
          >
            <MaterialIcons name="chat-bubble-outline" size={20} color={colors.textOnPrimary} />
          </Pressable>

          <Pressable
            onPress={onCallPress}
            style={({ pressed }) => [{ ...actionBtn, opacity: pressed ? 0.85 : 1 }]}
            accessibilityLabel="Call seller"
          >
            <MaterialIcons name="phone" size={20} color={colors.textOnPrimary} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

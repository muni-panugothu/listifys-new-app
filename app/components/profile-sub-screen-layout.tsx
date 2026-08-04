import { MaterialIcons } from "@expo/vector-icons";
import { type Href, useRouter } from "@/lib/safe-router";
import { type ReactNode } from "react";
import {
  type RefreshControlProps,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ListifyFonts } from "@/constants/typography";
import { useTheme } from "@/providers/theme-provider";

type ProfileSubScreenLayoutProps = {
  title: string;
  children: ReactNode;
  rightAction?: ReactNode;
  onBack?: () => void;
  fallbackRoute?: Href;
  refreshControl?: React.ReactElement<RefreshControlProps>;
  contentContainerStyle?: object;
};

export function ProfileSubScreenLayout({
  title,
  children,
  rightAction,
  onBack,
  fallbackRoute = "/(tabs)/dashboard-home" as Href,
  refreshControl,
  contentContainerStyle,
}: ProfileSubScreenLayoutProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace(fallbackRoute);
  };

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <View
        className="flex-row items-center justify-between px-5"
        style={{ paddingTop: insets.top + 8, paddingBottom: 12 }}
      >
        <View className="flex-1 flex-row items-center">
          <Pressable
            onPress={handleBack}
            hitSlop={12}
            className="mr-2 h-10 w-10 items-center justify-center"
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          >
            <MaterialIcons name="chevron-left" size={32} color={colors.icon} />
          </Pressable>
          <Text
            className="flex-1 text-[22px]"
            style={{ fontFamily: ListifyFonts.bold, color: colors.textPrimary }}
            numberOfLines={1}
          >
            {title}
          </Text>
        </View>
        {rightAction ? <View className="ml-2">{rightAction}</View> : null}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        refreshControl={refreshControl}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: Math.max(insets.bottom, 16) + 24,
          ...contentContainerStyle,
        }}
      >
        {children}
      </ScrollView>
    </View>
  );
}

export function ProfileSectionCard({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  const { colors } = useTheme();

  return (
    <View className="mb-5">
      {title ? (
        <Text
          className="mb-3 text-[13px] uppercase tracking-wide"
          style={{
            fontFamily: ListifyFonts.semiBold,
            color: colors.textTertiary,
          }}
        >
          {title}
        </Text>
      ) : null}
      <View
        className="overflow-hidden rounded-2xl"
        style={{
          backgroundColor: colors.surface,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.04,
          shadowRadius: 8,
          elevation: 2,
        }}
      >
        {children}
      </View>
    </View>
  );
}

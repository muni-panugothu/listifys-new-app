import { MaterialIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "@/lib/safe-router";
import { useMemo } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Image } from "@/lib/nativewind-interop";
import { useTabNavigation } from "@/lib/use-tab-navigation";
import { FloatingBottomNav } from "@/components/floating-bottom-nav";

const draftWatch =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuB--Hv0YCRxdKoyj70pGILS6dra7OUTKVvOo_iA2JbP8uxaY3WzIPwwjGG5BJ3KkJd4MHXR-XHMRPQw5Jq4YQyIEQS_rbpuXmlxra01bn0LIqhb8SstrFyPzx4K7xQUAOxlI8kM1Y1NXSCysS4wYTDFSI8VCXAbCocBmz3m9hfrRz4VYgmTvSnz3gQfc0j-XofuTDDXRAE8XjuzaUbK4UP85YBwh7vXwtDSO7ylwenu9M1JJoCPVL8nmI0txuRShFZtXW9c11x4LAg";
const draftHeadphones =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuBXuo6LzQc-Mij-_BvqApAiuGeVZjLT0p72YYK7WwfvGNiU5KVk_YPcMe5dG5C6hSyjlfjoAiq47yweiyuCU7KRlR4DtdFL8QeFjvAOPU28CWI0fkj-bczfgdeuRJd98TeOqZt6YRWFlfelf3845KQTVIDCBRuTNc8w_WpvEsiNTLEbcOuBwz_ixJK3qJ32sitTBZZ-pcOvXvuVihZmLqAjdOTZTGzFvlFcZelNgfQY1MTz7IbGJTYzlCGvo2BUx-qmDqmRVEAXkvk";

export function ListingDraftSavedScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const topBarHeight = useMemo(() => insets.top + 64, [insets.top]);
  const bottomNavPadding = Math.max(insets.bottom, 8);

  const handleBottomTabPress = useTabNavigation();

  return (
    <View className="flex-1 bg-[#F6F7F8]">
      {/* Top Bar */}
      <View
        className="absolute inset-x-0 top-0 z-50 flex-row items-center justify-between border-b border-slate-100 bg-white/90 px-4"
        style={{
          paddingTop: insets.top,
          height: topBarHeight,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.05,
          shadowRadius: 2,
          elevation: 2,
        }}
      >
        <View className="flex-row items-center gap-2">
          <MaterialIcons name="storefront" size={24} color="#27BB97" />
          <Text className="text-[20px] font-black tracking-tight text-[#27BB97]">
            Listifys
          </Text>
        </View>
        <Pressable className="rounded-full p-2">
          <MaterialIcons name="notifications-none" size={24} color="#64748B" />
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: topBarHeight + 48,
          paddingBottom: 84 + bottomNavPadding,
          alignItems: "center",
        }}
      >
        <View className="w-full max-w-md items-center px-6">
          {/* Illustration */}
          <View className="relative mb-6 h-64 w-64 items-center justify-center">
            <View className="absolute inset-0 rounded-full bg-[rgba(39,187,151,0.1)] blur-3xl" />
            <View className="relative z-10 h-40 w-48 overflow-hidden rounded-xl border border-[#BBCAC3]/30 bg-[#E9EFEB]"
              style={{
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.1,
                shadowRadius: 12,
                elevation: 6,
              }}
            >
              <View className="absolute -top-4 left-4 h-4 w-20 rounded-t-lg bg-[#DDE4DF]" />
              <View className="gap-3 p-4 pt-6">
                <View className="h-2 w-full rounded-full bg-[rgba(39,187,151,0.2)]" />
                <View className="h-2 w-3/4 rounded-full bg-[rgba(39,187,151,0.2)]" />
                <View className="h-2 w-1/2 rounded-full bg-[rgba(39,187,151,0.2)]" />
              </View>
              <View className="absolute bottom-4 right-4 h-12 w-12 items-center justify-center rounded-full bg-[#27BB97]/80"
                style={{ shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 }}
              >
                <MaterialIcons name="check-circle" size={24} color="#FFFFFF" />
              </View>
            </View>
          </View>

          {/* Messaging */}
          <Text className="mb-4 text-center text-[24px] font-bold tracking-tight text-[#161D1A]">
            Saved to Drafts
          </Text>
          <Text className="mb-6 max-w-xs text-center text-[16px] leading-6 text-[#6C7A74]">
            You can finish this listing anytime from your profile.
          </Text>

          {/* Actions */}
          <View className="mb-16 w-full gap-4">
            <Pressable
              onPress={() => router.push("/home-feed-root")}
              className="overflow-hidden rounded-lg"
              style={({ pressed }) => ({
                transform: [{ scale: pressed ? 0.98 : 1 }],
              })}
            >
              <LinearGradient
                colors={["#27BB97", "#1E9E7E"]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={{
                  height: 48,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text className="text-[16px] font-semibold text-white">
                  Continue Browsing
                </Text>
              </LinearGradient>
            </Pressable>
            <Pressable
              onPress={() => router.push("/my-listings-drafts")}
              className="h-12 items-center justify-center rounded-lg border border-slate-100 bg-white"
              style={({ pressed }) => ({
                transform: [{ scale: pressed ? 0.98 : 1 }],
              })}
            >
              <Text className="text-[16px] font-medium text-[#161D1A]">
                View My Drafts
              </Text>
            </Pressable>
          </View>

          {/* Related Drafts */}
          <View className="w-full">
            <Text className="mb-4 text-[18px] font-semibold text-[#161D1A]">
              Related Drafts
            </Text>
            <View className="flex-row gap-3">
              <View className="flex-1 overflow-hidden rounded-xl border border-slate-100 bg-white p-3"
                style={{
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.05,
                  shadowRadius: 3,
                  elevation: 1,
                }}
              >
                <View className="mb-2 aspect-square overflow-hidden rounded-lg bg-[#E9EFEB]">
                  <Image
                    source={draftWatch}
                    contentFit="cover"
                    className="h-full w-full"
                  />
                </View>
                <Text className="text-[16px] font-bold text-[#161D1A]">
                  ₹4,200
                </Text>
                <Text className="text-[12px] font-medium text-[#6C7A74]">
                  Modern Watch
                </Text>
              </View>
              <View className="mt-4 flex-1 overflow-hidden rounded-xl border border-slate-100 bg-white p-3"
                style={{
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.05,
                  shadowRadius: 3,
                  elevation: 1,
                }}
              >
                <View className="mb-2 aspect-square overflow-hidden rounded-lg bg-[#E9EFEB]">
                  <Image
                    source={draftHeadphones}
                    contentFit="cover"
                    className="h-full w-full"
                  />
                </View>
                <Text className="text-[16px] font-bold text-[#161D1A]">
                  ₹12,500
                </Text>
                <Text className="text-[12px] font-medium text-[#6C7A74]">
                  Studio Pro
                </Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>

      <FloatingBottomNav activeTabId="sell" onTabPress={handleBottomTabPress} />
    </View>
  );
}

import { MaterialIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { type Href, useLocalSearchParams, useRouter } from "@/lib/safe-router";
import { useCallback, useMemo } from "react";
import { Pressable, ScrollView, Share, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Image } from "@/lib/nativewind-interop";
import { resolveAbsoluteMediaUrl } from "@/features/auth/services/auth-api";
import { getCurrencySymbol } from "@/lib/currency";
import { useTabNavigation } from "@/lib/use-tab-navigation";
import { FloatingBottomNav } from "@/components/floating-bottom-nav";

export function ListingSuccessScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const topBarHeight = useMemo(() => insets.top + 64, [insets.top]);
  const bottomNavPadding = Math.max(insets.bottom, 8);
  const handleBottomTabPress = useTabNavigation();

  const params = useLocalSearchParams<{
    id?: string;
    categorySlug?: string;
    title?: string;
    price?: string;
    location?: string;
    image?: string;
    category?: string;
    currency?: string;
  }>();

  const listingId = params.id || "";
  const categorySlug = params.categorySlug || "";
  const listingTitle = params.title || "Your Listing";
  const currencySymbol = getCurrencySymbol(params.currency || "INR");
  const listingPrice = params.price
    ? `${currencySymbol}${Number(params.price).toLocaleString()}`
    : "";
  const listingLocation = params.location || "";
  const listingImage = params.image || "";
  const listingCategory = params.category || "";
  const listingImageUrl = listingImage ? resolveAbsoluteMediaUrl(listingImage) : "";

  /** Navigate to the listing's detail screen based on entity type */
  const handleViewListing = () => {
    if (!listingId) return;
    const SPECIAL: Record<string, string> = {
      events: "/event-detail",
      properties: "/property-detail",
      jobs: "/job-detail",
      services: "/service-detail",
    };
    const route = SPECIAL[categorySlug] ?? "/listing-detail-template";
    (router.push as (h: { pathname: string; params: Record<string, string> }) => void)({
      pathname: route,
      params: { category: categorySlug, id: listingId },
    });
  };

  const handleShare = useCallback(async () => {
    const lines = [listingTitle];
    if (listingPrice) lines.push(listingPrice);
    if (listingLocation) lines.push(listingLocation);
    lines.push("Posted on Listifys");
    try {
      await Share.share({
        message: lines.join("\n"),
        title: listingTitle,
      });
    } catch {
      // user dismissed
    }
  }, [listingLocation, listingPrice, listingTitle]);

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
          paddingTop: topBarHeight + 24,
          paddingBottom: 84 + bottomNavPadding,
          alignItems: "center",
        }}
      >
        <View className="w-full max-w-md items-center px-4">
          {/* Success Icon */}
          <View className="mb-4 h-20 w-20 items-center justify-center rounded-full border-4 border-white bg-[rgba(39,187,151,0.1)]"
            style={{
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.1,
              shadowRadius: 12,
              elevation: 6,
            }}
          >
            <View className="h-16 w-16 items-center justify-center rounded-full bg-[#27BB97]">
              <MaterialIcons name="check" size={36} color="#FFFFFF" />
            </View>
          </View>

          {/* Text */}
          <Text className="mb-2 text-center text-[24px] font-bold tracking-tight text-[#161D1A]">
            Success! Your ad is live
          </Text>
          <Text className="mb-6 text-center text-[14px] leading-5 text-[#6C7A74]">
            Millions of buyers can now see your listing. We'll notify you when
            someone reaches out.
          </Text>

          {/* Preview Card */}
          <View className="mb-6 w-full overflow-hidden rounded-xl border border-slate-100 bg-white"
            style={{
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.05,
              shadowRadius: 4,
              elevation: 2,
            }}
          >
            {listingImageUrl ? (
            <View className="relative w-full bg-[#F3F4F6]" style={{ aspectRatio: 4 / 3 }}>
              <Image
                source={{ uri: listingImageUrl }}
                contentFit="contain"
                style={{ width: "100%", height: "100%" }}
                transition={200}
              />
              <Pressable
                onPress={() => void handleShare()}
                className="absolute right-3 top-3 rounded-full bg-white/90 p-2"
                style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
              >
                <MaterialIcons name="share" size={20} color="#161D1A" />
              </Pressable>
              <View className="absolute bottom-3 left-3 rounded-full bg-[#27BB97]/90 px-3 py-1">
                <Text className="text-[12px] font-medium text-white">
                  Live Listing
                </Text>
              </View>
            </View>
            ) : (
              <View className="h-48 w-full items-center justify-center bg-slate-100">
                <MaterialIcons name="image" size={48} color="#94A3B8" />
              </View>
            )}
            <View className="p-4">
              <View className="flex-row items-start justify-between">
                <View className="flex-1 pr-3">
                  <Text className="text-[18px] font-semibold text-[#161D1A]" numberOfLines={2}>
                    {listingTitle}
                  </Text>
                  {listingLocation ? (
                  <View className="mt-1 flex-row items-center gap-1">
                    <MaterialIcons
                      name="location-on"
                      size={14}
                      color="#94A3B8"
                    />
                    <Text className="text-[14px] text-[#6C7A74]">
                      {listingLocation}
                    </Text>
                  </View>
                  ) : null}
                  {listingCategory ? (
                  <View className="mt-1 flex-row items-center gap-1">
                    <MaterialIcons name="category" size={14} color="#94A3B8" />
                    <Text className="text-[12px] text-[#6C7A74]">
                      {listingCategory}
                    </Text>
                  </View>
                  ) : null}
                </View>
                {listingPrice ? (
                <Text className="text-[20px] font-bold text-[#27BB97]">
                  {listingPrice}
                </Text>
                ) : null}
              </View>
              <View className="mt-3 flex-row items-center justify-between border-t border-slate-50 pt-3">
                <View className="flex-row items-center gap-1.5">
                  <View className="h-6 w-6 items-center justify-center rounded-full bg-[rgba(39,187,151,0.1)]">
                    <MaterialIcons name="check-circle" size={14} color="#27BB97" />
                  </View>
                  <Text className="text-[12px] font-medium text-[#27BB97]">
                    Published
                  </Text>
                </View>
                <Pressable
                  onPress={() => void handleShare()}
                  className="flex-row items-center gap-1"
                  style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                >
                  <MaterialIcons name="share" size={16} color="#6C7A74" />
                  <Text className="text-[12px] font-medium text-[#6C7A74]">
                    Share
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>

          {/* Actions */}
          <View className="mb-6 w-full gap-4">
            <Pressable
              onPress={handleViewListing}
              disabled={!listingId}
              className="overflow-hidden rounded-lg"
              style={({ pressed }) => ({
                transform: [{ scale: pressed ? 0.98 : 1 }],
                opacity: !listingId ? 0.5 : 1,
              })}
            >
              <LinearGradient
                colors={["#27BB97", "#1E9E7E"]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={{
                  height: 48,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                <MaterialIcons name="open-in-new" size={20} color="#FFFFFF" />
                <Text className="text-[16px] font-semibold text-white">
                  View Listing
                </Text>
              </LinearGradient>
            </Pressable>
            <Pressable
              onPress={() => router.push("/home-feed-root")}
              className="h-12 flex-row items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white"
              style={({ pressed }) => ({
                backgroundColor: pressed ? "#F8FAFC" : "#FFFFFF",
              })}
            >
              <Text className="text-[16px] font-semibold text-[#161D1A]">
                Back to Home
              </Text>
            </Pressable>
          </View>

          {/* Tips Bento */}
          <View className="w-full flex-row gap-2">
            <View className="flex-1 gap-2 rounded-xl border border-[#E9EFEB] bg-[#F3F4F6] p-4">
              <MaterialIcons name="trending-up" size={22} color="#27BB97" />
              <Text className="text-[12px] font-bold text-[#161D1A]">
                Reach 10x more
              </Text>
              <Text className="text-[11px] leading-4 text-[#6C7A74]">
                Boost your ad to reach thousands of buyers instantly.
              </Text>
            </View>
            <View className="flex-1 gap-2 rounded-xl border border-[#E9EFEB] bg-[#F3F4F6] p-4">
              <MaterialIcons name="verified-user" size={22} color="#27BB97" />
              <Text className="text-[12px] font-bold text-[#161D1A]">
                Safety first
              </Text>
              <Text className="text-[11px] leading-4 text-[#6C7A74]">
                Always meet in public places and use secure payments.
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      <FloatingBottomNav activeTabId="sell" onTabPress={handleBottomTabPress} />
    </View>
  );
}

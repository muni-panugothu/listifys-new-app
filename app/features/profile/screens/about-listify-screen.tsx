import { MaterialIcons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { Image } from "expo-image";
import { type Href, useRouter } from "@/lib/safe-router";
import { useState } from "react";
import {
  Linking,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  ABOUT_CATEGORIES,
  ABOUT_FEATURES,
  ABOUT_HERO,
  ABOUT_STATS,
  ABOUT_TESTIMONIAL,
  ABOUT_WEB_URL,
  LEGAL_CONTACT_EMAIL,
  SUPPORT_EMAIL,
} from "@/constants/legal-content";
import { ListifyColors } from "@/constants/listify-theme";
import { ListifyFonts } from "@/constants/typography";

const APP_VERSION = Constants.expoConfig?.version ?? "1.0.0";

export function AboutListifyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [activeCategory, setActiveCategory] = useState<
    (typeof ABOUT_CATEGORIES)[number]["id"]
  >(ABOUT_CATEGORIES[0].id);

  const push = (route: Href) => router.push(route);
  const selectedCategory =
    ABOUT_CATEGORIES.find((c) => c.id === activeCategory) ?? ABOUT_CATEGORIES[0];

  return (
    <View className="flex-1 bg-white">
      <View
        className="flex-row items-center border-b border-[#E5E7EB] px-4"
        style={{ paddingTop: insets.top + 6, paddingBottom: 10 }}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          className="mr-1 h-10 w-10 items-center justify-center"
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        >
          <MaterialIcons name="arrow-back" size={24} color="#111827" />
        </Pressable>
        <Text
          className="flex-1 text-[17px]"
          style={{ fontFamily: ListifyFonts.semiBold, color: "#111827" }}
        >
          About Listifys
        </Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingBottom: Math.max(insets.bottom, 16) + 32,
        }}
      >
        {/* Hero — OfferUp "Buy. Sell. Connect." */}
        <View className="items-center px-6 pb-10 pt-10">
          <Image
            source={require("@/assets/splashscreenImg/logo.png")}
            style={{ width: 72, height: 72, marginBottom: 20 }}
            contentFit="contain"
          />
          <Text
            className="text-center text-[32px] leading-10"
            style={{ fontFamily: ListifyFonts.bold, color: "#111827" }}
          >
            {ABOUT_HERO.headline}
          </Text>
          <Text
            className="mt-4 text-center text-[16px] leading-[26px]"
            style={{ fontFamily: ListifyFonts.regular, color: "#4B5563" }}
          >
            {ABOUT_HERO.subheadline}
          </Text>
          <Text
            className="mt-3 text-center text-[15px] leading-[24px]"
            style={{ fontFamily: ListifyFonts.regular, color: "#6B7280" }}
          >
            {ABOUT_HERO.body}
          </Text>
        </View>

        {/* Feature blocks */}
        <View className="bg-[#F9FAFB] px-5 py-10">
          {ABOUT_FEATURES.map((feature, index) => (
            <View
              key={feature.id}
              className={`flex-row gap-4 ${index < ABOUT_FEATURES.length - 1 ? "mb-8" : ""}`}
            >
              <View
                className="h-12 w-12 items-center justify-center rounded-full"
                style={{ backgroundColor: "rgba(39,187,151,0.12)" }}
              >
                <MaterialIcons name={feature.icon} size={24} color={ListifyColors.primary} />
              </View>
              <View className="flex-1">
                <Text
                  className="text-[18px]"
                  style={{ fontFamily: ListifyFonts.bold, color: "#111827" }}
                >
                  {feature.title}
                </Text>
                <Text
                  className="mt-1.5 text-[15px] leading-[24px]"
                  style={{ fontFamily: ListifyFonts.regular, color: "#4B5563" }}
                >
                  {feature.description}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* Category tabs — OfferUp Buy & Sell / Jobs / Services */}
        <View className="px-5 py-10">
          <Text
            className="text-center text-[22px] leading-8"
            style={{ fontFamily: ListifyFonts.bold, color: "#111827" }}
          >
            Tap into a world of{"\n"}local opportunity
          </Text>
          <Text
            className="mt-2 text-center text-[15px]"
            style={{ fontFamily: ListifyFonts.regular, color: "#6B7280" }}
          >
            Made for everything that moves life forward
          </Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="mt-6"
            contentContainerStyle={{ gap: 8, paddingHorizontal: 2 }}
          >
            {ABOUT_CATEGORIES.map((category) => {
              const active = category.id === activeCategory;
              return (
                <Pressable
                  key={category.id}
                  onPress={() => setActiveCategory(category.id)}
                  className="rounded-full px-5 py-2.5"
                  style={{
                    backgroundColor: active ? ListifyColors.primary : "#F3F4F6",
                  }}
                >
                  <Text
                    className="text-[14px]"
                    style={{
                      fontFamily: ListifyFonts.semiBold,
                      color: active ? "#FFFFFF" : "#374151",
                    }}
                  >
                    {category.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View className="mt-6 rounded-2xl border border-[#E5E7EB] bg-white p-5">
            <MaterialIcons
              name={selectedCategory.icon}
              size={32}
              color={ListifyColors.primary}
            />
            <Text
              className="mt-4 text-[20px]"
              style={{ fontFamily: ListifyFonts.bold, color: "#111827" }}
            >
              {selectedCategory.title}
            </Text>
            <Text
              className="mt-2 text-[15px] leading-[24px]"
              style={{ fontFamily: ListifyFonts.regular, color: "#4B5563" }}
            >
              {selectedCategory.description}
            </Text>
          </View>
        </View>

        {/* Stats row */}
        <View className="bg-[#111827] px-5 py-10">
          <Text
            className="mb-6 text-center text-[20px] text-white"
            style={{ fontFamily: ListifyFonts.bold }}
          >
            Built for local communities
          </Text>
          <View className="flex-row flex-wrap justify-between gap-y-6">
            {ABOUT_STATS.map((stat) => (
              <View key={stat.label} className="w-[47%] items-center">
                <Text
                  className="text-[28px] text-white"
                  style={{ fontFamily: ListifyFonts.bold }}
                >
                  {stat.value}
                </Text>
                <Text
                  className="mt-1 text-center text-[13px] text-white/75"
                  style={{ fontFamily: ListifyFonts.regular }}
                >
                  {stat.label}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Community quote */}
        <View className="px-6 py-10">
          <Text
            className="text-center text-[13px] uppercase tracking-wider"
            style={{ fontFamily: ListifyFonts.semiBold, color: "#9CA3AF" }}
          >
            What our community is saying
          </Text>
          <Text
            className="mt-4 text-center text-[17px] leading-[28px]"
            style={{ fontFamily: ListifyFonts.regular, color: "#374151" }}
          >
            &ldquo;{ABOUT_TESTIMONIAL.quote}&rdquo;
          </Text>
          <Text
            className="mt-4 text-center text-[14px]"
            style={{ fontFamily: ListifyFonts.semiBold, color: "#6B7280" }}
          >
            — {ABOUT_TESTIMONIAL.author}
          </Text>
        </View>

        {/* CTA band */}
        <View
          className="mx-5 items-center rounded-2xl px-6 py-8"
          style={{ backgroundColor: "rgba(39,187,151,0.08)" }}
        >
          <Text
            className="text-center text-[20px] leading-7"
            style={{ fontFamily: ListifyFonts.bold, color: "#111827" }}
          >
            From big dreams to small wins, get more of the good stuff, right where you are.
          </Text>
        </View>

        {/* Footer — OfferUp company / legal links */}
        <View className="mt-12 border-t border-[#E5E7EB] px-5 pt-8">
          <Text
            className="mb-4 text-[12px] uppercase tracking-wider"
            style={{ fontFamily: ListifyFonts.semiBold, color: "#9CA3AF" }}
          >
            Company
          </Text>
          <FooterLink label="Privacy Policy" onPress={() => push("/privacy-policy")} />
          <FooterLink label="Terms of Service" onPress={() => push("/terms-of-service")} />
          <FooterLink
            label="Help & Support"
            onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
          />
          <FooterLink
            label="Contact"
            onPress={() => Linking.openURL(`mailto:${LEGAL_CONTACT_EMAIL}`)}
          />
          <FooterLink label="Website" onPress={() => Linking.openURL(ABOUT_WEB_URL)} />

          <Text
            className="mt-8 text-center text-[22px]"
            style={{ fontFamily: ListifyFonts.bold, color: ListifyColors.primary }}
          >
            Buy. Sell. Simple.
          </Text>
          <Text
            className="mt-3 text-center text-[12px] text-[#9CA3AF]"
            style={{ fontFamily: ListifyFonts.regular }}
          >
            © {new Date().getFullYear()} Listifys · Version {APP_VERSION}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function FooterLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className="border-b border-[#F3F4F6] py-3.5"
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      <Text
        className="text-[15px]"
        style={{ fontFamily: ListifyFonts.medium, color: "#374151" }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

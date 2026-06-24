import { MaterialIcons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { LinearGradient } from "expo-linear-gradient";
import { type Href, useRouter } from "@/lib/safe-router";
import { Image } from "expo-image";
import { Linking, Pressable, Text, View } from "react-native";

import {
  ProfileSectionCard,
  ProfileSubScreenLayout,
} from "@/components/profile-sub-screen-layout";
import {
  ABOUT_HIGHLIGHTS,
  ABOUT_SAFETY_TIPS,
  LEGAL_CONTACT_EMAIL,
  SUPPORT_EMAIL,
} from "@/constants/legal-content";
import { ListifyColors } from "@/constants/listify-theme";
import { ListifyFonts } from "@/constants/typography";

const APP_VERSION = Constants.expoConfig?.version ?? "1.0.0";
const WEBSITE_URL = "https://listifys.com";

export function AboutListifyScreen() {
  const router = useRouter();

  const push = (route: Href) => router.push(route);

  return (
    <ProfileSubScreenLayout title="About Listify">
      <View
        className="mb-5 overflow-hidden rounded-2xl"
        style={{
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.08,
          shadowRadius: 12,
          elevation: 4,
        }}
      >
        <LinearGradient
          colors={[ListifyColors.primary, ListifyColors.gradientEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          className="items-center px-6 py-8"
        >
          <View className="mb-4 h-20 w-20 items-center justify-center rounded-3xl bg-white/95">
            <Image
              source={require("@/assets/splashscreenImg/logo.png")}
              style={{ width: 56, height: 56 }}
              contentFit="contain"
            />
          </View>
          <Text
            className="text-[24px] text-white"
            style={{ fontFamily: ListifyFonts.bold }}
          >
            Listify
          </Text>
          <Text
            className="mt-1 text-center text-[15px] text-white/90"
            style={{ fontFamily: ListifyFonts.regular }}
          >
            Your local marketplace to buy, sell, and connect
          </Text>
          <View className="mt-4 rounded-full bg-white/20 px-4 py-1.5">
            <Text
              className="text-[12px] text-white"
              style={{ fontFamily: ListifyFonts.semiBold }}
            >
              Version {APP_VERSION}
            </Text>
          </View>
        </LinearGradient>
      </View>

      <ProfileSectionCard>
        <View className="px-4 py-4">
          <Text
            className="text-[15px] leading-6"
            style={{ fontFamily: ListifyFonts.regular, color: "#4B5563" }}
          >
            Listify makes it easy to discover deals near you, list items in minutes, chat with
            buyers and sellers, and explore services, properties, jobs, and events — all in one
            app built for local communities across India.
          </Text>
        </View>
      </ProfileSectionCard>

      <Text
        className="mb-3 text-[13px] uppercase tracking-wide"
        style={{ fontFamily: ListifyFonts.semiBold, color: "#9CA3AF" }}
      >
        What you can do
      </Text>
      <View className="mb-5 flex-row flex-wrap gap-3">
        {ABOUT_HIGHLIGHTS.map((item) => (
          <View
            key={item.title}
            className="min-w-[46%] flex-1 overflow-hidden rounded-2xl bg-white p-4"
            style={{
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.04,
              shadowRadius: 8,
              elevation: 2,
            }}
          >
            <View
              className="mb-3 h-10 w-10 items-center justify-center rounded-xl"
              style={{ backgroundColor: "rgba(39,187,151,0.12)" }}
            >
              <MaterialIcons name={item.icon} size={22} color={ListifyColors.primary} />
            </View>
            <Text
              className="text-[15px]"
              style={{ fontFamily: ListifyFonts.semiBold, color: "#1A1A1A" }}
            >
              {item.title}
            </Text>
            <Text
              className="mt-1 text-[13px] leading-5"
              style={{ fontFamily: ListifyFonts.regular, color: "#6B7280" }}
            >
              {item.description}
            </Text>
          </View>
        ))}
      </View>

      <ProfileSectionCard title="Safety tips">
        {ABOUT_SAFETY_TIPS.map((tip, index) => (
          <View key={tip}>
            <View className="flex-row items-start gap-3 px-4 py-3.5">
              <MaterialIcons
                name="check-circle"
                size={20}
                color={ListifyColors.primary}
                style={{ marginTop: 2 }}
              />
              <Text
                className="flex-1 text-[15px] leading-6"
                style={{ fontFamily: ListifyFonts.regular, color: "#4B5563" }}
              >
                {tip}
              </Text>
            </View>
            {index < ABOUT_SAFETY_TIPS.length - 1 ? (
              <View className="mx-4 h-px bg-[#F0F0F0]" />
            ) : null}
          </View>
        ))}
      </ProfileSectionCard>

      <ProfileSectionCard title="Legal & policies">
        <Pressable
          onPress={() => push("/privacy-policy")}
          className="flex-row items-center justify-between px-4 py-3.5"
          style={({ pressed }) => ({ opacity: pressed ? 0.88 : 1 })}
        >
          <Text
            className="text-[16px]"
            style={{ fontFamily: ListifyFonts.medium, color: "#1A1A1A" }}
          >
            Privacy policy
          </Text>
          <MaterialIcons name="chevron-right" size={22} color="#C4C4C4" />
        </Pressable>
        <View className="mx-4 h-px bg-[#F0F0F0]" />
        <Pressable
          onPress={() => push("/terms-of-service")}
          className="flex-row items-center justify-between px-4 py-3.5"
          style={({ pressed }) => ({ opacity: pressed ? 0.88 : 1 })}
        >
          <Text
            className="text-[16px]"
            style={{ fontFamily: ListifyFonts.medium, color: "#1A1A1A" }}
          >
            Terms of service
          </Text>
          <MaterialIcons name="chevron-right" size={22} color="#C4C4C4" />
        </Pressable>
      </ProfileSectionCard>

      <ProfileSectionCard title="Get in touch">
        <Pressable
          onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
          className="flex-row items-center gap-3 px-4 py-3.5"
          style={({ pressed }) => ({ opacity: pressed ? 0.88 : 1 })}
        >
          <MaterialIcons name="support-agent" size={22} color="#6B7280" />
          <View className="flex-1">
            <Text
              className="text-[15px]"
              style={{ fontFamily: ListifyFonts.medium, color: "#1A1A1A" }}
            >
              Support
            </Text>
            <Text
              className="text-[13px]"
              style={{ fontFamily: ListifyFonts.regular, color: ListifyColors.primary }}
            >
              {SUPPORT_EMAIL}
            </Text>
          </View>
        </Pressable>
        <View className="mx-4 h-px bg-[#F0F0F0]" />
        <Pressable
          onPress={() => Linking.openURL(WEBSITE_URL)}
          className="flex-row items-center gap-3 px-4 py-3.5"
          style={({ pressed }) => ({ opacity: pressed ? 0.88 : 1 })}
        >
          <MaterialIcons name="language" size={22} color="#6B7280" />
          <View className="flex-1">
            <Text
              className="text-[15px]"
              style={{ fontFamily: ListifyFonts.medium, color: "#1A1A1A" }}
            >
              Website
            </Text>
            <Text
              className="text-[13px]"
              style={{ fontFamily: ListifyFonts.regular, color: ListifyColors.primary }}
            >
              listifys.com
            </Text>
          </View>
        </Pressable>
        <View className="mx-4 h-px bg-[#F0F0F0]" />
        <Pressable
          onPress={() => Linking.openURL(`mailto:${LEGAL_CONTACT_EMAIL}`)}
          className="flex-row items-center gap-3 px-4 py-3.5"
          style={({ pressed }) => ({ opacity: pressed ? 0.88 : 1 })}
        >
          <MaterialIcons name="gavel" size={22} color="#6B7280" />
          <View className="flex-1">
            <Text
              className="text-[15px]"
              style={{ fontFamily: ListifyFonts.medium, color: "#1A1A1A" }}
            >
              Legal inquiries
            </Text>
            <Text
              className="text-[13px]"
              style={{ fontFamily: ListifyFonts.regular, color: ListifyColors.primary }}
            >
              {LEGAL_CONTACT_EMAIL}
            </Text>
          </View>
        </Pressable>
      </ProfileSectionCard>

      <Text
        className="mt-2 text-center text-[12px] leading-5"
        style={{ fontFamily: ListifyFonts.regular, color: "#9CA3AF" }}
      >
        © {new Date().getFullYear()} Listify. All rights reserved.
      </Text>
    </ProfileSubScreenLayout>
  );
}

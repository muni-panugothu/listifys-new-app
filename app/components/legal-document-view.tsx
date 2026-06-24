import { MaterialIcons } from "@expo/vector-icons";
import { useRef } from "react";
import {
  Linking,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { LegalDocument } from "@/constants/legal-content";
import { ListifyColors } from "@/constants/listify-theme";
import { APP_SCREEN_BG } from "@/constants/theme";
import { ListifyFonts } from "@/constants/typography";

type LegalDocumentViewProps = {
  document: LegalDocument;
  onBack: () => void;
  fallbackRoute?: string;
};

export function LegalDocumentView({ document, onBack }: LegalDocumentViewProps) {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const sectionOffsets = useRef<Record<string, number>>({});

  const scrollToSection = (id: string) => {
    const y = sectionOffsets.current[id];
    if (y != null) {
      scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
    }
  };

  return (
    <View className="flex-1" style={{ backgroundColor: APP_SCREEN_BG }}>
      <View
        className="flex-row items-center px-5"
        style={{ paddingTop: insets.top + 8, paddingBottom: 12 }}
      >
        <Pressable
          onPress={onBack}
          hitSlop={12}
          className="mr-2 h-10 w-10 items-center justify-center"
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        >
          <MaterialIcons name="chevron-left" size={32} color="#1A1A1A" />
        </Pressable>
        <Text
          className="flex-1 text-[22px]"
          style={{ fontFamily: ListifyFonts.bold, color: "#1A1A1A" }}
          numberOfLines={1}
        >
          {document.title}
        </Text>
      </View>

      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: Math.max(insets.bottom, 16) + 32,
        }}
      >
        <View
          className="mb-5 overflow-hidden rounded-2xl bg-white p-5"
          style={{
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.04,
            shadowRadius: 8,
            elevation: 2,
          }}
        >
          <View className="mb-4 self-start rounded-full bg-[#F0FDF9] px-3 py-1.5">
            <Text
              className="text-[12px]"
              style={{ fontFamily: ListifyFonts.semiBold, color: ListifyColors.primary }}
            >
              Last updated {document.lastUpdated}
            </Text>
          </View>
          <Text
            className="text-[15px] leading-6"
            style={{ fontFamily: ListifyFonts.regular, color: "#4B5563" }}
          >
            {document.intro}
          </Text>
        </View>

        {document.sections.length > 4 ? (
          <View
            className="mb-5 overflow-hidden rounded-2xl bg-white p-4"
            style={{
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.04,
              shadowRadius: 8,
              elevation: 2,
            }}
          >
            <Text
              className="mb-3 text-[13px] uppercase tracking-wide"
              style={{ fontFamily: ListifyFonts.semiBold, color: "#9CA3AF" }}
            >
              On this page
            </Text>
            {document.sections.map((section, index) => (
              <Pressable
                key={section.id}
                onPress={() => scrollToSection(section.id)}
                className="flex-row items-center py-2.5"
                style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
              >
                <Text
                  className="mr-3 w-6 text-[13px]"
                  style={{ fontFamily: ListifyFonts.semiBold, color: ListifyColors.primary }}
                >
                  {index + 1}.
                </Text>
                <Text
                  className="flex-1 text-[15px]"
                  style={{ fontFamily: ListifyFonts.medium, color: "#1A1A1A" }}
                >
                  {section.title}
                </Text>
                <MaterialIcons name="south" size={16} color="#C4C4C4" />
              </Pressable>
            ))}
          </View>
        ) : null}

        {document.sections.map((section, index) => (
          <View
            key={section.id}
            onLayout={(event) => {
              sectionOffsets.current[section.id] = event.nativeEvent.layout.y;
            }}
            className="mb-4 overflow-hidden rounded-2xl bg-white p-5"
            style={{
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.04,
              shadowRadius: 8,
              elevation: 2,
            }}
          >
            <View className="mb-3 flex-row items-start gap-3">
              <View
                className="h-8 w-8 items-center justify-center rounded-xl"
                style={{ backgroundColor: "rgba(39,187,151,0.12)" }}
              >
                <Text
                  className="text-[13px]"
                  style={{ fontFamily: ListifyFonts.bold, color: ListifyColors.primary }}
                >
                  {index + 1}
                </Text>
              </View>
              <Text
                className="flex-1 pt-0.5 text-[17px]"
                style={{ fontFamily: ListifyFonts.semiBold, color: "#1A1A1A" }}
              >
                {section.title}
              </Text>
            </View>

            {section.paragraphs?.map((paragraph) => (
              <Text
                key={paragraph.slice(0, 48)}
                className="mb-3 text-[15px] leading-6"
                style={{ fontFamily: ListifyFonts.regular, color: "#4B5563" }}
              >
                {paragraph}
              </Text>
            ))}

            {section.bullets?.map((bullet) => (
              <View key={bullet.slice(0, 48)} className="mb-2.5 flex-row items-start gap-2.5">
                <View
                  className="mt-2 h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: ListifyColors.primary }}
                />
                <Text
                  className="flex-1 text-[15px] leading-6"
                  style={{ fontFamily: ListifyFonts.regular, color: "#4B5563" }}
                >
                  {bullet}
                </Text>
              </View>
            ))}
          </View>
        ))}

        <Pressable
          onPress={() => Linking.openURL(`mailto:${document.contactEmail}`)}
          className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white p-5"
          style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
        >
          <View className="flex-row items-center gap-3">
            <View
              className="h-11 w-11 items-center justify-center rounded-2xl"
              style={{ backgroundColor: "rgba(39,187,151,0.12)" }}
            >
              <MaterialIcons name="mail-outline" size={22} color={ListifyColors.primary} />
            </View>
            <View className="flex-1">
              <Text
                className="text-[15px]"
                style={{ fontFamily: ListifyFonts.semiBold, color: "#1A1A1A" }}
              >
                Questions about this document?
              </Text>
              <Text
                className="mt-0.5 text-[14px]"
                style={{ fontFamily: ListifyFonts.medium, color: ListifyColors.primary }}
              >
                {document.contactEmail}
              </Text>
            </View>
            <MaterialIcons name="open-in-new" size={20} color="#9CA3AF" />
          </View>
        </Pressable>
      </ScrollView>
    </View>
  );
}

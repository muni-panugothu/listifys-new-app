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

import type { LegalChapter, LegalDocument } from "@/constants/legal-content";
import { ListifyColors } from "@/constants/listify-theme";
import { ListifyFonts } from "@/constants/typography";

const PAGE_BG = "#FFFFFF";
const BODY_COLOR = "#374151";
const MUTED_COLOR = "#6B7280";
const BORDER_COLOR = "#E5E7EB";

type LegalDocumentViewProps = {
  document: LegalDocument;
  onBack: () => void;
};

export function LegalDocumentView({ document, onBack }: LegalDocumentViewProps) {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const sectionOffsets = useRef<Record<string, number>>({});

  const scrollToChapter = (id: string) => {
    const y = sectionOffsets.current[id];
    if (y != null) {
      scrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
    }
  };

  return (
    <View className="flex-1" style={{ backgroundColor: PAGE_BG }}>
      <View
        className="flex-row items-center border-b px-4"
        style={{
          paddingTop: insets.top + 6,
          paddingBottom: 10,
          borderBottomColor: BORDER_COLOR,
          backgroundColor: PAGE_BG,
        }}
      >
        <Pressable
          onPress={onBack}
          hitSlop={12}
          className="mr-1 h-10 w-10 items-center justify-center"
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        >
          <MaterialIcons name="arrow-back" size={24} color="#111827" />
        </Pressable>
        <Text
          className="flex-1 text-[17px]"
          style={{ fontFamily: ListifyFonts.semiBold, color: "#111827" }}
          numberOfLines={1}
        >
          {document.title}
        </Text>
      </View>

      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 28,
          paddingBottom: Math.max(insets.bottom, 20) + 40,
        }}
      >
        <Text
          className="text-[28px] leading-8"
          style={{ fontFamily: ListifyFonts.bold, color: "#111827" }}
        >
          {document.title}
        </Text>
        <Text
          className="mt-3 text-[14px]"
          style={{ fontFamily: ListifyFonts.regular, color: MUTED_COLOR }}
        >
          Last updated: {document.lastUpdated}
        </Text>

        <View className="my-6 h-px" style={{ backgroundColor: BORDER_COLOR }} />

        {document.intro.split("\n\n").map((block) => (
          <Text
            key={block.slice(0, 40)}
            className="mb-4 text-[15px] leading-[26px]"
            style={{ fontFamily: ListifyFonts.regular, color: BODY_COLOR }}
          >
            {block}
          </Text>
        ))}

        <View className="mb-8 rounded-lg border px-4 py-3" style={{ borderColor: BORDER_COLOR }}>
          <Text
            className="mb-2 text-[12px] uppercase tracking-wider"
            style={{ fontFamily: ListifyFonts.semiBold, color: MUTED_COLOR }}
          >
            On this page
          </Text>
          {document.chapters.map((chapter) => (
            <Pressable
              key={chapter.id}
              onPress={() => scrollToChapter(chapter.id)}
              className="py-2"
              style={({ pressed }) => ({ opacity: pressed ? 0.65 : 1 })}
            >
              <Text
                className="text-[14px] leading-5"
                style={{ fontFamily: ListifyFonts.medium, color: ListifyColors.primary }}
              >
                {chapter.roman}. {chapter.title}
              </Text>
            </Pressable>
          ))}
        </View>

        {document.chapters.map((chapter) => (
          <ChapterBlock
            key={chapter.id}
            chapter={chapter}
            onLayout={(y) => {
              sectionOffsets.current[chapter.id] = y;
            }}
          />
        ))}

        <View className="mt-4 border-t pt-8" style={{ borderTopColor: BORDER_COLOR }}>
          <Text
            className="text-[20px]"
            style={{ fontFamily: ListifyFonts.bold, color: "#111827" }}
          >
            {document.contactTitle}
          </Text>
          {document.contactNote ? (
            <Text
              className="mt-3 text-[15px] leading-[26px]"
              style={{ fontFamily: ListifyFonts.regular, color: BODY_COLOR }}
            >
              {document.contactNote}
            </Text>
          ) : null}
          <Pressable
            onPress={() => Linking.openURL(`mailto:${document.contactEmail}`)}
            className="mt-3"
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          >
            <Text
              className="text-[15px]"
              style={{ fontFamily: ListifyFonts.semiBold, color: ListifyColors.primary }}
            >
              {document.contactEmail}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function ChapterBlock({
  chapter,
  onLayout,
}: {
  chapter: LegalChapter;
  onLayout: (y: number) => void;
}) {
  return (
    <View
      className="mb-10"
      onLayout={(event) => onLayout(event.nativeEvent.layout.y)}
    >
      <Text
        className="text-[20px] leading-7"
        style={{ fontFamily: ListifyFonts.bold, color: "#111827" }}
      >
        {chapter.roman}. {chapter.title}
      </Text>

      {chapter.intro ? (
        <Text
          className="mt-3 text-[15px] leading-[26px]"
          style={{ fontFamily: ListifyFonts.regular, color: BODY_COLOR }}
        >
          {chapter.intro}
        </Text>
      ) : null}

      {chapter.subsections.map((subsection) => (
        <View key={subsection.id} className="mt-6">
          <Text
            className="text-[17px] leading-6"
            style={{ fontFamily: ListifyFonts.semiBold, color: "#111827" }}
          >
            {subsection.label}. {subsection.title}
          </Text>

          {subsection.paragraphs?.map((paragraph) => (
            <Text
              key={paragraph.slice(0, 48)}
              className="mt-3 text-[15px] leading-[26px]"
              style={{ fontFamily: ListifyFonts.regular, color: BODY_COLOR }}
            >
              {paragraph}
            </Text>
          ))}

          {subsection.items?.map((item, index) => (
            <View key={item.slice(0, 48)} className="mt-3 flex-row items-start gap-2">
              <Text
                className="w-5 text-[15px] leading-[26px]"
                style={{ fontFamily: ListifyFonts.medium, color: BODY_COLOR }}
              >
                {index + 1}.
              </Text>
              <Text
                className="flex-1 text-[15px] leading-[26px]"
                style={{ fontFamily: ListifyFonts.regular, color: BODY_COLOR }}
              >
                {item}
              </Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

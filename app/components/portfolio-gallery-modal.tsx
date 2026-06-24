import { MaterialIcons } from "@expo/vector-icons";
import { Modal, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ListifyColors } from "@/constants/listify-theme";
import { ListifyFonts } from "@/constants/typography";
import { Image } from "@/lib/nativewind-interop";

type PortfolioGalleryModalProps = {
  visible: boolean;
  title?: string;
  images: string[];
  onClose: () => void;
};

export function PortfolioGalleryModal({
  visible,
  title = "Portfolio",
  images,
  onClose,
}: PortfolioGalleryModalProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const imageSize = (width - 48 - 12) / 2;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-black/50">
        <Pressable className="flex-1" onPress={onClose} />
        <View
          className="max-h-[88%] rounded-t-3xl bg-white"
          style={{ paddingBottom: Math.max(insets.bottom, 16) }}
        >
          <View className="flex-row items-center justify-between border-b border-[#F3F4F6] px-5 py-4">
            <Text
              className="text-[20px] text-[#161D1A]"
              style={{ fontFamily: ListifyFonts.bold }}
            >
              {title}
            </Text>
            <Pressable onPress={onClose} hitSlop={12} className="rounded-full p-2">
              <MaterialIcons name="close" size={22} color="#94A3B8" />
            </Pressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: 20,
              paddingTop: 16,
              paddingBottom: 8,
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 12,
            }}
          >
            {images.length === 0 ? (
              <View className="w-full items-center py-16">
                <MaterialIcons name="photo-library" size={48} color="#D1D5DB" />
                <Text
                  className="mt-3 text-[14px] text-[#9CA3AF]"
                  style={{ fontFamily: ListifyFonts.regular }}
                >
                  No portfolio images yet
                </Text>
              </View>
            ) : (
              images.map((uri, index) => (
                <View
                  key={`${uri}-${index}`}
                  className="overflow-hidden rounded-xl bg-[#F3F4F6]"
                  style={{ width: imageSize, height: imageSize }}
                >
                  <Image
                    source={uri}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    recyclingKey={uri}
                    transition={120}
                    style={{ width: imageSize, height: imageSize }}
                  />
                </View>
              ))
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

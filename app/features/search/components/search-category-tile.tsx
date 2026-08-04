import { memo } from "react";
import { Image, Pressable, Text, View } from "react-native";

import { CATEGORY_IMAGES } from "@/constants/category-images";
import { ListifyFonts } from "@/constants/typography";
import type { CategorySlug } from "@/constants/categories";
import { useTheme } from "@/providers/theme-provider";

type SearchCategoryTileProps = {
  slug: CategorySlug;
  label: string;
  size: number;
  onPress: () => void;
};

function SearchCategoryTileImpl({
  slug,
  label,
  size,
  onPress,
}: SearchCategoryTileProps) {
  const { colors } = useTheme();
  const image = CATEGORY_IMAGES[slug] ?? CATEGORY_IMAGES.others;
  const cardHeight = Math.round(size * 1.12);
  const imageHeight = Math.round(cardHeight * 0.72);
  const labelHeight = cardHeight - imageHeight;
  const radius = 14;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({ width: size, opacity: pressed ? 0.88 : 1 })}
    >
      <View
        style={{
          width: size,
          height: cardHeight,
          borderRadius: radius,
          backgroundColor: colors.surface,
          overflow: "hidden",
          shadowColor: "#000000",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.1,
          shadowRadius: 4,
          elevation: 2,
        }}
      >
        <Image
          source={image}
          style={{ width: size, height: imageHeight }}
          resizeMode="cover"
        />
        <View
          style={{
            height: labelHeight,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 4,
            backgroundColor: colors.surface,
          }}
        >
          <Text
            numberOfLines={2}
            style={{
              fontFamily: ListifyFonts.bold,
              fontSize: size < 84 ? 10 : 11,
              lineHeight: 13,
              color: colors.textPrimary,
              textAlign: "center",
              fontWeight: "700",
            }}
          >
            {label}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

export const SearchCategoryTile = memo(SearchCategoryTileImpl);

import { MaterialIcons } from "@expo/vector-icons";
import { useMemo } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";

import { ListingVideoPlayer } from "@/components/listing-media-viewer";
import type { ListingItem } from "@/features/listing/services/listing-api";
import {
  buildListingMediaGallery,
  type ListingMediaGalleryEntry,
} from "@/lib/listing-media";
import { Image } from "@/lib/nativewind-interop";
import { useTheme } from "@/providers/theme-provider";

export type EventListingMediaProps = {
  listing: Pick<ListingItem, "images" | "videos">;
  style?: StyleProp<ViewStyle>;
  recyclingKey?: string;
  /** When false the video pauses (viewport / carousel visibility). */
  isActive?: boolean;
  autoPlay?: boolean;
  muted?: boolean;
  paused?: boolean;
  loop?: boolean;
  showControls?: boolean;
  showPlayOverlay?: boolean;
  onVideoEnded?: () => void;
  onVideoProgress?: (progress: number, durationSec: number) => void;
  placeholderIconSize?: number;
  contentFit?: "cover" | "contain";
};

export function getEventPrimaryMedia(
  listing: Pick<ListingItem, "images" | "videos">,
): ListingMediaGalleryEntry | null {
  const gallery = buildListingMediaGallery(listing);
  return gallery[0] ?? null;
}

export function getEventMediaPosterUrl(
  listing: Pick<ListingItem, "images" | "videos">,
): string {
  const primary = getEventPrimaryMedia(listing);
  if (!primary) return "";
  if (primary.type === "video") {
    return primary.thumbnailUrl ?? listing.images?.[0] ?? "";
  }
  return primary.url;
}

export function eventListingHasMedia(
  listing: Pick<ListingItem, "images" | "videos">,
): boolean {
  return getEventPrimaryMedia(listing) != null;
}

export function EventListingMedia({
  listing,
  style,
  recyclingKey,
  isActive = false,
  autoPlay,
  muted = true,
  paused = false,
  loop = false,
  showControls = false,
  showPlayOverlay = false,
  onVideoEnded,
  onVideoProgress,
  placeholderIconSize = 40,
  contentFit = "cover",
}: EventListingMediaProps) {
  const { colors } = useTheme();
  const primary = useMemo(() => getEventPrimaryMedia(listing), [listing]);
  const shouldAutoplay = autoPlay ?? isActive;

  if (!primary) {
    return (
      <View
        style={[
          { flex: 1, alignItems: "center", justifyContent: "center" },
          style,
        ]}
      >
        <MaterialIcons
          name="event"
          size={placeholderIconSize}
          color={colors.iconMuted}
        />
      </View>
    );
  }

  if (primary.type === "video") {
    return (
      <ListingVideoPlayer
        uri={primary.url}
        poster={primary.thumbnailUrl}
        style={[{ width: "100%", height: "100%" }, style]}
        autoPlay={shouldAutoplay}
        isActive={isActive || shouldAutoplay}
        muted={muted}
        paused={paused}
        loop={loop}
        showControls={showControls}
        showPlayOverlay={showPlayOverlay}
        onEnded={onVideoEnded}
        onProgress={onVideoProgress}
      />
    );
  }

  return (
    <Image
      source={primary.url}
      contentFit={contentFit}
      transition={140}
      cachePolicy="memory-disk"
      recyclingKey={recyclingKey ?? primary.url}
      style={[{ width: "100%", height: "100%" }, style]}
    />
  );
}

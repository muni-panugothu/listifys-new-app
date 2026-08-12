import { MaterialIcons } from "@expo/vector-icons";
import { memo, useMemo } from "react";
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
  /** When false, video shows poster only. Defaults to true for event cards. */
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

function EventListingMediaImpl({
  listing,
  style,
  recyclingKey,
  isActive = true,
  autoPlay = true,
  muted = true,
  paused = false,
  loop = true,
  showControls = false,
  showPlayOverlay = false,
  onVideoEnded,
  onVideoProgress,
  placeholderIconSize = 40,
  contentFit = "cover",
}: EventListingMediaProps) {
  const { colors } = useTheme();
  const primary = useMemo(() => getEventPrimaryMedia(listing), [listing]);
  const shouldAutoplay = autoPlay && isActive && !paused;

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
    const poster = primary.thumbnailUrl ?? listing.images?.[0] ?? "";

    if (!shouldAutoplay) {
      return (
        <View style={[{ width: "100%", height: "100%", overflow: "hidden" }, style]}>
          {poster ? (
            <Image
              source={poster}
              contentFit={contentFit}
              transition={0}
              cachePolicy="memory-disk"
              recyclingKey={recyclingKey ?? poster}
              style={{ width: "100%", height: "100%" }}
            />
          ) : (
            <View
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: colors.surfaceMuted,
              }}
            >
              <MaterialIcons name="videocam" size={placeholderIconSize} color={colors.iconMuted} />
            </View>
          )}
        </View>
      );
    }

    return (
      <ListingVideoPlayer
        uri={primary.url}
        poster={poster || undefined}
        style={[{ width: "100%", height: "100%" }, style]}
        autoPlay
        isActive
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

export const EventListingMedia = memo(
  EventListingMediaImpl,
  (prev, next) =>
    prev.isActive === next.isActive &&
    prev.autoPlay === next.autoPlay &&
    prev.paused === next.paused &&
    prev.loop === next.loop &&
    prev.listing === next.listing,
);

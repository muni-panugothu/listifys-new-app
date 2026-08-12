import { MaterialIcons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { ListifyFonts } from "@/constants/typography";
import {
  formatMediaDuration,
  type ListingMediaGalleryEntry,
} from "@/lib/listing-media";
import { getNativeListingVideoPlayer } from "@/lib/expo-video-support";
import { Image } from "@/lib/nativewind-interop";
import { useTheme } from "@/providers/theme-provider";

type ListingVideoPlayerProps = {
  uri: string;
  poster?: string;
  style?: StyleProp<ViewStyle>;
  autoPlay?: boolean;
  isActive?: boolean;
  muted?: boolean;
  paused?: boolean;
  loop?: boolean;
  showControls?: boolean;
  showPlayOverlay?: boolean;
  onPress?: () => void;
  compact?: boolean;
  onEnded?: () => void;
  onProgress?: (progress: number, durationSec: number) => void;
};

function ListingVideoPosterFallback({
  uri,
  poster,
  style,
  onPress,
  compact = false,
  showControls = true,
  autoPlay = false,
  isActive,
  showPlayOverlay = false,
}: ListingVideoPlayerProps) {
  const posterSource = poster ?? uri;
  const shouldAutoplay = (isActive ?? autoPlay) && !showPlayOverlay;

  return (
    <Pressable
      onPress={onPress}
      style={[{ overflow: "hidden", backgroundColor: "#111827" }, style]}
    >
      {posterSource ? (
        <Image
          source={posterSource}
          contentFit="cover"
          className="absolute inset-0 h-full w-full"
          style={{ opacity: poster ? 1 : 0.35 }}
        />
      ) : null}
      {!shouldAutoplay ? (
        <View
          pointerEvents="none"
          className="absolute inset-0 items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.28)" }}
        >
          <View
            className="items-center justify-center rounded-full"
            style={{
              width: compact ? 36 : 56,
              height: compact ? 36 : 56,
              backgroundColor: "rgba(0,0,0,0.55)",
            }}
          >
            <MaterialIcons
              name="play-arrow"
              size={compact ? 22 : 34}
              color="#FFFFFF"
            />
          </View>
        </View>
      ) : null}
      {compact ? (
        <View
          pointerEvents="none"
          className="absolute bottom-1 right-1 rounded-md px-1.5 py-0.5"
          style={{ backgroundColor: "rgba(0,0,0,0.65)" }}
        >
          <MaterialIcons name="videocam" size={12} color="#FFFFFF" />
        </View>
      ) : !showControls ? null : (
        <View
          pointerEvents="none"
          className="absolute bottom-3 left-3 right-3 rounded-xl px-3 py-2"
          style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
        >
          <Text
            className="text-center text-[11px] text-white/90"
            style={{ fontFamily: ListifyFonts.regular }}
          >
            Rebuild the dev client to enable in-app video playback.
          </Text>
        </View>
      )}
    </Pressable>
  );
}

export function ListingVideoPlayer(props: ListingVideoPlayerProps) {
  const NativePlayer = useMemo(() => getNativeListingVideoPlayer(), []);
  if (NativePlayer) {
    const Player = NativePlayer;
    return <Player {...props} />;
  }
  return <ListingVideoPosterFallback {...props} />;
}

type ListingMediaThumbProps = {
  entry: ListingMediaGalleryEntry;
  size?: number;
  onPress?: () => void;
  onRemove?: () => void;
  overlay?: React.ReactNode;
  durationLabel?: string;
};

export function ListingMediaThumb({
  entry,
  size = 96,
  onPress,
  onRemove,
  overlay,
  durationLabel,
}: ListingMediaThumbProps) {
  const { colors } = useTheme();
  const poster = entry.thumbnailUrl ?? (entry.type === "image" ? entry.url : undefined);

  return (
    <View
      className="overflow-hidden rounded-2xl border"
      style={{ width: size, height: size, borderColor: colors.border }}
    >
      {entry.type === "video" ? (
        <ListingVideoPlayer
          uri={entry.url}
          poster={poster}
          compact
          showControls={false}
          onPress={onPress}
          style={{ width: size, height: size }}
        />
      ) : (
        <Pressable onPress={onPress} className="h-full w-full">
          <Image source={entry.url} contentFit="cover" className="h-full w-full" />
        </Pressable>
      )}

      {entry.type === "video" ? (
        <View
          pointerEvents="none"
          className="absolute bottom-1 left-1 rounded-md px-1.5 py-0.5"
          style={{ backgroundColor: "rgba(0,0,0,0.65)" }}
        >
          <Text
            className="text-[10px] text-white"
            style={{ fontFamily: ListifyFonts.medium }}
          >
            {durationLabel ?? formatMediaDuration(entry.duration)}
          </Text>
        </View>
      ) : null}

      {overlay}

      {onRemove ? (
        <Pressable
          onPress={onRemove}
          className="absolute right-1 top-1 rounded-full p-1"
          style={{ backgroundColor: colors.surfaceElevated }}
        >
          <MaterialIcons name="close" size={16} color={colors.danger} />
        </Pressable>
      ) : null}
    </View>
  );
}

type ListingMediaPreviewModalProps = {
  visible: boolean;
  entry: ListingMediaGalleryEntry | null;
  onClose: () => void;
};

export function ListingMediaPreviewModal({
  visible,
  entry,
  onClose,
}: ListingMediaPreviewModalProps) {
  const { colors } = useTheme();

  if (!entry) return null;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View className="flex-1" style={{ backgroundColor: "rgba(0,0,0,0.92)" }}>
        <Pressable
          onPress={onClose}
          className="absolute right-4 top-12 z-10 rounded-full p-2"
          style={{ backgroundColor: "rgba(255,255,255,0.12)" }}
        >
          <MaterialIcons name="close" size={24} color="#FFFFFF" />
        </Pressable>

        <View className="flex-1 items-center justify-center px-4">
          {entry.type === "video" ? (
            <View
              className="overflow-hidden rounded-2xl"
              style={{ width: "100%", aspectRatio: 9 / 16, maxHeight: "78%" }}
            >
              <ListingVideoPlayer uri={entry.url} autoPlay showControls />
            </View>
          ) : (
            <Image
              source={entry.url}
              contentFit="contain"
              style={{ width: "100%", height: "78%" }}
            />
          )}
        </View>

        {entry.type === "video" && entry.duration ? (
          <Text
            className="pb-8 text-center text-[13px]"
            style={{ fontFamily: ListifyFonts.regular, color: colors.textSecondary }}
          >
            Duration: {formatMediaDuration(entry.duration)}
          </Text>
        ) : null}
      </View>
    </Modal>
  );
}

export function useListingMediaPreview() {
  const [previewEntry, setPreviewEntry] = useState<ListingMediaGalleryEntry | null>(null);

  const openPreview = (entry: ListingMediaGalleryEntry) => setPreviewEntry(entry);
  const closePreview = () => setPreviewEntry(null);

  const modal = useMemo(
    () => (
      <ListingMediaPreviewModal
        visible={Boolean(previewEntry)}
        entry={previewEntry}
        onClose={closePreview}
      />
    ),
    [previewEntry],
  );

  return { openPreview, closePreview, modal };
}

export function ListingMediaUploadOverlay({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "neutral" | "danger" | "warning";
}) {
  const backgroundColor =
    tone === "danger"
      ? "rgba(185,28,28,0.92)"
      : tone === "warning"
        ? "rgba(194,65,12,0.88)"
        : "rgba(0,0,0,0.55)";

  return (
    <View
      className="absolute inset-0 items-center justify-center"
      style={{ borderRadius: 16, backgroundColor }}
    >
      {tone === "neutral" ? (
        <ActivityIndicator size="small" color="#FFFFFF" />
      ) : (
        <MaterialIcons
          name={tone === "danger" ? "block" : "warning"}
          size={24}
          color="#FFFFFF"
        />
      )}
      <Text
        className="mt-1 px-1 text-center text-[9px] text-white"
        style={{ fontFamily: ListifyFonts.medium }}
      >
        {label}
      </Text>
    </View>
  );
}

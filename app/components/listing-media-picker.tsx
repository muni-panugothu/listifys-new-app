import { MaterialIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useCallback, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";

import {
  ListingMediaPreviewModal,
  ListingMediaThumb,
  ListingMediaUploadOverlay,
} from "@/components/listing-media-viewer";
import { ListifyFonts } from "@/constants/typography";
import {
  createPostMediaId,
  formatMediaDuration,
  MAX_LISTING_MEDIA,
  MAX_VIDEO_DURATION_SEC,
  normalizeVideoDurationSeconds,
  type ListingMediaGalleryEntry,
  type PostMediaItem,
  validateVideoAsset,
} from "@/lib/listing-media";
import { useTheme } from "@/providers/theme-provider";
import { showErrorToast } from "@/lib/toast";

type ImageScanResult = {
  status: "scanning" | "allowed" | "blocked" | "review";
  category?: string;
};

type ListingMediaPickerProps = {
  mediaItems: PostMediaItem[];
  onAddMedia: (items: PostMediaItem[]) => void;
  onRemoveMedia: (index: number) => void;
  imageScanMap?: Record<string, ImageScanResult>;
  disabled?: boolean;
};

const MODERATION_CATEGORY_SHORT: Record<string, string> = {
  explicit_sexual: "Explicit",
  sexual: "Adult content",
  graphic_violence: "Violence",
  violence: "Violence",
  racy: "Suggestive",
  illegal_drugs: "Drugs",
  illegal_drugs_web: "Drugs",
  weapon: "Weapon",
  weapon_web: "Weapon",
  hate_symbol: "Hate symbol",
};

function toGalleryEntry(item: PostMediaItem): ListingMediaGalleryEntry {
  return {
    type: item.type,
    url: item.uri,
    duration: item.duration,
    mimeType: item.mimeType,
    order: item.order,
  };
}

export function ListingMediaPicker({
  mediaItems,
  onAddMedia,
  onRemoveMedia,
  imageScanMap = {},
  disabled = false,
}: ListingMediaPickerProps) {
  const { colors } = useTheme();
  const [previewEntry, setPreviewEntry] = useState<ListingMediaGalleryEntry | null>(null);

  const remaining = MAX_LISTING_MEDIA - mediaItems.length;
  const sortedItems = useMemo(
    () => [...mediaItems].sort((a, b) => a.order - b.order),
    [mediaItems],
  );

  const appendAssets = useCallback(
    async (assets: ImagePicker.ImagePickerAsset[], type: "image" | "video") => {
      if (assets.length === 0) return;

      const baseOrder = mediaItems.length;
      const nextItems: PostMediaItem[] = [];

      for (let i = 0; i < assets.length; i += 1) {
        const asset = assets[i];
        if (type === "video") {
          const durationSec = normalizeVideoDurationSeconds(asset.duration ?? undefined);
          const validationError = validateVideoAsset({
            duration: durationSec,
            fileSize: asset.fileSize ?? undefined,
            mimeType: asset.mimeType ?? undefined,
          });
          if (validationError) {
            showErrorToast("Video not supported", validationError);
            continue;
          }
        }

        nextItems.push({
          id: createPostMediaId(),
          type,
          uri: asset.uri,
          duration:
            type === "video"
              ? normalizeVideoDurationSeconds(asset.duration ?? undefined)
              : undefined,
          mimeType: asset.mimeType ?? undefined,
          width: asset.width,
          height: asset.height,
          order: baseOrder + nextItems.length,
          uploadStatus: "idle",
        });
      }

      if (nextItems.length > 0) {
        onAddMedia(nextItems);
      }
    },
    [mediaItems.length, onAddMedia],
  );

  const pickFromGallery = async () => {
    if (remaining <= 0 || disabled) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 0.6,
      videoMaxDuration: MAX_VIDEO_DURATION_SEC,
    });

    if (result.canceled) return;

    const images: ImagePicker.ImagePickerAsset[] = [];
    const videos: ImagePicker.ImagePickerAsset[] = [];
    for (const asset of result.assets) {
      const isVideo =
        asset.type === "video" || (asset.mimeType ?? "").startsWith("video/");
      if (isVideo) videos.push(asset);
      else images.push(asset);
    }

    if (images.length) await appendAssets(images.slice(0, remaining), "image");
    const roomAfterImages = remaining - Math.min(images.length, remaining);
    if (videos.length && roomAfterImages > 0) {
      await appendAssets(videos.slice(0, roomAfterImages), "video");
    }
  };

  const takePhoto = async () => {
    if (remaining <= 0 || disabled) return;

    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      showErrorToast(
        "Camera permission required",
        "Allow camera access in settings to take listing photos.",
      );
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.6,
    });

    if (!result.canceled) {
      await appendAssets(result.assets, "image");
    }
  };

  const recordVideo = async () => {
    if (remaining <= 0 || disabled) return;

    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      showErrorToast(
        "Camera permission required",
        "Allow camera access in settings to record videos.",
      );
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["videos"],
      videoMaxDuration: MAX_VIDEO_DURATION_SEC,
      quality: 0.7,
    });

    if (!result.canceled) {
      await appendAssets(result.assets, "video");
    }
  };

  return (
    <View className="px-4 py-4">
      <View className="mb-3 flex-row items-center justify-between">
        <Text
          className="text-[13px]"
          style={{ fontFamily: ListifyFonts.regular, color: colors.textSecondary }}
        >
          Add photos or videos
        </Text>
        <Text
          className="text-[12px]"
          style={{ fontFamily: ListifyFonts.medium, color: colors.textTertiary }}
        >
          {mediaItems.length} / {MAX_LISTING_MEDIA}
        </Text>
      </View>

      <View className="flex-row flex-wrap gap-3">
        {remaining > 0 && !disabled ? (
          <>
            <Pressable
              onPress={takePhoto}
              className="items-center justify-center rounded-2xl border-2 border-dashed"
              style={{
                width: 96,
                height: 96,
                borderColor: colors.border,
                backgroundColor: colors.surfaceMuted,
              }}
            >
              <MaterialIcons name="photo-camera" size={24} color={colors.iconMuted} />
              <Text
                className="mt-1 text-[10px]"
                style={{ fontFamily: ListifyFonts.medium, color: colors.textSecondary }}
              >
                Photo
              </Text>
            </Pressable>

            <Pressable
              onPress={recordVideo}
              className="items-center justify-center rounded-2xl border-2 border-dashed"
              style={{
                width: 96,
                height: 96,
                borderColor: colors.border,
                backgroundColor: colors.surfaceMuted,
              }}
            >
              <MaterialIcons name="videocam" size={24} color={colors.iconMuted} />
              <Text
                className="mt-1 text-[10px]"
                style={{ fontFamily: ListifyFonts.medium, color: colors.textSecondary }}
              >
                Video
              </Text>
            </Pressable>

            <Pressable
              onPress={pickFromGallery}
              className="items-center justify-center rounded-2xl border-2 border-dashed"
              style={{
                width: 96,
                height: 96,
                borderColor: colors.border,
                backgroundColor: colors.surfaceMuted,
              }}
            >
              <MaterialIcons name="perm-media" size={24} color={colors.iconMuted} />
              <Text
                className="mt-1 text-[10px]"
                style={{ fontFamily: ListifyFonts.medium, color: colors.textSecondary }}
              >
                Gallery
              </Text>
            </Pressable>
          </>
        ) : null}

        {sortedItems.map((item, idx) => {
          const scan = item.type === "image" ? imageScanMap[item.uri] : undefined;
          const entry = toGalleryEntry(item);

          return (
            <ListingMediaThumb
              key={item.id}
              entry={entry}
              durationLabel={formatMediaDuration(item.duration)}
              onPress={() => setPreviewEntry(entry)}
              onRemove={() => onRemoveMedia(idx)}
              overlay={
                <>
                  {item.uploadStatus === "uploading" ? (
                    <ListingMediaUploadOverlay label="Uploading…" />
                  ) : null}
                  {item.uploadStatus === "error" ? (
                    <ListingMediaUploadOverlay label="Upload failed" tone="danger" />
                  ) : null}
                  {scan?.status === "scanning" ? (
                    <ListingMediaUploadOverlay label="Scanning…" />
                  ) : null}
                  {scan?.status === "blocked" ? (
                    <ListingMediaUploadOverlay label="RESTRICTED" tone="danger" />
                  ) : null}
                  {scan?.status === "review" ? (
                    <ListingMediaUploadOverlay label="FLAGGED" tone="warning" />
                  ) : null}
                  {scan?.status === "blocked" || scan?.status === "review" ? (
                    <Text
                      className="absolute bottom-1 left-1 right-1 text-center text-[8px] text-white/80"
                      style={{ fontFamily: ListifyFonts.regular }}
                    >
                      {MODERATION_CATEGORY_SHORT[scan.category ?? ""] ?? "Review needed"}
                    </Text>
                  ) : null}
                </>
              }
            />
          );
        })}
      </View>

      <Text
        className="mt-3 text-[12px]"
        style={{ fontFamily: ListifyFonts.regular, color: colors.textSecondary }}
      >
        Ads with photos and short videos get more engagement. Videos up to 3 minutes, 100 MB max.
      </Text>

      <ListingMediaPreviewModal
        visible={Boolean(previewEntry)}
        entry={previewEntry}
        onClose={() => setPreviewEntry(null)}
      />
    </View>
  );
}

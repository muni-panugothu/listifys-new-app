import { resolveAbsoluteMediaUrl } from "@/features/auth/services/auth-api";
import type { ListingItem } from "@/features/listing/services/listing-api";

export type ListingMediaType = "image" | "video";

export type ListingVideoEntry = {
  url: string;
  thumbnailUrl?: string;
  duration?: number;
  mimeType?: string;
  order?: number;
  size?: number;
};

export type PostMediaItem = {
  id: string;
  type: ListingMediaType;
  uri: string;
  duration?: number;
  mimeType?: string;
  width?: number;
  height?: number;
  order: number;
  uploadStatus?: "idle" | "uploading" | "done" | "error";
  uploadedUrl?: string;
};

export type ListingMediaGalleryEntry = {
  type: ListingMediaType;
  url: string;
  thumbnailUrl?: string;
  duration?: number;
  mimeType?: string;
  order: number;
};

export const MAX_LISTING_MEDIA = 6;
export const MAX_VIDEO_SIZE_BYTES = 100 * 1024 * 1024;
export const MAX_VIDEO_DURATION_SEC = 180;

/** expo-image-picker reports duration in ms; API/storage uses seconds. */
export function normalizeVideoDurationSeconds(raw?: number | null): number | undefined {
  if (raw == null || !Number.isFinite(raw) || raw <= 0) return undefined;
  // Values above ~16 minutes in "seconds" are almost certainly milliseconds.
  if (raw > 1000) return raw / 1000;
  return raw;
}

const VIDEO_EXT = /\.(mp4|mov|m4v|webm|3gp|3gpp)(\?|$)/i;

export function isLikelyVideoUrl(url: string): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  if (VIDEO_EXT.test(lower)) return true;
  if (lower.includes("/video") || lower.includes("listing_video")) return true;
  return false;
}

export function isRemoteMediaUri(uri: string): boolean {
  return /^https?:\/\//i.test(uri);
}

export function formatMediaDuration(seconds?: number): string {
  const normalized = normalizeVideoDurationSeconds(seconds);
  if (normalized == null) return "0:00";
  const total = Math.floor(normalized);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function createPostMediaId(): string {
  return `media-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeListingVideos(raw: unknown): ListingVideoEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry, index) => {
      if (typeof entry === "string" && entry.trim()) {
        return {
          url: resolveAbsoluteMediaUrl(entry.trim()) ?? entry.trim(),
          order: index,
        };
      }
      if (entry && typeof entry === "object") {
        const obj = entry as Record<string, unknown>;
        const url = typeof obj.url === "string" ? obj.url.trim() : "";
        if (!url) return null;
        return {
          url: resolveAbsoluteMediaUrl(url) ?? url,
          thumbnailUrl:
            typeof obj.thumbnailUrl === "string"
              ? resolveAbsoluteMediaUrl(obj.thumbnailUrl) ?? obj.thumbnailUrl
              : undefined,
          duration:
            typeof obj.duration === "number" && obj.duration >= 0
              ? normalizeVideoDurationSeconds(obj.duration)
              : undefined,
          mimeType: typeof obj.mimeType === "string" ? obj.mimeType : undefined,
          order:
            typeof obj.order === "number" && Number.isFinite(obj.order)
              ? obj.order
              : index,
          size: typeof obj.size === "number" ? obj.size : undefined,
        };
      }
      return null;
    })
    .filter(Boolean) as ListingVideoEntry[];
}

/** Merge legacy images[] + videos[] into a single ordered gallery. */
export function buildListingMediaGallery(
  listing: Pick<ListingItem, "images" | "videos"> | null | undefined,
): ListingMediaGalleryEntry[] {
  if (!listing) return [];

  const entries: ListingMediaGalleryEntry[] = [];

  (listing.images ?? []).forEach((raw, index) => {
    const url = resolveAbsoluteMediaUrl(String(raw)) ?? String(raw);
    if (!url) return;
    entries.push({
      type: isLikelyVideoUrl(url) ? "video" : "image",
      url,
      order: index,
    });
  });

  normalizeListingVideos(listing.videos).forEach((video) => {
    entries.push({
      type: "video",
      url: video.url,
      thumbnailUrl: video.thumbnailUrl,
      duration: video.duration,
      mimeType: video.mimeType,
      order: video.order ?? entries.length,
    });
  });

  return entries.sort((a, b) => a.order - b.order);
}

export function getListingCoverMediaUrl(
  listing: Pick<ListingItem, "images" | "videos"> | null | undefined,
): string {
  const gallery = buildListingMediaGallery(listing);
  const first = gallery[0];
  if (!first) return "";
  if (first.type === "video") {
    return first.thumbnailUrl ?? first.url;
  }
  return first.url;
}

export function mapListingToPostMediaItems(
  listing: Pick<ListingItem, "images" | "videos">,
): PostMediaItem[] {
  return buildListingMediaGallery(listing).map((entry, index) => ({
    id: createPostMediaId(),
    type: entry.type,
    uri: entry.url,
    duration: entry.duration,
    mimeType: entry.mimeType,
    order: entry.order ?? index,
    uploadStatus: "done",
    uploadedUrl: entry.url,
  }));
}

export function validateVideoAsset(input: {
  duration?: number | null;
  fileSize?: number | null;
  mimeType?: string | null;
}): string | null {
  if (input.fileSize != null && input.fileSize > MAX_VIDEO_SIZE_BYTES) {
    return "Video must be 100 MB or smaller.";
  }
  const durationSec = normalizeVideoDurationSeconds(input.duration);
  if (durationSec != null && durationSec > MAX_VIDEO_DURATION_SEC) {
    return "Video must be 3 minutes or shorter.";
  }
  const mime = (input.mimeType ?? "").toLowerCase();
  if (
    mime &&
    !mime.startsWith("video/") &&
    mime !== "application/octet-stream"
  ) {
    return "Unsupported video format. Use MP4, MOV, or WebM.";
  }
  return null;
}

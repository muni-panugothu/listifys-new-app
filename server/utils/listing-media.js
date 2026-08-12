const S3Service = require('../services/s3.service');

const ALLOWED_VIDEO_MIMES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-m4v',
  'video/3gpp',
]);

const MAX_VIDEOS = 3;
const MAX_VIDEO_DURATION_SEC = 180;

function normalizeVideoDurationSeconds(raw) {
  if (raw == null || !Number.isFinite(raw) || raw <= 0) return undefined;
  if (raw > 1000) return raw / 1000;
  return raw;
}

function isValidMediaUrl(url) {
  if (typeof url !== 'string' || !url.trim()) return false;
  const value = url.trim();
  if (value.startsWith('/api/images/')) return true;
  if (/^[a-zA-Z0-9/_\-.]+$/.test(value) && !value.includes(' ')) return true;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (_) {
    return false;
  }
}

function normalizeVideoEntry(raw, fallbackOrder = 0) {
  if (!raw) return null;

  if (typeof raw === 'string') {
    const url = raw.trim();
    if (!isValidMediaUrl(url)) return null;
    return {
      url: S3Service.toProxyUrl(url),
      order: fallbackOrder,
    };
  }

  if (typeof raw === 'object' && typeof raw.url === 'string' && raw.url.trim()) {
    const durationRaw =
      typeof raw.duration === 'number' && raw.duration >= 0
        ? normalizeVideoDurationSeconds(raw.duration)
        : undefined;
    const duration =
      durationRaw !== undefined
        ? Math.min(durationRaw, MAX_VIDEO_DURATION_SEC)
        : undefined;
    const size =
      typeof raw.size === 'number' && raw.size >= 0 ? raw.size : undefined;

    return {
      url: S3Service.toProxyUrl(raw.url.trim()),
      ...(raw.thumbnailUrl
        ? { thumbnailUrl: S3Service.toProxyUrl(String(raw.thumbnailUrl).trim()) }
        : {}),
      ...(duration !== undefined ? { duration } : {}),
      ...(raw.mimeType && ALLOWED_VIDEO_MIMES.has(String(raw.mimeType))
        ? { mimeType: String(raw.mimeType) }
        : {}),
      order:
        typeof raw.order === 'number' && Number.isFinite(raw.order)
          ? raw.order
          : fallbackOrder,
      ...(size !== undefined ? { size } : {}),
    };
  }

  return null;
}

function normalizeVideos(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry, index) => normalizeVideoEntry(entry, index))
    .filter(Boolean)
    .slice(0, MAX_VIDEOS);
}

function normaliseListingMedia(listing) {
  if (!listing) return listing;

  if (Array.isArray(listing.images)) {
    listing.images = listing.images.map((url) => S3Service.toProxyUrl(url));
  }

  if (Array.isArray(listing.videos)) {
    listing.videos = normalizeVideos(listing.videos);
  }

  if (listing.seller?.profileImage) {
    listing.seller.profileImage = S3Service.toProxyUrl(
      listing.seller.profileImage,
    );
  }

  return listing;
}

function validateVideosPayload(videos) {
  const errors = [];
  if (!Array.isArray(videos)) {
    errors.push('Videos must be an array');
    return errors;
  }
  if (videos.length > MAX_VIDEOS) {
    errors.push(`Maximum ${MAX_VIDEOS} videos allowed`);
  }

  videos.forEach((entry, index) => {
    const normalized = normalizeVideoEntry(entry, index);
    if (!normalized) {
      errors.push(`Invalid video entry at index ${index}`);
      return;
    }
    if (
      normalized.duration !== undefined &&
      normalized.duration > MAX_VIDEO_DURATION_SEC
    ) {
      errors.push(
        `Video at index ${index} exceeds maximum duration of ${MAX_VIDEO_DURATION_SEC} seconds`,
      );
    }
  });

  return errors;
}

module.exports = {
  ALLOWED_VIDEO_MIMES,
  MAX_VIDEOS,
  MAX_VIDEO_DURATION_SEC,
  normalizeVideoDurationSeconds,
  isValidMediaUrl,
  normalizeVideoEntry,
  normalizeVideos,
  normaliseListingMedia,
  validateVideosPayload,
};

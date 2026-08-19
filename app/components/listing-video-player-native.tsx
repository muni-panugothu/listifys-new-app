import { ListingVideoPlayer } from "@/components/listing-media-viewer";

/**
 * Safe video entry — never imports expo-video at module load.
 * Uses native playback when the dev build includes ExpoVideo, otherwise poster fallback.
 */
export const ListingVideoPlayerNative = ListingVideoPlayer;

import { MaterialIcons } from "@expo/vector-icons";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useRef, useState } from "react";
import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";

import { Image } from "@/lib/nativewind-interop";

type NativeListingVideoPlayerProps = {
  uri: string;
  poster?: string;
  style?: StyleProp<ViewStyle>;
  autoPlay?: boolean;
  isActive?: boolean;
  muted?: boolean;
  loop?: boolean;
  paused?: boolean;
  showControls?: boolean;
  showPlayOverlay?: boolean;
  onPress?: () => void;
  compact?: boolean;
  onEnded?: () => void;
  onProgress?: (progress: number, durationSec: number) => void;
};

export function ListingVideoPlayerNative({
  uri,
  poster,
  style,
  autoPlay = false,
  isActive,
  muted = true,
  loop = false,
  paused = false,
  showControls = true,
  showPlayOverlay = false,
  onPress,
  compact = false,
  onEnded,
  onProgress,
}: NativeListingVideoPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [showPoster, setShowPoster] = useState(Boolean(poster));
  const endedRef = useRef(false);

  const shouldPlay = (isActive ?? autoPlay) && !paused;
  const showCenterOverlay =
    (showPlayOverlay || compact) && !(shouldPlay && !showPlayOverlay);

  const player = useVideoPlayer(uri, (p) => {
    p.loop = loop;
    p.muted = muted;
    if (shouldPlay) p.play();
  });

  useEffect(() => {
    player.loop = loop;
  }, [loop, player]);

  useEffect(() => {
    player.muted = muted;
  }, [muted, player]);

  useEffect(() => {
    endedRef.current = false;
    if (shouldPlay) {
      try {
        player.play();
        setIsPlaying(true);
        if (!poster) setShowPoster(false);
      } catch {
        /* player may not be ready */
      }
    } else {
      try {
        player.pause();
        setIsPlaying(false);
      } catch {
        /* ignore */
      }
    }
  }, [shouldPlay, player, poster]);

  useEffect(() => {
    return () => {
      try {
        player.pause();
      } catch {
        /* Player may already be released. */
      }
    };
  }, [player]);

  useEffect(() => {
    if (!shouldPlay || (!onProgress && !onEnded)) return;

    const tick = () => {
      try {
        const current = player.currentTime ?? 0;
        const duration = player.duration ?? 0;
        if (duration > 0) {
          onProgress?.(Math.min(current / duration, 1), duration);
          if (!endedRef.current && current >= Math.max(duration - 0.25, 0)) {
            endedRef.current = true;
            onEnded?.();
          }
        }
      } catch {
        /* ignore polling errors */
      }
    };

    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [shouldPlay, onProgress, onEnded, player]);

  useEffect(() => {
    if (isPlaying && showPoster) {
      setShowPoster(false);
    }
  }, [isPlaying, showPoster]);

  const togglePlayback = () => {
    if (onPress) {
      onPress();
      return;
    }
    if (player.playing) {
      player.pause();
      setIsPlaying(false);
    } else {
      player.play();
      setIsPlaying(true);
    }
  };

  return (
    <Pressable onPress={togglePlayback} style={[{ overflow: "hidden" }, style]}>
      <VideoView
        player={player}
        style={{ width: "100%", height: "100%" }}
        contentFit="cover"
        nativeControls={showControls && !compact}
        allowsPictureInPicture={false}
      />
      {poster && showPoster ? (
        <Image
          source={poster}
          contentFit="cover"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
          }}
        />
      ) : null}
      {showCenterOverlay ? (
        <View
          pointerEvents="none"
          className="absolute inset-0 items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.22)" }}
        >
          {!isPlaying || showPlayOverlay ? (
            <View
              className="items-center justify-center rounded-full"
              style={{
                width: compact ? 36 : 56,
                height: compact ? 36 : 56,
                backgroundColor: "rgba(0,0,0,0.55)",
              }}
            >
              <MaterialIcons
                name={isPlaying && !showPlayOverlay ? "pause" : "play-arrow"}
                size={compact ? 22 : 34}
                color="#FFFFFF"
              />
            </View>
          ) : null}
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
      ) : null}
    </Pressable>
  );
}

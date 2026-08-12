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

type InnerPlayerProps = NativeListingVideoPlayerProps & {
  shouldPlay: boolean;
};

function ListingVideoPlayerInner({
  uri,
  poster,
  style,
  shouldPlay,
  muted = true,
  loop = false,
  showControls = true,
  showPlayOverlay = false,
  onPress,
  compact = false,
  onEnded,
  onProgress,
}: InnerPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(shouldPlay);
  const [showPoster, setShowPoster] = useState(Boolean(poster));
  const endedRef = useRef(false);

  const showCenterOverlay =
    (showPlayOverlay || compact) && !(shouldPlay && !showPlayOverlay);

  const player = useVideoPlayer(uri, (p) => {
    p.loop = loop;
    p.muted = muted;
  });

  useEffect(() => {
    player.loop = loop;
  }, [loop, player]);

  useEffect(() => {
    player.muted = muted;
  }, [muted, player]);

  const playSafe = () => {
    try {
      player.play();
      setIsPlaying(true);
      if (!poster) setShowPoster(false);
    } catch {
      /* source may not be ready yet */
    }
  };

  const pauseSafe = () => {
    try {
      player.pause();
      setIsPlaying(false);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    endedRef.current = false;
    if (shouldPlay) {
      playSafe();
    } else {
      pauseSafe();
    }
  }, [shouldPlay, uri]);

  useEffect(() => {
    if (!shouldPlay) return;

    const statusSub = player.addListener("statusChange", ({ status }) => {
      if (status === "readyToPlay") playSafe();
    });
    const endSub = player.addListener("playToEnd", () => {
      if (endedRef.current) return;
      endedRef.current = true;
      onEnded?.();
    });

    playSafe();

    return () => {
      statusSub.remove();
      endSub.remove();
    };
  }, [shouldPlay, player, uri, onEnded]);

  useEffect(() => {
    if (!shouldPlay || !onProgress) return;

    const tick = () => {
      try {
        const current = player.currentTime ?? 0;
        const duration = player.duration ?? 0;
        if (duration > 0) {
          onProgress(Math.min(current / duration, 1), duration);
        }
      } catch {
        /* ignore */
      }
    };

    const id = setInterval(tick, 400);
    return () => clearInterval(id);
  }, [shouldPlay, onProgress, player]);

  useEffect(() => {
    return () => {
      pauseSafe();
    };
  }, [player]);

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
      pauseSafe();
    } else {
      playSafe();
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
          cachePolicy="memory-disk"
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

/** Plain function export — required for dynamic require() from expo-video-support. */
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
  const shouldPlay = (isActive ?? autoPlay) && !paused;

  if (!shouldPlay) {
    const posterSource = poster ?? uri;
    return (
      <View style={[{ overflow: "hidden", backgroundColor: "#111827" }, style]}>
        {posterSource ? (
          <Image
            source={posterSource}
            contentFit="cover"
            cachePolicy="memory-disk"
            style={{ width: "100%", height: "100%" }}
          />
        ) : null}
      </View>
    );
  }

  return (
    <ListingVideoPlayerInner
      uri={uri}
      poster={poster}
      style={style}
      shouldPlay={shouldPlay}
      muted={muted}
      loop={loop}
      showControls={showControls}
      showPlayOverlay={showPlayOverlay}
      onPress={onPress}
      compact={compact}
      onEnded={onEnded}
      onProgress={onProgress}
    />
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { useTheme } from "@/providers/theme-provider";

type ProfileProgressRingProps = {
  size?: number;
  stroke?: number;
  /** 0–100 — used internally only; never shown as text. */
  progress: number;
  isComplete?: boolean;
  children?: React.ReactNode;
  /** More segments = smoother arc on large rings. */
  segmentCount?: number;
};

const DEFAULT_SEGMENT_COUNT = 180;
const ANIMATION_MS = 1200;

function clampProgress(value: number) {
  return Math.min(Math.max(value, 0), 100);
}

/**
 * Circular progress ring — pure RN (no react-native-svg).
 * One continuous background track + one foreground progress stroke.
 * Starts at 12 o'clock, grows clockwise.
 */
export function ProfileProgressRing({
  size = 92,
  stroke = 3.5,
  progress,
  isComplete = false,
  children,
  segmentCount = DEFAULT_SEGMENT_COUNT,
}: ProfileProgressRingProps) {
  const { colors, resolvedMode } = useTheme();
  const clampedProgress = clampProgress(progress);
  const segCount = Math.max(60, segmentCount);
  const center = size / 2;
  const radius = (size - stroke) / 2;

  const animatedProgress = useSharedValue(clampedProgress);
  const ringScale = useSharedValue(1);
  const hasMountedRef = useRef(false);
  const lastTargetRef = useRef(clampedProgress);

  const [filledCount, setFilledCount] = useState(() =>
    Math.floor((clampedProgress / 100) * segCount),
  );

  const updateFilledCount = (value: number) => {
    setFilledCount(Math.floor((clampProgress(value) / 100) * segCount));
  };

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      lastTargetRef.current = clampedProgress;
      animatedProgress.value = clampedProgress;
      updateFilledCount(clampedProgress);
      return;
    }

    if (lastTargetRef.current === clampedProgress) return;
    lastTargetRef.current = clampedProgress;

    animatedProgress.value = withTiming(clampedProgress, {
      duration: ANIMATION_MS,
      easing: Easing.inOut(Easing.cubic),
    });
  }, [animatedProgress, clampedProgress, segCount]);

  useAnimatedReaction(
    () => Math.floor((animatedProgress.value / 100) * segCount),
    (count, previous) => {
      if (previous == null || count !== previous) {
        runOnJS(setFilledCount)(count);
      }
    },
    [segCount],
  );

  useEffect(() => {
    if (!isComplete && clampedProgress < 100) return;
    ringScale.value = withSequence(
      withTiming(1.05, { duration: 280, easing: Easing.out(Easing.cubic) }),
      withTiming(1, { duration: 320, easing: Easing.inOut(Easing.cubic) }),
    );
  }, [clampedProgress, isComplete, ringScale]);

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ringScale.value }],
  }));

  const arcColor =
    isComplete || clampedProgress >= 100 ? colors.success : colors.primary;
  const trackColor =
    resolvedMode === "dark"
      ? "rgba(255,255,255,0.10)"
      : "rgba(39,187,151,0.16)";

  const isFullRing = filledCount >= segCount || clampedProgress >= 100;

  const progressSegments = useMemo(() => {
    if (isFullRing || filledCount <= 0) return [];

    const dot = stroke * 1.05;
    return Array.from({ length: filledCount }, (_, index) => {
      const angleDeg = (index / segCount) * 360 - 90;
      const angleRad = (angleDeg * Math.PI) / 180;
      return {
        key: index,
        left: center + radius * Math.cos(angleRad) - dot / 2,
        top: center + radius * Math.sin(angleRad) - dot / 2,
      };
    });
  }, [center, filledCount, isFullRing, radius, segCount, stroke]);

  return (
    <Animated.View
      style={[
        containerStyle,
        {
          width: size,
          height: size,
          alignItems: "center",
          justifyContent: "center",
        },
      ]}
    >
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          width: size,
          height: size,
          zIndex: 0,
        }}
      >
        <View
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: stroke,
            borderColor: trackColor,
          }}
        />

        {isFullRing ? (
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: size,
              height: size,
              borderRadius: size / 2,
              borderWidth: stroke,
              borderColor: arcColor,
            }}
          />
        ) : (
          <View style={{ position: "absolute", top: 0, left: 0, width: size, height: size }}>
            {progressSegments.map((seg) => (
              <View
                key={seg.key}
                style={{
                  position: "absolute",
                  left: seg.left,
                  top: seg.top,
                  width: stroke * 1.05,
                  height: stroke * 1.05,
                  borderRadius: stroke / 2,
                  backgroundColor: arcColor,
                }}
              />
            ))}
          </View>
        )}
      </View>

      <View
        style={{
          zIndex: 2,
          elevation: 4,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {children}
      </View>
    </Animated.View>
  );
}

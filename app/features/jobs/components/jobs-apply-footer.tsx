import { LinearGradient } from "expo-linear-gradient";
import { memo, useCallback, useMemo, useRef } from "react";
import {
  ActivityIndicator,
  Animated,
  LayoutChangeEvent,
  PanResponder,
  Platform,
  Text,
  View,
} from "react-native";

import { APP_BRAND_PRIMARY } from "@/constants/theme";
import { ListifyFonts } from "@/constants/typography";

const TRACK_HEIGHT = 60;
const HANDLE_MIN_WIDTH = 148;
const TRACK_PADDING = 6;
const BRAND_DARK = "#1E9E7E";

type JobsApplyFooterProps = {
  bottomInset: number;
  loading?: boolean;
  onPress: () => void;
};

function JobsApplyFooterImpl({ bottomInset, loading, onPress }: JobsApplyFooterProps) {
  const dragX = useRef(new Animated.Value(0)).current;
  const maxDragRef = useRef(0);
  const triggeredRef = useRef(false);

  const onTrackLayout = useCallback((e: LayoutChangeEvent) => {
    const width = e.nativeEvent.layout.width;
    maxDragRef.current = Math.max(0, width - HANDLE_MIN_WIDTH - TRACK_PADDING * 2);
  }, []);

  const resetHandle = useCallback(() => {
    triggeredRef.current = false;
    Animated.spring(dragX, {
      toValue: 0,
      useNativeDriver: true,
      speed: 18,
      bounciness: 8,
    }).start();
  }, [dragX]);

  const completeSlide = useCallback(() => {
    if (triggeredRef.current || loading) return;
    triggeredRef.current = true;
    Animated.timing(dragX, {
      toValue: maxDragRef.current,
      duration: 180,
      useNativeDriver: true,
    }).start(() => {
      onPress();
      setTimeout(resetHandle, 700);
    });
  }, [dragX, loading, onPress, resetHandle]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !loading,
        onMoveShouldSetPanResponder: (_, gesture) =>
          !loading && Math.abs(gesture.dx) > Math.abs(gesture.dy) && Math.abs(gesture.dx) > 4,
        onPanResponderMove: (_, gesture) => {
          if (loading) return;
          const clamped = Math.min(Math.max(0, gesture.dx), maxDragRef.current);
          dragX.setValue(clamped);
        },
        onPanResponderRelease: (_, gesture) => {
          if (loading) return;
          const threshold = maxDragRef.current * 0.82;
          if (gesture.dx >= threshold) {
            completeSlide();
          } else {
            resetHandle();
          }
        },
        onPanResponderTerminate: resetHandle,
      }),
    [completeSlide, dragX, loading, resetHandle],
  );

  return (
    <View
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: Math.max(bottomInset, 12),
        backgroundColor: "transparent",
      }}
    >
      <View onLayout={onTrackLayout}>
        <LinearGradient
          colors={["#3DD4B3", APP_BRAND_PRIMARY, BRAND_DARK]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={{
            height: TRACK_HEIGHT,
            borderRadius: 999,
            justifyContent: "center",
            overflow: "hidden",
          }}
        >
          <View
            style={{
              position: "absolute",
              right: 18,
              flexDirection: "row",
              alignItems: "center",
              gap: 2,
            }}
            pointerEvents="none"
          >
            {[0, 1, 2].map((i) => (
              <Text
                key={i}
                style={{
                  fontFamily: ListifyFonts.bold,
                  fontSize: 16,
                  color: "rgba(255,255,255,0.9)",
                }}
              >
                {">"}
              </Text>
            ))}
          </View>

          <Animated.View
            {...panResponder.panHandlers}
            style={{
              position: "absolute",
              left: TRACK_PADDING,
              top: TRACK_PADDING,
              bottom: TRACK_PADDING,
              minWidth: HANDLE_MIN_WIDTH,
              borderRadius: 999,
              backgroundColor: "#FFFFFF",
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 24,
              transform: [{ translateX: dragX }],
              shadowColor: "#0F172A",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.12,
              shadowRadius: 6,
              elevation: 3,
            }}
          >
            {loading ? (
              <ActivityIndicator color={APP_BRAND_PRIMARY} />
            ) : (
              <Text
                style={{
                  fontFamily: ListifyFonts.bold,
                  fontSize: 16,
                  color: "#1E293B",
                  ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
                }}
              >
                Apply Now
              </Text>
            )}
          </Animated.View>
        </LinearGradient>
      </View>
    </View>
  );
}

export const JobsApplyFooter = memo(JobsApplyFooterImpl);

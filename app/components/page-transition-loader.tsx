import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  StyleSheet,
  View,
} from 'react-native';

import { useTheme } from '@/providers/theme-provider';
// import LottieView from 'lottie-react-native';

const { width, height } = Dimensions.get('screen');

interface Props {
  visible: boolean;
  /** Optional label shown below animation. Defaults to "Getting ready…" */
  label?: string;
}

/**
 * Full-screen page-transition loader shown when navigating between screens.
 * Modelled after Zepto / OLX style — white overlay + branded Lottie animation.
 *
 * Usage: render once in _layout.tsx and control via `visible` prop.
 */
export function PageTransitionLoader({ visible, label = 'Getting ready…' }: Props) {
  const [isMounted, setIsMounted] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;
  const { colors, resolvedMode } = useTheme();
  // const lottieRef = useRef<LottieView>(null);

  useEffect(() => {
    if (visible) {
      setIsMounted(true);
      // Play from start each time it appears
      // lottieRef.current?.play();
      Animated.timing(opacity, {
        toValue: 1,
        duration: 120,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          setIsMounted(false);
          // lottieRef.current?.reset();
        }
      });
    }
  }, [opacity, visible]);

  if (!isMounted && !visible) return null;

  const overlayBackground =
    resolvedMode === "dark"
      ? "rgba(13,15,18,0.97)"
      : "rgba(255,252,246,0.97)";
  const dotColor = colors.primary;

  return (
    <Animated.View
      // Loader is visual-only; never block taps on underlying UI.
      pointerEvents="none"
      style={[styles.overlay, { opacity, backgroundColor: overlayBackground }]}
    >
      <View style={styles.card}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>

      <View style={styles.dotsRow}>
        <ShimmerDot delay={0} color={dotColor} />
        <ShimmerDot delay={180} color={dotColor} />
        <ShimmerDot delay={360} color={dotColor} />
      </View>
    </Animated.View>
  );
}

// ─── Shimmer Dot ─────────────────────────────────────────────────────────────

function ShimmerDot({ delay, color }: { delay: number; color: string }) {
  const anim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, {
          toValue: 1,
          duration: 420,
          useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue: 0.3,
          duration: 420,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [anim, delay]);

  return (
    <Animated.View
      style={[styles.dot, { opacity: anim, backgroundColor: color }]}
    />
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    width,
    height,
    zIndex: 999,
    elevation: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 32,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});

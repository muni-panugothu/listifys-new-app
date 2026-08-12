/**
 * NetworkStatusLayer â€” Premium connectivity banner.
 *
 * Features:
 *   - True internet validation via ConnectivityService (probes Cloudflare + Google + backend)
 *   - Spring-based animations via react-native-reanimated (not legacy Animated API)
 *   - Haptic feedback on state transitions
 *   - Offline queue drain on reconnection
 *   - Dark gradient backgrounds (Material Design 3, rounded pill)
 *   - Accessibility labels for screen readers
 *   - Debounced state changes to prevent flicker
 */
import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";
import { MaterialIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Text, View } from "react-native";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { connectivityService } from "@/lib/connectivity-service";
import { drainOfflineQueue, getQueueLength } from "@/lib/offline-queue";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  type CellularGeneration,
  type ConnectionType,
  clearSlowRequestSignal,
  setConnectivitySnapshot,
  setPendingQueueCount,
  updateNetworkSnapshot,
} from "@/store/slices/network-slice";

// â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type BannerKind = "offline" | "online" | "slow" | "server";

type BannerConfig = {
  kind: BannerKind;
  icon: keyof typeof MaterialIcons.glyphMap;
  title: string;
  message: string;
  /** `[start, end]` for LinearGradient */
  gradientColors: readonly [string, string];
  iconBackgroundColor: string;
  iconColor: string;
};

// â”€â”€ Constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const TRANSIENT_BANNER_MS = 3_000;
const HIDDEN_TRANSLATE_Y = -80;

const SPRING_SHOW = { damping: 18, stiffness: 220, mass: 0.8 };
const SPRING_HIDE = { damping: 22, stiffness: 280, mass: 0.8 };

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function toConnectionType(type: NetInfoState["type"]): ConnectionType {
  switch (type) {
    case "unknown":
    case "none":
    case "wifi":
    case "cellular":
    case "bluetooth":
    case "ethernet":
    case "wimax":
    case "vpn":
      return type;
    default:
      return "other";
  }
}

function resolveCellularGeneration(state: NetInfoState): CellularGeneration {
  if (state.type !== "cellular") return null;
  const details = state.details as { cellularGeneration?: CellularGeneration } | null;
  return details?.cellularGeneration ?? null;
}

function resolveIsConnectionExpensive(state: NetInfoState): boolean {
  const details = state.details as { isConnectionExpensive?: boolean } | null;
  return Boolean(details?.isConnectionExpensive);
}

function buildBanner(kind: BannerKind): BannerConfig {
  switch (kind) {
    case "offline":
      return {
        kind,
        icon: "cloud-off",
        title: "No Internet Connection",
        message: "Your actions will sync automatically.",
        gradientColors: ["#7F1D1D", "#991B1B"],
        iconBackgroundColor: "rgba(255,255,255,0.18)",
        iconColor: "#FECACA",
      };
    case "slow":
      return {
        kind,
        icon: "signal-cellular-alt",
        title: "Slow Connection",
        message: "Updates may take longer than usual.",
        gradientColors: ["#78350F", "#92400E"],
        iconBackgroundColor: "rgba(255,255,255,0.18)",
        iconColor: "#FDE68A",
      };
    case "server":
      return {
        kind,
        icon: "cloud-sync",
        title: "Can't Reach Server",
        message: "You're online, but the app can't connect to Listifys right now.",
        gradientColors: ["#78350F", "#92400E"],
        iconBackgroundColor: "rgba(255,255,255,0.18)",
        iconColor: "#FDE68A",
      };
    case "online":
      return {
        kind,
        icon: "wifi",
        title: "Back Online",
        message: "Syncing your latest changes.",
        gradientColors: ["#064E3B", "#065F46"],
        iconBackgroundColor: "rgba(255,255,255,0.18)",
        iconColor: "#A7F3D0",
      };
  }
}

async function triggerHaptic(kind: BannerKind): Promise<void> {
  try {
    if (kind === "offline") {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } else if (kind === "online") {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
  } catch {
    // Haptics unavailable on some devices â€” silently skip.
  }
}

// â”€â”€ Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function NetworkStatusLayer() {
  const dispatch = useAppDispatch();
  const insets = useSafeAreaInsets();

  const { isConnected, isSlowConnection, actualInternetReachable } = useAppSelector(
    (state) => state.network,
  );
  const networkActualOffline = actualInternetReachable === false;

  const [banner, setBanner] = useState<BannerConfig | null>(null);
  const bannerRef = useRef<BannerConfig | null>(null);

  // Reanimated shared values
  const translateY = useSharedValue(HIDDEN_TRANSLATE_Y);
  const opacity = useSharedValue(0);

  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasMountedRef = useRef(false);
  const previousIsOfflineRef = useRef(false);
  const previousServerDownRef = useRef(false);
  const previousIsSlowRef = useRef(false);
  const probeCompletedRef = useRef(false);
  const appStartedAtRef = useRef(Date.now());

  // Keep banner ref in sync with state (used in callbacks to avoid stale closure).
  useEffect(() => {
    bannerRef.current = banner;
  }, [banner]);

  // â”€â”€ Animation helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const clearHideTimeout = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  }, []);

  const hideBanner = useCallback(() => {
    clearHideTimeout();
    opacity.value = withTiming(0, { duration: 200 });
    translateY.value = withSpring(HIDDEN_TRANSLATE_Y, SPRING_HIDE, (finished) => {
      if (finished) {
        runOnJS(setBanner)(null);
      }
    });
  }, [clearHideTimeout, opacity, translateY]);

  const showBanner = useCallback(
    (nextBanner: BannerConfig, autoHideMs?: number) => {
      clearHideTimeout();
      setBanner(nextBanner);
      void triggerHaptic(nextBanner.kind);

      opacity.value = withTiming(1, { duration: 200 });
      translateY.value = withSpring(0, SPRING_SHOW);

      if (autoHideMs) {
        hideTimeoutRef.current = setTimeout(hideBanner, autoHideMs);
      }
    },
    [clearHideTimeout, hideBanner, opacity, translateY],
  );

  useEffect(() => {
    dispatch(clearSlowRequestSignal());
  }, [dispatch]);

  // â”€â”€ NetInfo listener â†’ dispatch to Redux + connectivityService â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  useEffect(() => {
    const handleNetInfo = (state: NetInfoState) => {
      const cellularGeneration = resolveCellularGeneration(state);
      const isConnectionExpensive = resolveIsConnectionExpensive(state);
      // `isConnectionExpensive` is often true on Android WiFi — not a reliable slow signal.
      const transportIsSlow =
        cellularGeneration === "2g" || cellularGeneration === "3g";

      dispatch(
        updateNetworkSnapshot({
          isConnected: Boolean(state.isConnected),
          isInternetReachable: state.isInternetReachable ?? null,
          transportIsSlow,
          connectionType: toConnectionType(state.type),
          cellularGeneration,
          isConnectionExpensive,
        }),
      );

      // Hand off to ConnectivityService for real probe validation.
      connectivityService.handleNetInfoChange(Boolean(state.isConnected));
    };

    const unsubscribe = NetInfo.addEventListener(handleNetInfo);
    NetInfo.fetch().then(handleNetInfo).catch(() => {});

    return () => unsubscribe();
  }, [dispatch]);

  // â”€â”€ ConnectivityService â†’ real internet reachability â†’ Redux + banner â”€â”€â”€â”€â”€â”€

  useEffect(() => {
    const unsubscribe = connectivityService.subscribe((snapshot) => {
      dispatch(setConnectivitySnapshot(snapshot));

      probeCompletedRef.current = true;

      const wasOffline = previousIsOfflineRef.current;
      const wasServerDown = previousServerDownRef.current;

      if (!snapshot.hasInternet) {
        previousIsOfflineRef.current = true;
        previousServerDownRef.current = false;
        showBanner(buildBanner("offline"));
        return;
      }

      previousIsOfflineRef.current = false;

      if (!snapshot.backendReachable) {
        previousServerDownRef.current = true;
        showBanner(buildBanner("server"));
        return;
      }

      previousServerDownRef.current = false;

      if (wasOffline || wasServerDown) {
        // Just came back online â†’ drain queue.
        previousIsOfflineRef.current = false;
        drainOfflineQueue()
          .then(({ synced }) => {
            dispatch(setPendingQueueCount(getQueueLength()));
            if (synced > 0) {
              console.info(`[OfflineQueue] Synced ${synced} actions on reconnect.`);
            }
          })
          .catch(() => {});
        showBanner(buildBanner("online"), TRANSIENT_BANNER_MS);
      } else if (bannerRef.current?.kind === "offline" || bannerRef.current?.kind === "server") {
        hideBanner();
      }
    });

    return () => unsubscribe();
  }, [dispatch, hideBanner, showBanner]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") {
        connectivityService.recheck();
      }
    });
    return () => sub.remove();
  }, []);

  // â”€â”€ Slow connection banner (transport-layer slow, not internet offline) â”€â”€â”€â”€â”€

  useEffect(() => {
    const withinStartupGrace = Date.now() - appStartedAtRef.current < 10_000;

    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      previousIsSlowRef.current = isSlowConnection;
      // Do NOT show offline on cold start from NetInfo alone — wait for probe results.
      return;
    }

    const transportOffline = !isConnected;
    const isOfflineForSlow =
      transportOffline ||
      (probeCompletedRef.current && networkActualOffline);

    // Slow-connection transitions (only when genuinely online, after startup grace).
    if (
      !isOfflineForSlow &&
      !withinStartupGrace &&
      isSlowConnection &&
      !previousIsSlowRef.current
    ) {
      showBanner(buildBanner("slow"), TRANSIENT_BANNER_MS);
    } else if (
      !isOfflineForSlow &&
      !isSlowConnection &&
      previousIsSlowRef.current &&
      bannerRef.current?.kind === "slow"
    ) {
      hideBanner();
    }

    previousIsSlowRef.current = isSlowConnection;
  }, [hideBanner, isConnected, isSlowConnection, networkActualOffline, showBanner]);

  // â”€â”€ Cleanup â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  useEffect(() => {
    return () => clearHideTimeout();
  }, [clearHideTimeout]);

  // â”€â”€ Animated styles â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  if (!banner) return null;

  return (
    <View
      accessible={false}
      pointerEvents="none"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        elevation: 1000,
        alignItems: "center",
      }}
    >
      <Animated.View
        accessibilityLiveRegion="polite"
        accessibilityLabel={`${banner.title}. ${banner.message}`}
        style={[
          {
            width: "100%",
            paddingHorizontal: 16,
            marginTop: insets.top + 10,
          },
          animatedStyle,
        ]}
      >
        <LinearGradient
          colors={banner.gradientColors as [string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            alignSelf: "center",
            width: "100%",
            maxWidth: 460,
            borderRadius: 20,
            paddingHorizontal: 16,
            paddingVertical: 14,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.22,
            shadowRadius: 20,
            elevation: 14,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            {/* Icon pill */}
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: banner.iconBackgroundColor,
                marginRight: 12,
              }}
            >
              <MaterialIcons name={banner.icon} size={19} color={banner.iconColor} />
            </View>

            {/* Text */}
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 15,
                  fontWeight: "700",
                  color: "#FFFFFF",
                  marginBottom: 2,
                  letterSpacing: 0.1,
                }}
                numberOfLines={1}
              >
                {banner.title}
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  lineHeight: 18,
                  color: "rgba(255,255,255,0.82)",
                }}
                numberOfLines={2}
              >
                {banner.message}
              </Text>
            </View>
          </View>
        </LinearGradient>
      </Animated.View>
    </View>
  );
}

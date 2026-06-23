/**
 * Voice recording — hold mic to record, release to send, slide left or tap ✕ to cancel.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Animated, PanResponder, Pressable, Text, View, type PanResponderInstance } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import {
  RecordingPresets,
  useAudioRecorder,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from "expo-audio";
import * as Haptics from "expo-haptics";
import { ListifyFonts } from "@/constants/typography";

const BRAND      = "#27BB97";
const REC        = "#EF4444";
const TEXT_MUTED = "#9CA3AF";

const CANCEL_THRESHOLD_PX = 90;
const MIN_RECORDING_MS    = 700;

export type RecordedVoiceNote = {
  uri: string;
  name: string;
  mimeType: string;
  size?: number;
  durationMs: number;
};

export type VoiceRecordingState = "idle" | "recording";

export type VoiceRecordingApi = {
  state: VoiceRecordingState;
  elapsedMs: number;
  dragX: number;
  micPanHandlers: ReturnType<PanResponderInstance["panHandlers"]> | Record<string, unknown>;
  slidePanHandlers?: Record<string, unknown>;
  cancelRecording: () => void;
  disabled?: boolean;
};

type HookProps = {
  onSend: (note: RecordedVoiceNote) => void;
  disabled?: boolean;
};

type SessionPhase = "idle" | "preparing" | "recording" | "finishing";

export function useVoiceRecording({ onSend, disabled }: HookProps): VoiceRecordingApi {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  const [state, setState]     = useState<VoiceRecordingState>("idle");
  const [elapsedMs, setElapsed] = useState(0);
  const [dragX, setDragX]     = useState(0);

  const phaseRef      = useRef<SessionPhase>("idle");
  const cancelledRef  = useRef(false);
  const startedAtRef  = useRef(0);
  const tickRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioReadyRef = useRef(false);
  const onSendRef     = useRef(onSend);
  onSendRef.current   = onSend;

  useEffect(() => {
    void (async () => {
      try {
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        audioReadyRef.current = true;
      } catch {
        audioReadyRef.current = false;
      }
    })();
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, []);

  const stopTicker = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  const resetUi = useCallback(() => {
    setState("idle");
    setDragX(0);
    setElapsed(0);
  }, []);

  const startRecording = useCallback(async () => {
    if (disabled || phaseRef.current !== "idle") return;

    phaseRef.current = "preparing";
    cancelledRef.current = false;

    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        phaseRef.current = "idle";
        Alert.alert("Microphone permission needed", "Enable microphone access in Settings.");
        return;
      }

      if (!audioReadyRef.current) {
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        audioReadyRef.current = true;
      }

      if (recorder.isRecording) {
        try { await recorder.stop(); } catch { /* ignore */ }
      }

      await recorder.prepareToRecordAsync(RecordingPresets.HIGH_QUALITY);
      recorder.record();

      phaseRef.current = "recording";
      startedAtRef.current = Date.now();
      setElapsed(0);
      setDragX(0);
      setState("recording");
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      stopTicker();
      tickRef.current = setInterval(() => {
        setElapsed(Date.now() - startedAtRef.current);
      }, 200);
    } catch (e: any) {
      phaseRef.current = "idle";
      resetUi();
      stopTicker();
      Alert.alert("Recording Error", e?.message ?? "Could not start recording.");
    }
  }, [disabled, recorder, resetUi, stopTicker]);

  const finishRecording = useCallback(async (cancelled: boolean) => {
    if (phaseRef.current === "idle" || phaseRef.current === "finishing") return;

    phaseRef.current = "finishing";
    stopTicker();
    const elapsed = Date.now() - (startedAtRef.current || Date.now());
    resetUi();

    try {
      if (recorder.isRecording) {
        await recorder.stop();
      }
    } catch {
      // Native recorder may already be stopped.
    }

    phaseRef.current = "idle";

    if (cancelled || cancelledRef.current) {
      cancelledRef.current = false;
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      return;
    }

    if (elapsed < MIN_RECORDING_MS) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      return;
    }

    const uri = recorder.uri;
    if (!uri) {
      Alert.alert("Recording Error", "No audio file was saved. Please try again.");
      return;
    }

    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSendRef.current({
      uri,
      name:       `voice-${Date.now()}.m4a`,
      mimeType:   "audio/mp4",
      durationMs: elapsed,
    });
  }, [recorder, resetUi, stopTicker]);

  const cancelRecording = useCallback(() => {
    if (phaseRef.current === "idle" || phaseRef.current === "finishing") return;
    cancelledRef.current = true;
    void finishRecording(true);
  }, [finishRecording]);

  const micPanResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !disabled && phaseRef.current === "idle",
    onMoveShouldSetPanResponder: () => phaseRef.current === "recording",
    onPanResponderGrant: () => {
      if (phaseRef.current !== "idle") return;
      void startRecording();
    },
    onPanResponderMove: (_, gesture) => {
      if (phaseRef.current !== "recording") return;
      const dx = Math.min(0, gesture.dx);
      setDragX(dx);
      if (dx < -CANCEL_THRESHOLD_PX && !cancelledRef.current) {
        cancelledRef.current = true;
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        void finishRecording(true);
      }
    },
    onPanResponderRelease: () => {
      if (phaseRef.current !== "recording" || cancelledRef.current) return;
      void finishRecording(false);
    },
    onPanResponderTerminate: () => {
      if (phaseRef.current !== "recording") return;
      void finishRecording(true);
    },
  }), [disabled, startRecording, finishRecording]);

  const slidePanResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: () => phaseRef.current === "recording",
    onPanResponderMove: (_, gesture) => {
      if (phaseRef.current !== "recording") return;
      const dx = Math.min(0, gesture.dx);
      setDragX(dx);
      if (dx < -CANCEL_THRESHOLD_PX && !cancelledRef.current) {
        cancelledRef.current = true;
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        void finishRecording(true);
      }
    },
  }), [finishRecording]);

  return {
    state,
    elapsedMs,
    dragX,
    micPanHandlers: micPanResponder.panHandlers,
    slidePanHandlers: slidePanResponder.panHandlers,
    cancelRecording,
    disabled,
  };
}

export function VoiceMicButton({ voice }: { voice: VoiceRecordingApi }) {
  const isRecording = voice.state === "recording";
  return (
    <View
      {...voice.micPanHandlers}
      style={{
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: isRecording ? REC : "transparent",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <MaterialIcons
        name="mic"
        size={24}
        color={isRecording ? "#fff" : (voice.disabled ? "#D1D5DB" : BRAND)}
      />
    </View>
  );
}

export function VoiceRecordingBar({
  voice,
  onCancel,
}: {
  voice: VoiceRecordingApi;
  onCancel?: () => void;
}) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (voice.state !== "recording") {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 600, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [voice.state, pulse]);

  const mm = Math.floor(voice.elapsedMs / 60000);
  const ss = Math.floor((voice.elapsedMs / 1000) % 60);
  const timeLabel = `${mm}:${ss < 10 ? "0" : ""}${ss}`;
  const slideOffset = Math.max(-CANCEL_THRESHOLD_PX, voice.dragX);

  return (
    <View
      {...(voice.slidePanHandlers ?? {})}
      style={{
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingHorizontal: 8,
        paddingVertical: 8,
        backgroundColor: "#FEF2F2",
        borderRadius: 24,
        minHeight: 44,
      }}
    >
      <Pressable
        onPress={onCancel ?? voice.cancelRecording}
        hitSlop={10}
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          backgroundColor: "rgba(239,68,68,0.15)",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <MaterialIcons name="close" size={20} color={REC} />
      </Pressable>
      <Animated.View
        style={{
          width: 10, height: 10, borderRadius: 5,
          backgroundColor: REC,
          opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }),
        }}
      />
      <Text style={{ fontFamily: ListifyFonts.semiBold, fontSize: 14, color: REC, minWidth: 42 }}>
        {timeLabel}
      </Text>
      <View
        style={{
          flex: 1,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          transform: [{ translateX: slideOffset }],
        }}
      >
        <MaterialIcons name="chevron-left" size={20} color={TEXT_MUTED} />
        <Text style={{ fontFamily: ListifyFonts.regular, fontSize: 13, color: TEXT_MUTED }}>
          Slide to cancel
        </Text>
      </View>
    </View>
  );
}

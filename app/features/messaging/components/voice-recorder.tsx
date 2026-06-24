/**
 * Voice recording — tap mic to start, then delete / pause / send (WhatsApp-style).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Animated, Keyboard, Pressable, Text, View } from "react-native";
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
const MIN_RECORDING_MS = 500;

export type RecordedVoiceNote = {
  uri: string;
  name: string;
  mimeType: string;
  size?: number;
  durationMs: number;
};

export type VoiceRecordingState = "idle" | "preparing" | "recording" | "paused";

export type VoiceRecordingApi = {
  state: VoiceRecordingState;
  isActive: boolean;
  isPaused: boolean;
  elapsedMs: number;
  startRecording: () => void;
  cancelRecording: () => void;
  sendRecording: () => void;
  togglePause: () => void;
  disabled?: boolean;
};

type HookProps = {
  onSend: (note: RecordedVoiceNote) => void;
  disabled?: boolean;
};

type SessionPhase = "idle" | "preparing" | "recording" | "paused" | "finishing";

async function releaseRecorder(recorder: ReturnType<typeof useAudioRecorder>) {
  try {
    await recorder.stop();
  } catch {
    // nothing to stop
  }
}

function formatElapsed(ms: number) {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

export function useVoiceRecording({ onSend, disabled }: HookProps): VoiceRecordingApi {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  const [state, setState]       = useState<VoiceRecordingState>("idle");
  const [elapsedMs, setElapsed] = useState(0);

  const phaseRef      = useRef<SessionPhase>("idle");
  const startedAtRef  = useRef(0);
  const pausedTotalRef = useRef(0);
  const pauseStartedRef = useRef(0);
  const tickRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioReadyRef = useRef(false);
  const sendLockRef   = useRef(false);
  const onSendRef     = useRef(onSend);
  onSendRef.current   = onSend;

  useEffect(() => {
    void setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
      interruptionMode: "doNotMix",
    }).then(() => { audioReadyRef.current = true; }).catch(() => { audioReadyRef.current = false; });

    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      void releaseRecorder(recorder);
    };
  }, [recorder]);

  const stopTicker = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  const startTicker = useCallback(() => {
    stopTicker();
    tickRef.current = setInterval(() => {
      const pausedExtra = phaseRef.current === "paused" && pauseStartedRef.current
        ? Date.now() - pauseStartedRef.current
        : 0;
      setElapsed(Date.now() - startedAtRef.current - pausedTotalRef.current - pausedExtra);
    }, 200);
  }, [stopTicker]);

  const resetSession = useCallback(() => {
    stopTicker();
    phaseRef.current = "idle";
    startedAtRef.current = 0;
    pausedTotalRef.current = 0;
    pauseStartedRef.current = 0;
    setElapsed(0);
    setState("idle");
  }, [stopTicker]);

  const beginRecording = useCallback(async () => {
    if (disabled || phaseRef.current !== "idle") return;

    Keyboard.dismiss();
    phaseRef.current = "preparing";
    setState("preparing");

    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        resetSession();
        Alert.alert("Microphone permission needed", "Enable microphone access in Settings.");
        return;
      }

      if (!audioReadyRef.current) {
        await setAudioModeAsync({
          allowsRecording: true,
          playsInSilentMode: true,
          interruptionMode: "doNotMix",
        });
        audioReadyRef.current = true;
      }

      await releaseRecorder(recorder);
      await recorder.prepareToRecordAsync(RecordingPresets.HIGH_QUALITY);

      if (phaseRef.current !== "preparing") {
        await releaseRecorder(recorder);
        return;
      }

      recorder.record();
      phaseRef.current = "recording";
      startedAtRef.current = Date.now();
      pausedTotalRef.current = 0;
      pauseStartedRef.current = 0;
      setElapsed(0);
      setState("recording");
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      startTicker();
    } catch (e: unknown) {
      await releaseRecorder(recorder);
      resetSession();
      const message = e instanceof Error ? e.message : "Could not start recording.";
      if (!message.includes("already been prepared")) {
        Alert.alert("Recording Error", message);
      }
    }
  }, [disabled, recorder, resetSession, startTicker]);

  const cancelRecording = useCallback(() => {
    if (phaseRef.current === "idle" || phaseRef.current === "finishing") return;
    phaseRef.current = "finishing";
    void (async () => {
      await releaseRecorder(recorder);
      resetSession();
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    })();
  }, [recorder, resetSession]);

  const sendRecording = useCallback(() => {
    if (phaseRef.current !== "recording" && phaseRef.current !== "paused") return;
    if (sendLockRef.current) return;

    phaseRef.current = "finishing";
    stopTicker();

    const elapsed = Date.now() - startedAtRef.current - pausedTotalRef.current
      - (pauseStartedRef.current ? Date.now() - pauseStartedRef.current : 0);

    void (async () => {
      try {
        if (recorder.isRecording) {
          await recorder.stop();
        } else {
          await releaseRecorder(recorder);
        }
      } catch {
        await releaseRecorder(recorder);
      }

      resetSession();

      if (elapsed < MIN_RECORDING_MS) {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        Alert.alert("Too short", "Hold the recording for at least half a second.");
        return;
      }

      sendLockRef.current = true;
      let uri = recorder.uri;
      if (!uri) {
        await new Promise((r) => setTimeout(r, 200));
        uri = recorder.uri;
      }
      if (!uri) {
        sendLockRef.current = false;
        Alert.alert("Recording Error", "No audio file was saved. Please try again.");
        return;
      }

      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSendRef.current({
        uri,
        name: `voice-${Date.now()}.m4a`,
        mimeType: "audio/mp4",
        durationMs: elapsed,
      });
      setTimeout(() => { sendLockRef.current = false; }, 800);
    })();
  }, [recorder, resetSession, stopTicker]);

  const togglePause = useCallback(() => {
    if (phaseRef.current === "recording") {
      try {
        recorder.pause();
      } catch {
        return;
      }
      pauseStartedRef.current = Date.now();
      phaseRef.current = "paused";
      setState("paused");
      stopTicker();
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      return;
    }

    if (phaseRef.current === "paused") {
      if (pauseStartedRef.current) {
        pausedTotalRef.current += Date.now() - pauseStartedRef.current;
        pauseStartedRef.current = 0;
      }
      try {
        recorder.record();
      } catch {
        return;
      }
      phaseRef.current = "recording";
      setState("recording");
      startTicker();
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [recorder, startTicker, stopTicker]);

  return {
    state,
    isActive: state !== "idle",
    isPaused: state === "paused",
    elapsedMs,
    startRecording: () => { void beginRecording(); },
    cancelRecording,
    sendRecording,
    togglePause,
    disabled,
  };
}

function WaveformBars({ active }: { active: boolean }) {
  const bars = useRef(
    Array.from({ length: 28 }, () => new Animated.Value(0.25)),
  ).current;

  useEffect(() => {
    if (!active) {
      bars.forEach((b) => b.setValue(0.2));
      return;
    }
    const loops = bars.map((bar, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(bar, {
            toValue: 0.25 + Math.random() * 0.75,
            duration: 180 + (i % 5) * 40,
            useNativeDriver: false,
          }),
          Animated.timing(bar, {
            toValue: 0.15 + Math.random() * 0.35,
            duration: 180 + (i % 4) * 50,
            useNativeDriver: false,
          }),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [active, bars]);

  return (
    <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 2, height: 28, paddingHorizontal: 4 }}>
      {bars.map((bar, i) => (
        <Animated.View
          key={i}
          style={{
            flex: 1,
            maxWidth: 4,
            borderRadius: 2,
            backgroundColor: "#9CA3AF",
            height: bar.interpolate({ inputRange: [0, 1], outputRange: [4, 28] }),
          }}
        />
      ))}
    </View>
  );
}

/** Full composer panel shown while recording (tap mic → this UI). */
export function VoiceRecordingPanel({ voice }: { voice: VoiceRecordingApi }) {
  if (!voice.isActive) return null;

  const showWave = voice.state === "recording";

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: "#fff",
        borderRadius: 16,
        borderWidth: 1,
        borderColor: "#E5E7EB",
        paddingHorizontal: 14,
        paddingTop: 12,
        paddingBottom: 10,
        gap: 12,
        minHeight: 88,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Text style={{ fontFamily: ListifyFonts.semiBold, fontSize: 16, color: TEXT_MUTED, minWidth: 36 }}>
          {voice.state === "preparing" ? "…" : formatElapsed(voice.elapsedMs)}
        </Text>
        <WaveformBars active={showWave} />
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Pressable
          onPress={voice.cancelRecording}
          hitSlop={12}
          style={{ padding: 8 }}
          accessibilityLabel="Delete recording"
        >
          <MaterialIcons name="delete-outline" size={26} color={TEXT_MUTED} />
        </Pressable>

        <Pressable
          onPress={voice.togglePause}
          disabled={voice.state === "preparing"}
          hitSlop={12}
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            alignItems: "center",
            justifyContent: "center",
            opacity: voice.state === "preparing" ? 0.4 : 1,
          }}
          accessibilityLabel={voice.isPaused ? "Resume recording" : "Pause recording"}
        >
          <MaterialIcons
            name={voice.isPaused ? "mic" : "pause"}
            size={28}
            color={REC}
          />
        </Pressable>

        <Pressable
          onPress={voice.sendRecording}
          disabled={voice.state === "preparing"}
          hitSlop={12}
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: BRAND,
            alignItems: "center",
            justifyContent: "center",
            opacity: voice.state === "preparing" ? 0.5 : 1,
          }}
          accessibilityLabel="Send voice message"
        >
          <MaterialIcons name="send" size={22} color="#fff" style={{ marginLeft: 2 }} />
        </Pressable>
      </View>
    </View>
  );
}

export function VoiceMicButton({
  voice,
  onPress,
}: {
  voice: VoiceRecordingApi;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress ?? voice.startRecording}
      disabled={voice.disabled || voice.isActive}
      style={{
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <MaterialIcons
        name="mic"
        size={24}
        color={voice.disabled ? "#D1D5DB" : BRAND}
      />
    </Pressable>
  );
}

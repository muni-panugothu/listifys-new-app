/**
 * VoiceSearchModal
 * Opens a bottom-sheet modal, immediately starts listening, and calls
 * `onResult(text)` when a final transcript is available.
 */

import { MaterialIcons } from "@expo/vector-icons";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Modal,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";

import { ListifyFonts } from "@/constants/typography";
import { useTheme } from "@/providers/theme-provider";

type Props = {
  visible: boolean;
  onResult: (text: string) => void;
  onClose: () => void;
  /** Called on every interim transcript — wire to autocomplete suggestions */
  onPartialResult?: (text: string) => void;
};

type VoiceState = "idle" | "listening" | "processing" | "error";

/**
 * Strip common voice speech prefixes/suffixes so the search query
 * contains only the product keywords.
 * e.g. "I want to buy an iPhone 14" → "iPhone 14"
 *      "search for red shoes near me" → "red shoes"
 */
function cleanVoiceQuery(text: string): string {
  const cleaned = text
    // Strip leading intent phrases
    .replace(/^(please\s+)?(can you\s+)?(search|find|show|look|get|buy|sell)\s+(me\s+)?(for\s+|a\s+|an\s+)?/i, "")
    .replace(/^(i want|i need|i'm looking for|i am looking for|looking for)\s+(to buy\s+|to sell\s+)?/i, "")
    .replace(/^(i want to buy|i need to buy|i want to find|help me find)\s+/i, "")
    // Strip trailing noise
    .replace(/\s+(near me|for sale|please|now|quickly|today|cheap|cheapest)\s*$/i, "")
    .trim();
  return cleaned.length > 0 ? cleaned : text.trim();
}

export function VoiceSearchModal({ visible, onResult, onClose, onPartialResult }: Props) {
  const { colors, isDark } = useTheme();
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [partialText, setPartialText] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const resultApplied = useRef(false);

  // ── Pulse animation ────────────────────────────────────────────────────────
  const ring1 = useRef(new Animated.Value(1)).current;
  const ring2 = useRef(new Animated.Value(1)).current;
  const ring1Opacity = useRef(new Animated.Value(0.4)).current;
  const ring2Opacity = useRef(new Animated.Value(0.25)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);

  const startPulse = useCallback(() => {
    ring1.setValue(1);
    ring2.setValue(1);
    ring1Opacity.setValue(0.4);
    ring2Opacity.setValue(0.25);
    pulseLoop.current = Animated.loop(
      Animated.stagger(240, [
        Animated.parallel([
          Animated.timing(ring1, {
            toValue: 1.9,
            duration: 900,
            useNativeDriver: true,
          }),
          Animated.timing(ring1Opacity, {
            toValue: 0,
            duration: 900,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(ring2, {
            toValue: 1.9,
            duration: 900,
            useNativeDriver: true,
          }),
          Animated.timing(ring2Opacity, {
            toValue: 0,
            duration: 900,
            useNativeDriver: true,
          }),
        ]),
      ]),
    );
    pulseLoop.current.start();
  }, [ring1, ring1Opacity, ring2, ring2Opacity]);

  const stopPulse = useCallback(() => {
    pulseLoop.current?.stop();
    ring1.setValue(1);
    ring2.setValue(1);
    ring1Opacity.setValue(0);
    ring2Opacity.setValue(0);
  }, [ring1, ring1Opacity, ring2, ring2Opacity]);

  // ── Speech recognition events ──────────────────────────────────────────────
  useSpeechRecognitionEvent("start", () => {
    setVoiceState("listening");
    setPartialText("");
    resultApplied.current = false;
  });

  useSpeechRecognitionEvent("result", (event) => {
    const raw = event.results[0]?.transcript ?? "";
    const transcript = cleanVoiceQuery(raw);
    setPartialText(transcript);
    if (!event.isFinal && transcript) {
      // Stream partial text to parent (e.g. for live autocomplete like OLX / Google)
      onPartialResult?.(transcript);
    }
    if (event.isFinal && transcript && !resultApplied.current) {
      resultApplied.current = true;
      stopPulse();
      setVoiceState("processing");
      // Small delay so user can see the result before the modal closes
      setTimeout(() => {
        onResult(transcript);
        onClose();
      }, 380);
    }
  });

  useSpeechRecognitionEvent("end", () => {
    if (voiceState === "listening") {
      stopPulse();
      setVoiceState(partialText ? "processing" : "idle");
    }
  });

  useSpeechRecognitionEvent("error", (event) => {
    stopPulse();
    const code = event.error;
    if (code === "no-speech") {
      setErrorMsg("No speech detected. Tap the mic to try again.");
    } else if (code === "not-allowed" || code === "service-not-allowed") {
      setErrorMsg("Microphone permission denied.");
    } else {
      setErrorMsg("Recognition failed. Tap to retry.");
    }
    setVoiceState("error");
  });

  // ── Start / stop on visibility change ──────────────────────────────────────
  const startListening = useCallback(async () => {
    setVoiceState("idle");
    setPartialText("");
    setErrorMsg("");
    resultApplied.current = false;

    try {
      const { granted } =
        await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!granted) {
        setVoiceState("error");
        setErrorMsg("Microphone permission denied.");
        return;
      }
      ExpoSpeechRecognitionModule.start({
        lang: "en-IN",
        interimResults: true,
        maxAlternatives: 1,
        continuous: false,
        requiresOnDeviceRecognition: false,
      });
      startPulse();
    } catch {
      setVoiceState("error");
      setErrorMsg("Could not start voice recognition.");
    }
  }, [startPulse]);

  const stopListening = useCallback(() => {
    try {
      ExpoSpeechRecognitionModule.abort();
    } catch {}
    stopPulse();
  }, [stopPulse]);

  useEffect(() => {
    if (visible) {
      void startListening();
    } else {
      stopListening();
      setVoiceState("idle");
      setPartialText("");
      setErrorMsg("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // ── Mic button tap ─────────────────────────────────────────────────────────
  const handleMicPress = () => {
    if (voiceState === "listening") {
      ExpoSpeechRecognitionModule.stop();
      stopPulse();
      setVoiceState("idle");
    } else {
      void startListening();
    }
  };

  // ── Derived UI values ──────────────────────────────────────────────────────
  const isListening = voiceState === "listening";
  const micBg = isListening
    ? colors.primary
    : voiceState === "error"
      ? isDark
        ? "rgba(239,68,68,0.15)"
        : "#FEF2F2"
      : colors.surfaceMuted;
  const micIconColor = isListening
    ? colors.textOnPrimary
    : voiceState === "error"
      ? colors.danger
      : colors.textSecondary;
  const micIconName =
    voiceState === "error" ? "mic-off" : isListening ? "mic" : "mic";

  const titleText =
    voiceState === "listening"
      ? "Listening…"
      : voiceState === "processing"
        ? "Got it!"
        : voiceState === "error"
          ? "Try again"
          : "Voice Search";

  const subtitleText =
    voiceState === "listening"
      ? 'Say something like "car" or "bike"'
      : voiceState === "processing"
        ? "Searching…"
        : voiceState === "error"
          ? errorMsg
          : "Tap the mic to start";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Backdrop — tap to cancel */}
      <Pressable
        className="flex-1 justify-end"
        style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
        onPress={onClose}
      >
        {/* Sheet — stop press events propagating to backdrop */}
        <Pressable
          className="items-center rounded-t-3xl px-6 pb-12 pt-5"
          style={{ backgroundColor: colors.surface }}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Drag handle */}
          <View
            className="mb-6 h-1 w-10 rounded-full"
            style={{ backgroundColor: colors.borderStrong }}
          />

          {/* Title */}
          <Text
            className="mb-1 text-[22px]"
            style={{ fontFamily: ListifyFonts.bold, color: colors.textPrimary }}
          >
            {titleText}
          </Text>
          <Text
            className="mb-8 text-center text-[14px]"
            style={{ fontFamily: ListifyFonts.regular, color: colors.textTertiary }}
          >
            {subtitleText}
          </Text>

          {/* Mic icon with ripple rings */}
          <View className="mb-8 h-28 w-28 items-center justify-center">
            {/* Ripple ring 1 */}
            <Animated.View
              style={{
                position: "absolute",
                width: 80,
                height: 80,
                borderRadius: 40,
                backgroundColor: colors.primary,
                transform: [{ scale: ring1 }],
                opacity: ring1Opacity,
              }}
            />
            {/* Ripple ring 2 */}
            <Animated.View
              style={{
                position: "absolute",
                width: 80,
                height: 80,
                borderRadius: 40,
                backgroundColor: colors.primary,
                transform: [{ scale: ring2 }],
                opacity: ring2Opacity,
              }}
            />
            {/* Mic button */}
            <Pressable
              onPress={handleMicPress}
              style={({ pressed }) => ({
                width: 80,
                height: 80,
                borderRadius: 40,
                backgroundColor: micBg,
                alignItems: "center",
                justifyContent: "center",
                opacity: pressed ? 0.85 : 1,
                elevation: isListening ? 6 : 2,
                shadowColor: isListening ? colors.primary : "#000",
                shadowOffset: { width: 0, height: isListening ? 4 : 2 },
                shadowOpacity: isListening ? 0.35 : 0.1,
                shadowRadius: isListening ? 8 : 4,
              })}
            >
              <MaterialIcons name={micIconName} size={38} color={micIconColor} />
            </Pressable>
          </View>

          {/* Recognised text */}
          <View style={{ minHeight: 52, alignItems: "center", paddingHorizontal: 16, marginBottom: 16 }}>
            {partialText ? (
              <Text
                className="text-center text-[20px]"
                style={{ fontFamily: ListifyFonts.semiBold, color: colors.textPrimary }}
                numberOfLines={2}
              >
                &quot;{partialText}&quot;
              </Text>
            ) : (
              // Placeholder dots while listening
              isListening ? (
                <Text
                  className="text-[28px] tracking-widest"
                  style={{ fontFamily: ListifyFonts.bold, color: colors.primary }}
                >
                  • • •
                </Text>
              ) : null
            )}
          </View>

          {/* Cancel */}
          <Pressable
            onPress={onClose}
            style={({ pressed }) => ({
              opacity: pressed ? 0.6 : 1,
              paddingHorizontal: 32,
              paddingVertical: 10,
            })}
          >
            <Text
              className="text-[15px]"
              style={{ fontFamily: ListifyFonts.medium, color: colors.textTertiary }}
            >
              Cancel
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

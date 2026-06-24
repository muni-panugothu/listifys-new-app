/**
 * MessageAttachmentView — renders the *attachment portion* of a chat bubble.
 * The bubble itself owns the chrome (background, text); we just slot in the
 * media so the layout stays consistent for image, video, voice note, and doc.
 *
 *   image  → tappable preview, opens lightbox
 *   video  → play-overlay thumb (lightbox playback handled by caller)
 *   audio  → inline player with play/pause + position bar + duration
 *   other  → file chip with icon + filename + size
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View, ActivityIndicator } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { Image } from "@/lib/nativewind-interop";
import { ListifyFonts } from "@/constants/typography";
import { resolveAbsoluteMediaUrl } from "@/features/auth/services/auth-api";
import type { ChatAttachment } from "@/features/messaging/services/chat-api";

const BRAND      = "#27BB97";
const TEXT_DARK  = "#1A1A1A";
const TEXT_MUTED = "#9CA3AF";

const fmtSeconds = (s: number) => {
  if (!Number.isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${m}:${ss < 10 ? "0" : ""}${ss}`;
};

const fmtBytes = (n?: number) => {
  if (!n || n < 1024) return `${n ?? 0} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

type Kind = "image" | "video" | "audio" | "document";

function detectKind(a: ChatAttachment): Kind {
  const t = (a.type || a.mimeType || "").toLowerCase();
  if (t.includes("video")) return "video";
  if (t.includes("audio")) return "audio";
  if (t.includes("image")) return "image";
  return "document";
}

// ── Audio player row ────────────────────────────────────────────────────────────
function AudioBubble({
  uri,
  tint,
  isPending,
  onLongPress,
}: {
  uri: string;
  tint: string;
  isPending?: boolean;
  onLongPress?: () => void;
}) {
  // expo-audio's `useAudioPlayer` lazily loads when accessed. We pause when the
  // bubble unmounts (handled by the hook) so a scrolled-away note doesn't keep
  // playing.
  const player = useAudioPlayer({ uri });
  const status = useAudioPlayerStatus(player);

  const duration = status?.duration ?? 0;
  const position = status?.currentTime ?? 0;
  const isLoaded = status?.isLoaded;
  const isPlaying = status?.playing;

  const progress = duration > 0 ? Math.min(1, position / duration) : 0;

  const toggle = () => {
    if (!isLoaded) return;
    if (isPlaying) {
      player.pause();
    } else {
      // expo-audio plays straight through to the end; reset if we're at it.
      if (duration > 0 && position >= duration - 0.1) {
        player.seekTo(0);
      }
      player.play();
    }
  };

  return (
    <Pressable
      onLongPress={isPending ? undefined : onLongPress}
      delayLongPress={250}
      style={{ flexDirection: "row", alignItems: "center", gap: 10, minWidth: 200, paddingVertical: 4 }}
    >
      <Pressable
        onPress={isPending ? undefined : toggle}
        hitSlop={8}
        style={{
          width: 34, height: 34, borderRadius: 17, backgroundColor: tint,
          alignItems: "center", justifyContent: "center",
        }}
      >
        {isPending || !isLoaded ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <MaterialIcons name={isPlaying ? "pause" : "play-arrow"} size={22} color="#fff" />
        )}
      </Pressable>

      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ height: 3, backgroundColor: "#D1D5DB", borderRadius: 2, overflow: "hidden" }}>
          <View style={{ width: `${progress * 100}%`, height: "100%", backgroundColor: tint }} />
        </View>
        <Text style={{ fontFamily: ListifyFonts.regular, fontSize: 11, color: TEXT_MUTED }}>
          {fmtSeconds(isPlaying || position > 0 ? position : duration)}
        </Text>
      </View>
    </Pressable>
  );
}

// ── Image / Video preview ─────────────────────────────────────────────────────
function MediaPreview({
  uri,
  kind,
  onPress,
  onLongPress,
  isPending,
}: {
  uri: string;
  kind: "image" | "video";
  onPress?: () => void;
  onLongPress?: () => void;
  isPending?: boolean;
}) {
  return (
    <Pressable
      onPress={isPending ? undefined : onPress}
      onLongPress={isPending ? undefined : onLongPress}
      delayLongPress={250}
      style={{ borderRadius: 12, overflow: "hidden", backgroundColor: "#000" }}
    >
      <Image
        source={{ uri }}
        contentFit="cover"
        style={{ width: 220, height: 220, opacity: isPending ? 0.65 : 1 }}
      />
      {isPending && (
        <View
          style={{
            position: "absolute",
            inset: 0,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(0,0,0,0.35)",
          }}
        >
          <ActivityIndicator size="large" color="#fff" />
        </View>
      )}
      {kind === "video" && (
        <View
          style={{
            position: "absolute", inset: 0,
            alignItems: "center", justifyContent: "center",
            backgroundColor: "rgba(0,0,0,0.25)",
          }}
        >
          <View
            style={{
              width: 48, height: 48, borderRadius: 24,
              backgroundColor: "rgba(0,0,0,0.55)",
              alignItems: "center", justifyContent: "center",
            }}
          >
            <MaterialIcons name="play-arrow" size={32} color="#fff" />
          </View>
        </View>
      )}
    </Pressable>
  );
}

// ── Document chip ──────────────────────────────────────────────────────────────
function DocumentChip({ a, fromMe }: { a: ChatAttachment; fromMe: boolean }) {
  return (
    <View
      style={{
        flexDirection: "row", alignItems: "center", gap: 10,
        paddingVertical: 6,
        minWidth: 200,
      }}
    >
      <MaterialIcons name="insert-drive-file" size={28} color={fromMe ? "#fff" : BRAND} />
      <View style={{ flex: 1 }}>
        <Text
          numberOfLines={1}
          style={{ fontFamily: ListifyFonts.semiBold, fontSize: 13, color: fromMe ? "#fff" : TEXT_DARK }}
        >
          {a.name || "Document"}
        </Text>
        <Text style={{ fontFamily: ListifyFonts.regular, fontSize: 11, color: fromMe ? "rgba(255,255,255,0.8)" : TEXT_MUTED }}>
          {fmtBytes(a.size)}
        </Text>
      </View>
    </View>
  );
}

// ── Public component ──────────────────────────────────────────────────────────
type Props = {
  attachments: ChatAttachment[];
  fromMe: boolean;
  onOpenMedia?: (a: ChatAttachment, kind: "image" | "video") => void;
  onLongPress?: () => void;
  isPending?: boolean;
};

export function MessageAttachmentView({ attachments, fromMe, onOpenMedia, onLongPress, isPending }: Props) {
  if (!attachments || attachments.length === 0) return null;
  return (
    <View style={{ gap: 6 }}>
      {attachments.map((a, idx) => (
        <AttachmentSlot
          key={`${a.key || a.url}-${idx}`}
          a={a}
          fromMe={fromMe}
          onOpenMedia={onOpenMedia}
          onLongPress={onLongPress}
          isPending={isPending}
        />
      ))}
    </View>
  );
}

function AttachmentSlot({
  a,
  fromMe,
  onOpenMedia,
  onLongPress,
  isPending,
}: {
  a: ChatAttachment;
  fromMe: boolean;
  onOpenMedia?: (a: ChatAttachment, kind: "image" | "video") => void;
  onLongPress?: () => void;
  isPending?: boolean;
}) {
  const kind = useMemo(() => detectKind(a), [a]);
  const resolvedUri = useMemo(() => resolveAbsoluteMediaUrl(a.url) || a.url, [a.url]);
  const audioTint = fromMe ? "#1E9F7C" : BRAND;

  if (kind === "audio" && resolvedUri) {
    const audioUri = typeof resolvedUri === "string" ? resolvedUri : (resolvedUri as any)?.uri || a.url;
    return <AudioBubble uri={audioUri} tint={audioTint} isPending={isPending} onLongPress={onLongPress} />;
  }

  if ((kind === "image" || kind === "video") && resolvedUri) {
    const mediaUri = typeof resolvedUri === "string" ? resolvedUri : (resolvedUri as any)?.uri || a.url;
    return (
      <MediaPreview
        uri={mediaUri}
        kind={kind}
        onPress={() => onOpenMedia?.(a, kind)}
        onLongPress={onLongPress}
        isPending={isPending}
      />
    );
  }

  return (
    <Pressable onLongPress={isPending ? undefined : onLongPress} delayLongPress={250}>
      <DocumentChip a={a} fromMe={fromMe} />
    </Pressable>
  );
}

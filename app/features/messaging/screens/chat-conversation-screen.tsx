/**
 * ChatConversationScreen — user-centric marketplace chat.
 *
 * Params (from router):
 *   conversationId   — existing conversation (open from inbox)
 *   recipientId      — open conversation with a user (from profile / listing)
 *   name             — display name of the other user
 *   productId        — product the user tapped "Chat" on
 *   productType      — listing category
 *   productTitle
 *   productPrice
 *   productImage
 *   currency
 *   sellerId         — who owns the listing (may differ from recipientId)
 *
 * Layout:
 *   ┌─ Header (back, avatar, name, call buttons) ──────────────────┐
 *   │  Thread selector tabs (iPhone 15 | MacBook Pro | …)          │
 *   │  ── ProductThreadSection (banner) ────────────────────────── │
 *   │  ── Messages (FlatList) ───────────────────────────────────── │
 *   │  ── Offer card (if offerStatus !== none) ──────────────────── │
 *   └─ Input bar (disabled when thread is closed) ─────────────────┘
 */
import { MaterialIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

// Resolved lazily so the screen still loads if `expo-clipboard` hasn't been
// installed yet (e.g. fresh checkout before `npm install`). The Copy action
// degrades gracefully when it's missing.
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    const mod = require("expo-clipboard");
    if (mod?.setStringAsync) {
      await mod.setStringAsync(text);
      return true;
    }
    if (mod?.setString) {
      mod.setString(text);
      return true;
    }
  } catch {
    // expo-clipboard not installed yet — handled by caller.
  }
  return false;
}
import { useLocalSearchParams, useRouter, type Href } from "@/lib/safe-router";
import {
  useCallback, useEffect, useMemo, useRef, useState,
} from "react";
import {
  ActivityIndicator, FlatList,
  Pressable, ScrollView,
  Text, TextInput, View, Modal, Alert, Keyboard,
  type NativeScrollEvent, type NativeSyntheticEvent,
} from "react-native";
import { validateOfferAmount, parseListedPrice } from "@/lib/offer-validation";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useKeyboardInset } from "@/hooks/use-keyboard-inset";

import { APP_SCREEN_BG } from "@/constants/theme";
import { ListifyFonts } from "@/constants/typography";
import { resolveAbsoluteMediaUrl } from "@/features/auth/services/auth-api";
import { normalizeListingChatParams } from "@/lib/listing-chat";
import { getListingDetailHref } from "@/lib/notification-navigation";
import { showErrorToast } from "@/lib/toast";
import { adjustNotificationUnread } from "@/lib/notification-unread-bus";
import {
  getOrCreateConversation, getConversation, listThreads, getThreadMessages,
  sendMessageApi, markThreadRead, markConversationRead,
  makeOffer, acceptOffer, declineOffer, closeThread,
  generateClientMessageId,
  uploadChatAttachment,
  deleteMessageForMe as deleteMessageForMeApi,
  deleteMessageForEveryone as deleteMessageForEveryoneApi,
  type ProductThread, type ChatMessage, type Conversation, type ChatParticipant,
  type ChatAttachment,
} from "@/features/messaging/services/chat-api";
import { ProductThreadSection } from "@/features/messaging/components/product-thread-section";
import { OfferCard } from "@/features/messaging/components/offer-card";
import { MessageAttachmentView } from "@/features/messaging/components/message-attachment-view";
import { RepliedMessagePreview } from "@/features/messaging/components/replied-message-preview";
import { ReplyPreviewBar } from "@/features/messaging/components/reply-preview-bar";
import { AttachmentPickerSheet, type LocalAttachment } from "@/features/messaging/components/attachment-picker-sheet";
import { EmojiPickerPanel } from "@/features/messaging/components/emoji-picker-sheet";
import {
  useVoiceRecording, VoiceMicButton, VoiceRecordingPanel,
  type RecordedVoiceNote,
} from "@/features/messaging/components/voice-recorder";
import { MessageActionsSheet, type MessageAction } from "@/features/messaging/components/message-actions-sheet";
import {
  connectSocket, joinConversation, leaveConversation, joinThread, leaveThread,
  emitTypingStart, emitTypingStop, emitMessagesDelivered, requestStatusCatchup, getSocket,
  type StatusCatchupUpdate,
} from "@/features/messaging/services/socket-service";
import { Image } from "@/lib/nativewind-interop";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  incomingMessage, threadClosed, offerUpdated,
  setActiveConversation, setActiveThread,
  optimisticMessage, confirmMessage,
  messageDeletedForEveryone, messageDeletedForMe,
} from "@/store/slices/messaging-slice";
import { outgoingCallStarted } from "@/store/slices/call-slice";

const BRAND         = "#27BB97";
const CHAT_BG       = APP_SCREEN_BG;
const BAR_BG        = APP_SCREEN_BG;
const INCOMING_BG   = "#E8E8E8";
const OFFER_BG      = "#EFF6FF";
const SYSTEM_BG     = "#F3F4F6";
const TEXT_MUTED    = "#9CA3AF";
const TEXT_DARK     = "#1A1A1A";

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}
function formatDateHeader(dateStr: string) {
  const d    = new Date(dateStr);
  const now  = new Date();
  const yest = new Date(now); yest.setDate(now.getDate() - 1);
  if (d.toDateString() === now.toDateString())  return "Today";
  if (d.toDateString() === yest.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
function dedup(msgs: ChatMessage[]) {
  const m = new Map<string, ChatMessage>();
  for (const msg of msgs) m.set(msg._id, msg);
  return Array.from(m.values());
}
function sortChron(msgs: ChatMessage[]) {
  return dedup(msgs).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}
function senderId(m: ChatMessage) {
  return typeof m.sender === "string" ? m.sender : (m.sender as any)?.id ?? (m.sender as any)?._id ?? "";
}
function isFromMe(m: ChatMessage, uid?: string) { return senderId(m) === uid; }

// Status precedence — same as the slice. Used to guarantee ticks only move
// forward (sending → sent → delivered → read) even if events arrive out of order.
const STATUS_RANK: Record<string, number> = { sending: 0, sent: 1, delivered: 2, read: 3 };
function mergeStatus(
  msg: ChatMessage,
  next: ChatMessage["status"],
  at?: string | null,
): ChatMessage {
  if (STATUS_RANK[next] < STATUS_RANK[msg.status]) return msg;
  return {
    ...msg,
    status: next,
    ...(next === "delivered" && at ? { deliveredAt: at } : {}),
    ...(next === "read" && at ? { readAt: at, deliveredAt: msg.deliveredAt || at } : {}),
  };
}

function syncNotificationBadge(res: { notificationsMarked?: number }) {
  const marked = res.notificationsMarked ?? 0;
  if (marked > 0) adjustNotificationUnread(-marked);
}

function participantId(participant?: ChatParticipant | string | null): string {
  if (!participant) return "";
  if (typeof participant === "string") return participant;
  return String(participant.id ?? participant._id ?? "");
}

function findOtherParticipant(
  participants: ChatParticipant[] | undefined,
  currentUserId?: string,
): ChatParticipant | null {
  if (!participants?.length) return null;
  const me = String(currentUserId ?? "");
  return (
    participants.find((p) => {
      const pid = participantId(p);
      return pid && pid !== me;
    }) ?? null
  );
}

function inferAttachmentKind(mimeType: string): ChatAttachment["type"] {
  const mt = mimeType.toLowerCase();
  if (mt.includes("video")) return "video";
  if (mt.includes("audio")) return "audio";
  if (mt.includes("image")) return "image";
  return "document";
}

function inferMessageType(kind: ChatAttachment["type"]): ChatMessage["messageType"] {
  if (kind === "video") return "video";
  if (kind === "audio") return "audio";
  if (kind === "image") return "image";
  if (kind === "document") return "document";
  return "text";
}

function profileImageFromParticipant(
  participant?: ChatParticipant | string | null,
): string | null {
  if (!participant || typeof participant === "string") return null;
  return participant.profileImageUrl ?? null;
}

// WhatsApp-style status tick. Renders one of:
//   sending   → small clock icon (request in flight)
//   sent      → single grey check
//   delivered → double grey check
//   read      → double brand-colour check
function MessageStatusTick({ status }: { status: ChatMessage["status"] }) {
  if (status === "sending") {
    return (
      <MaterialIcons name="access-time" size={12} color={TEXT_MUTED} />
    );
  }
  if (status === "sent") {
    return (
      <MaterialIcons name="check" size={14} color={TEXT_MUTED} />
    );
  }
  // delivered or read — both show double-check, only colour differs.
  return (
    <MaterialIcons
      name="done-all"
      size={14}
      color={status === "read" ? BRAND : TEXT_MUTED}
    />
  );
}

export function ChatConversationScreen() {
  const router  = useRouter();
  const rawParams = useLocalSearchParams<Record<string, string | string[] | undefined>>();
  const chatParams = useMemo(() => normalizeListingChatParams(rawParams), [rawParams]);
  const params = chatParams;
  const insets  = useSafeAreaInsets();
  const user    = useAppSelector((s) => s.auth.user);
  const dispatch = useAppDispatch();

  // ── Core state ─────────────────────────────────────────────────────────────
  const [conversation, setConversation]  = useState<Conversation | null>(null);
  const [threads,      setThreads]       = useState<ProductThread[]>([]);
  const [activeThread, setActiveThreadSt] = useState<ProductThread | null>(null);
  const [messages,     setMessages]      = useState<ChatMessage[]>([]);
  const [loading,      setLoading]       = useState(true);

  const [messageText, setMessageText]    = useState("");
  const [sending,     setSending]        = useState(false);
  const [isTyping,    setIsTyping]       = useState(false);
  const [typingUser,  setTypingUser]     = useState<string | null>(null);

  const [offerInput,  setOfferInput]     = useState("");
  const [offerError,  setOfferError]     = useState("");
  const [offerModal,  setOfferModal]     = useState(false);

  // ── WhatsApp-style features state ───────────────────────────────────────────
  // The message we're currently replying to (null = no reply context).
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  // Open/close state for the three composer sheets.
  const [attachmentSheet, setAttachmentSheet] = useState(false);
  const [emojiSheet,      setEmojiSheet]      = useState(false);
  // Long-press → MessageActionsSheet target (null = closed).
  const [actionTarget,    setActionTarget]    = useState<ChatMessage | null>(null);
  const [mediaPreview,    setMediaPreview]    = useState<{ uri: string; kind: "image" | "video" } | null>(null);
  // Briefly halo a bubble after the user taps a reply snippet that jumps to it.
  const [highlightedId,   setHighlightedId]   = useState<string | null>(null);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flatRef    = useRef<FlatList>(null);
  const inputRef   = useRef<TextInput>(null);
  const typingRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isNearBottomRef = useRef(true);
  const listContentHeightRef = useRef(0);

  const keyboardInset = useKeyboardInset();
  const composerSafePad = keyboardInset > 0 ? 6 : Math.max(insets.bottom, 10);
  const canSend    = messageText.trim().length > 0 && !!activeThread && activeThread.status === "active";
  const isSeller   = activeThread ? String((activeThread.seller as any)?.id ?? activeThread.seller) === user?.id : false;

  // ── Keyboard / scroll (team-chat pattern: inset lifts whole column) ────────
  const scrollToBottom = useCallback((animated = true, force = false) => {
    if (!force && !isNearBottomRef.current) return;
    const list = flatRef.current;
    if (!list) return;

    const attempt = () => {
      try {
        list.scrollToEnd({ animated });
      } catch {
        try {
          const y = Math.max(0, listContentHeightRef.current);
          list.scrollToOffset({ offset: y, animated });
        } catch {
          // List may not be laid out yet.
        }
      }
    };

    attempt();
    requestAnimationFrame(attempt);
    setTimeout(attempt, 60);
    setTimeout(attempt, 200);
  }, []);

  const handleListContentSizeChange = useCallback((_w: number, h: number) => {
    if (typeof h === "number" && h > 0) listContentHeightRef.current = h;
    if (isNearBottomRef.current) scrollToBottom(false, true);
  }, [scrollToBottom]);

  const handleListScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
    isNearBottomRef.current = distanceFromBottom < 120;
  }, []);

  useEffect(() => {
    if (keyboardInset > 0) {
      isNearBottomRef.current = true;
      scrollToBottom(true, true);
      const t = setTimeout(() => scrollToBottom(true, true), 80);
      return () => clearTimeout(t);
    }
  }, [keyboardInset, scrollToBottom]);

  useEffect(() => {
    if (!loading && messages.length > 0 && isNearBottomRef.current) {
      scrollToBottom(true, true);
    }
  }, [messages.length, loading, scrollToBottom]);

  // ── Bootstrap (screen-first, parallel) ─────────────────────────────────────
  // 1) Socket connect is fire-and-forget — most calls are no-ops since the
  //    app-start handshake already ran. The bootstrap never `awaits` it.
  // 2) When the screen opens with a known conversationId we fire
  //    getConversation + listThreads in parallel via Promise.all.
  // 3) The first message page is fetched as soon as the active thread is
  //    known — but we never block the screen on it; the FlatList renders
  //    with whatever we have and the spinner is only shown when nothing
  //    useful (no header subject, no messages) is available yet.
  useEffect(() => {
    let cancelled = false;

    // Fire socket connection in background — never await it on the open path.
    connectSocket().catch(() => {});

    (async () => {
      try {
        let convId = params.conversationId;
        let bootstrapThread: ProductThread | null = null;

        if (!convId && params.recipientId) {
          // First-time chat from a listing: must round-trip to create the
          // conversation. Show shell immediately (header rendered from
          // route params like productTitle / recipientName).
          const res = await getOrCreateConversation({
            recipientId:   params.recipientId,
            productId:     params.productId,
            productType:   params.productType,
            productTitle:  params.productTitle,
            productPrice:  params.productPrice ? Number(params.productPrice) : undefined,
            productImage:  params.productImage,
            currency:      params.currency,
          });
          if (cancelled) return;
          convId           = res.conversation._id;
          bootstrapThread  = res.thread;
          setConversation(res.conversation);
        }

        if (!convId) {
          setLoading(false);
          return;
        }

        // Parallel: load conversation + threads simultaneously.
        const [convRes, threadsRes] = await Promise.all([
          bootstrapThread
            ? Promise.resolve({ conversation: null as Conversation | null })
            : getConversation(convId).catch(() => ({ conversation: null as Conversation | null })),
          listThreads(convId, "all").catch(() => ({ threads: [] as ProductThread[] })),
        ]);
        if (cancelled) return;

        if (convRes.conversation) setConversation(convRes.conversation);
        const allThreads = threadsRes.threads ?? [];
        setThreads(allThreads);
        dispatch(setActiveConversation(convId));

        let initialThread: ProductThread | null = null;
        if (bootstrapThread) {
          initialThread = bootstrapThread;
        } else if (params.productId) {
          initialThread = allThreads.find((t) => String(t.product.productId) === params.productId) ?? allThreads[0] ?? null;
        } else {
          initialThread = allThreads.sort(
            (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime(),
          )[0] ?? null;
        }

        if (initialThread) {
          // openThread loads messages — once it resolves we drop the spinner.
          await openThread(initialThread, convId, false);
        }
        joinConversation(convId);
      } catch (e) {
        console.warn("[Chat] Bootstrap error", e);
        showErrorToast(
          "Chat Error",
          e instanceof Error ? e.message : "Could not open this conversation.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Open a thread (load its messages) ─────────────────────────────────────
  // Removed the awaited `connectSocket()` — it duplicated work already done in
  // the bootstrap effect and added perceived latency to every thread switch.
  const openThread = useCallback(async (thread: ProductThread, convId?: string, animate = true) => {
    setActiveThreadSt(thread);
    dispatch(setActiveThread(thread._id));
    try {
      const activeConvId = convId ?? conversation?._id;
      if (activeConvId) {
        joinConversation(activeConvId);
      }
      joinThread(thread._id);
      const res = await getThreadMessages(thread._id, 1, 50);
      setMessages(sortChron(res.messages));
      if (animate) scrollToBottom(true, true);
      markThreadRead(thread._id).then(syncNotificationBadge).catch(() => {});
    } catch (e) {
      showErrorToast(
        "Chat Error",
        e instanceof Error ? e.message : "Could not load messages for this product.",
      );
    }
  }, [conversation?._id, dispatch, scrollToBottom]);

  // ── Socket events ──────────────────────────────────────────────────────────
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onMsg = (data: ChatMessage & { threadId?: string }) => {
      if (!conversation) return;
      const threadId = data.threadId ?? data.productThread ?? "";
      if (data.productThread === activeThread?._id || data.threadId === activeThread?._id) {
        setMessages((prev) => {
          // If this is the server echo of a message *we* just sent, the
          // optimistic bubble has the same clientMessageId — reconcile it in
          // place instead of appending a duplicate.
          let next = prev;
          if (data.clientMessageId) {
            const i = prev.findIndex((m) => m.clientMessageId === data.clientMessageId);
            if (i >= 0) {
              next = [...prev];
              next[i] = { ...prev[i], ...data, status: data.status || prev[i].status };
              return sortChron(next);
            }
          }
          return sortChron(dedup([...next, data]));
        });
        scrollToBottom(true, true);

        // Only ack delivery for messages from other users. Batched: the
        // socket-service coalesces all calls within ~250ms into one emit.
        if (senderId(data) !== user?.id) {
          emitMessagesDelivered(conversation._id, threadId || null, [data._id]);
        }
      }
      dispatch(incomingMessage({ threadId, message: data, conversationId: conversation._id }));
    };

    // ── Status updates (single + batched) ────────────────────────────────────
    // Sender side: server tells us "your message is now delivered/read".
    const applyStatusToLocal = (
      messageIds: string[],
      status: ChatMessage["status"],
      at?: string | null,
    ) => {
      if (messageIds.length === 0) return;
      const ids = new Set(messageIds);
      setMessages((prev) => {
        let mutated = false;
        const next = prev.map((m) => {
          if (!ids.has(m._id)) return m;
          const merged = mergeStatus(m, status, at);
          if (merged !== m) mutated = true;
          return merged;
        });
        return mutated ? next : prev;
      });
    };

    const onMessageStatus = (data: {
      messageId: string;
      conversationId?: string;
      threadId?: string;
      status: ChatMessage["status"];
      at?: string | null;
    }) => {
      if (!data?.messageId || !data?.status) return;
      applyStatusToLocal([data.messageId], data.status, data.at);
    };

    const onMessageStatusBatch = (data: {
      conversationId?: string;
      threadId?: string;
      status: ChatMessage["status"] | "catchup";
      messageIds?: string[];
      updates?: StatusCatchupUpdate[];
      at?: string | null;
    }) => {
      if (data?.status === "catchup" && Array.isArray(data.updates)) {
        setMessages((prev) => {
          const byId = new Map(data.updates!.map((u) => [u.messageId, u]));
          let mutated = false;
          const next = prev.map((m) => {
            const u = byId.get(m._id);
            if (!u) return m;
            const merged = mergeStatus(m, u.status, u.readAt ?? u.deliveredAt ?? null);
            if (merged !== m) mutated = true;
            return merged;
          });
          return mutated ? next : prev;
        });
        return;
      }
      if (Array.isArray(data.messageIds) && data.status) {
        applyStatusToLocal(data.messageIds, data.status as ChatMessage["status"], data.at);
      }
    };

    const onTypingStart = (d: { threadId?: string; userId: string; userName: string }) => {
      if (d.threadId === activeThread?._id || !d.threadId) {
        setTypingUser(d.userName);
        setIsTyping(true);
      }
    };
    const onTypingStop = (d: { threadId?: string }) => {
      if (d.threadId === activeThread?._id || !d.threadId) {
        setIsTyping(false);
        setTypingUser(null);
      }
    };
    const onThreadClosed = (d: { threadId: string; status: string; closedReason: string }) => {
      setThreads((prev) => prev.map((t) => t._id === d.threadId ? { ...t, status: d.status as any, closedReason: d.closedReason } : t));
      if (activeThread?._id === d.threadId) {
        setActiveThreadSt((prev) => prev ? { ...prev, status: d.status as any, closedReason: d.closedReason } : prev);
      }
      dispatch(threadClosed({ threadId: d.threadId, conversationId: conversation?._id ?? "", status: d.status, closedReason: d.closedReason }));
    };
    const onThreadReopened = (d: { threadId: string; status: string }) => {
      setThreads((prev) =>
        prev.map((t) =>
          t._id === d.threadId
            ? { ...t, status: "active" as const, closedReason: null, closedAt: null }
            : t,
        ),
      );
      if (activeThread?._id === d.threadId) {
        setActiveThreadSt((prev) =>
          prev ? { ...prev, status: "active", closedReason: null, closedAt: null } : prev,
        );
      }
    };
    const onOfferUpdate = (d: { threadId: string; message: ChatMessage; offerStatus: string; accepted: boolean }) => {
      if (d.threadId === activeThread?._id) {
        setMessages((prev) => {
          const all = dedup([...prev, d.message]);
          return sortChron(all);
        });
        setActiveThreadSt((prev) => prev ? { ...prev, offerStatus: d.offerStatus as any } : prev);
        scrollToBottom(true, true);
      }
      dispatch(offerUpdated({ threadId: d.threadId, conversationId: conversation?._id ?? "", offerStatus: d.offerStatus, accepted: d.accepted, message: d.message }));
    };

    // "Delete for everyone" broadcast — tomb-stone the bubble locally.
    const onMessageDeleted = (d: { messageId: string; conversationId: string; threadId?: string }) => {
      const targetThread = d.threadId || activeThread?._id;
      if (!targetThread) return;
      setMessages((prev) => prev.map((m) => (
        m._id === d.messageId
          ? { ...m, deletedForEveryone: true, content: "", attachments: [], messageType: m.messageType === "offer" ? "offer" : "text" }
          : m
      )));
      dispatch(messageDeletedForEveryone({ threadId: targetThread, messageId: d.messageId }));
    };

    socket.on("chat:message",         onMsg);
    socket.on("chat:offer",           (d) => { onOfferUpdate({ ...d, accepted: false }); });
    socket.on("chat:offer_update",    onOfferUpdate);
    socket.on("chat:message_deleted", onMessageDeleted);
    socket.on("thread:closed",        onThreadClosed);
    socket.on("thread:reopened",      onThreadReopened);
    socket.on("thread:typing:start",  onTypingStart);
    socket.on("thread:typing:stop",   onTypingStop);
    socket.on("typing:start",         onTypingStart);
    socket.on("typing:stop",          onTypingStop);
    socket.on("message:status",        onMessageStatus);
    socket.on("message:status:batch",  onMessageStatusBatch);

    return () => {
      socket.off("chat:message",         onMsg);
      socket.off("chat:offer",           onOfferUpdate as any);
      socket.off("chat:offer_update",    onOfferUpdate);
      socket.off("chat:message_deleted", onMessageDeleted);
      socket.off("thread:closed",        onThreadClosed);
      socket.off("thread:reopened",      onThreadReopened);
      socket.off("thread:typing:start",  onTypingStart);
      socket.off("thread:typing:stop",   onTypingStop);
      socket.off("typing:start",         onTypingStart);
      socket.off("typing:stop",          onTypingStop);
      socket.off("message:status",        onMessageStatus);
      socket.off("message:status:batch",  onMessageStatusBatch);
    };
  }, [conversation, activeThread, dispatch, scrollToBottom, user?.id]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const convId = conversation?._id ?? params.conversationId;
      if (convId) {
        leaveConversation(convId);
        markConversationRead(convId).then(syncNotificationBadge).catch(() => {});
      }
      if (activeThread) leaveThread(activeThread._id);
      dispatch(setActiveConversation(null));
      dispatch(setActiveThread(null));
    };
  }, [activeThread, conversation, dispatch, params.conversationId]);

  // ── Status catch-up ────────────────────────────────────────────────────────
  // After opening a thread (or reconnecting) we may have missed
  // `message:status` events for messages *we* sent while the socket was down.
  // Ask the server for the canonical status of every in-flight one.
  useEffect(() => {
    const threadId = activeThread?._id;
    if (!threadId) return;

    let cancelled = false;

    const runCatchup = async () => {
      try {
        const res = await requestStatusCatchup(threadId);
        if (cancelled || !res.ok || !res.updates || res.updates.length === 0) return;
        const byId = new Map(res.updates.map((u) => [u.messageId, u]));
        setMessages((prev) => {
          let mutated = false;
          const next = prev.map((m) => {
            const u = byId.get(m._id);
            if (!u) return m;
            const merged = mergeStatus(m, u.status, u.readAt ?? u.deliveredAt ?? null);
            if (merged !== m) mutated = true;
            return merged;
          });
          return mutated ? next : prev;
        });
      } catch {
        // Catch-up is best-effort. Next `message:status` event will reconcile.
      }
    };

    // Run once on thread open.
    void runCatchup();

    // …and again every time the socket reconnects.
    const socket = getSocket();
    if (!socket) return;
    const onReconnect = () => { void runCatchup(); };
    socket.on("connect", onReconnect);
    return () => {
      cancelled = true;
      socket.off("connect", onReconnect);
    };
  }, [activeThread?._id]);

  // ── Send message ───────────────────────────────────────────────────────────
  // Single send path used by text, media (after upload), and voice notes.
  // Optimistically appends a temp bubble, fires the API call, then reconciles
  // by `clientMessageId` so a racy socket echo doesn't duplicate the bubble.
  const sendComposedMessage = useCallback(async (opts: {
    text: string;
    attachments?: ChatAttachment[];
    replyToId?: string;
    replyToMessage?: ChatMessage;
    optimisticAttachments?: ChatAttachment[]; // shown in temp bubble before server echo
  }) => {
    const convId = conversation?._id ?? params.conversationId;
    if (!activeThread || !convId) return;
    const text       = opts.text.trim();
    const attachments = opts.attachments ?? [];

    if (!text && attachments.length === 0) return;
    if (activeThread.status !== "active") return;

    setSending(true);

    const clientMessageId = generateClientMessageId();
    const tempId  = `temp-${clientMessageId}`;
    const tempMsg: ChatMessage = {
      _id: tempId,
      conversation: convId,
      productThread: activeThread._id,
      sender: user?.id ?? "",
      content: text,
      attachments: opts.optimisticAttachments ?? attachments,
      messageType: attachments[0]?.type?.includes("audio") ? "audio"
        : attachments[0]?.type?.includes("video") ? "video"
        : attachments[0]?.type?.includes("image") ? "image"
        : attachments.length > 0 ? "document"
        : "text",
      status: "sending",
      clientMessageId,
      createdAt: new Date().toISOString(),
      ...(opts.replyToMessage ? { replyTo: opts.replyToMessage } : {}),
    };
    setMessages((prev) => sortChron([...prev, tempMsg]));
    scrollToBottom(true, true);

    try {
      const res = await sendMessageApi(convId, {
        content:  text,
        threadId: activeThread._id,
        clientMessageId,
        ...(opts.replyToId ? { replyTo: opts.replyToId } : {}),
        ...(attachments.length > 0 ? { attachments } : {}),
      });

      setMessages((prev) => {
        const i = prev.findIndex(
          (m) => m._id === tempId || (m.clientMessageId && m.clientMessageId === res.message.clientMessageId),
        );
        if (i < 0) return sortChron([...prev, res.message]);
        const next = [...prev];
        next[i] = { ...prev[i], ...res.message };
        return sortChron(next);
      });
      isNearBottomRef.current = true;
      scrollToBottom(true, true);
    } catch (e) {
      setMessages((prev) => prev.filter((m) => m._id !== tempId));
      showErrorToast(
        "Message Failed",
        e instanceof Error ? e.message : "Could not send your message.",
      );
      throw e;
    } finally {
      setSending(false);
    }
  }, [activeThread, conversation, params.conversationId, scrollToBottom, user]);

  const handleSend = useCallback(async () => {
    if (!canSend || !activeThread || sending) return;
    const text = messageText.trim();
    const pendingReply = replyTo;
    setReplyTo(null);
    setMessageText("");
    try {
      await sendComposedMessage({
        text,
        replyToId: pendingReply?._id,
        replyToMessage: pendingReply ?? undefined,
      });
    } catch {
      setMessageText(text);
      setReplyTo(pendingReply);
    }
  }, [canSend, activeThread, messageText, replyTo, sendComposedMessage, sending]);

  // ── Attachment / voice / emoji / actions handlers ──────────────────────────
  const handleAttachmentsPicked = useCallback(async (locals: LocalAttachment[]) => {
    const convId = conversation?._id ?? params.conversationId;
    if (!convId || !activeThread || locals.length === 0) return;

    const pendingReply = replyTo;
    setReplyTo(null);

    for (const local of locals) {
      const clientMessageId = generateClientMessageId();
      const tempId = `temp-${clientMessageId}`;
      const attType = inferAttachmentKind(local.mimeType);
      const optimisticAtt: ChatAttachment = {
        name:     local.name,
        url:      local.uri,
        key:      "",
        mimeType: local.mimeType,
        size:     local.size ?? 0,
        type:     attType,
      };

      const tempMsg: ChatMessage = {
        _id:           tempId,
        conversation:  convId,
        productThread: activeThread._id,
        sender:        user?.id ?? "",
        content:       "",
        attachments:   [optimisticAtt],
        messageType:   inferMessageType(attType),
        status:        "sending",
        clientMessageId,
        createdAt:     new Date().toISOString(),
        ...(pendingReply ? { replyTo: pendingReply._id } : {}),
      };

      setMessages((prev) => sortChron([...prev, tempMsg]));
      scrollToBottom(true, true);

      try {
        const uploaded = await uploadChatAttachment(convId, {
          uri:      local.uri,
          name:     local.name,
          mimeType: local.mimeType,
          size:     local.size,
        });
        const res = await sendMessageApi(convId, {
          content: "",
          threadId: activeThread._id,
          clientMessageId,
          attachments: [uploaded],
          ...(pendingReply ? { replyTo: pendingReply._id } : {}),
        });
        setMessages((prev) => {
          const i = prev.findIndex(
            (m) => m._id === tempId || (m.clientMessageId && m.clientMessageId === res.message.clientMessageId),
          );
          if (i < 0) return sortChron([...prev, res.message]);
          const next = [...prev];
          next[i] = { ...prev[i], ...res.message };
          return sortChron(next);
        });
      } catch (e) {
        setMessages((prev) => prev.filter((m) => m._id !== tempId));
        showErrorToast(
          "Upload Failed",
          e instanceof Error ? e.message : `Could not send ${local.name}.`,
        );
      }
    }
  }, [activeThread, conversation, params.conversationId, replyTo, scrollToBottom, user?.id]);

  const handleVoiceNote = useCallback(async (note: RecordedVoiceNote) => {
    const convId = conversation?._id ?? params.conversationId;
    if (!convId || !activeThread) return;

    const pendingReply = replyTo;
    setReplyTo(null);

    const clientMessageId = generateClientMessageId();
    const tempId = `temp-${clientMessageId}`;
    const optimisticAtt: ChatAttachment = {
      name:     note.name,
      url:      note.uri,
      key:      "",
      mimeType: note.mimeType,
      size:     note.size ?? 0,
      type:     "audio",
    };

    const tempMsg: ChatMessage = {
      _id:           tempId,
      conversation:  convId,
      productThread: activeThread._id,
      sender:        user?.id ?? "",
      content:       "",
      attachments:   [optimisticAtt],
      messageType:   "audio",
      status:        "sending",
      clientMessageId,
      createdAt:     new Date().toISOString(),
      ...(pendingReply ? { replyTo: pendingReply._id } : {}),
    };

    setMessages((prev) => sortChron([...prev, tempMsg]));
    scrollToBottom(true, true);

    try {
      const uploaded = await uploadChatAttachment(convId, {
        uri:      note.uri,
        name:     note.name,
        mimeType: note.mimeType,
        size:     note.size,
      });
      const res = await sendMessageApi(convId, {
        content: "",
        threadId: activeThread._id,
        clientMessageId,
        attachments: [{ ...uploaded, type: "audio" }],
        ...(pendingReply ? { replyTo: pendingReply._id } : {}),
      });
      setMessages((prev) => {
        const i = prev.findIndex(
          (m) => m._id === tempId || (m.clientMessageId && m.clientMessageId === res.message.clientMessageId),
        );
        if (i < 0) return sortChron([...prev, res.message]);
        const next = [...prev];
        next[i] = { ...prev[i], ...res.message };
        return sortChron(next);
      });
    } catch (e) {
      setMessages((prev) => prev.filter((m) => m._id !== tempId));
      showErrorToast(
        "Voice Message Failed",
        e instanceof Error ? e.message : "Could not send voice message.",
      );
    }
  }, [activeThread, conversation, params.conversationId, replyTo, scrollToBottom, user?.id]);

  const handleEmojiPick = useCallback((emoji: string) => {
    setMessageText((prev) => prev + emoji);
  }, []);

  const handleOpenMedia = useCallback((attachment: ChatAttachment, kind: "image" | "video") => {
    const uri = resolveAbsoluteMediaUrl(attachment.url) || attachment.url;
    if (!uri) return;
    setMediaPreview({ uri: typeof uri === "string" ? uri : String(uri), kind });
  }, []);

  // Single voice-recording lifecycle. The hook owns the recorder + PanResponder;
  // we just consume its state to swap composer UI while keeping the mic
  // mounted (so the active gesture isn't lost when the recording bar appears).
  const voice = useVoiceRecording({
    onSend: handleVoiceNote,
    disabled: activeThread?.status !== "active",
  });

  // Hold-to-show actions on a chat bubble.
  const handleLongPressMessage = useCallback((msg: ChatMessage) => {
    if (msg.deletedForEveryone) return;
    if (msg.messageType === "system") return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Keyboard.dismiss();
    setEmojiSheet(false);
    requestAnimationFrame(() => setActionTarget(msg));
  }, []);

  const handleDeleteForMeAction = useCallback(async (msg: ChatMessage) => {
    const convId = conversation?._id ?? params.conversationId;
    if (!convId) return;
    // Optimistic remove; rollback on failure.
    setMessages((prev) => prev.filter((m) => m._id !== msg._id));
    if (activeThread?._id) {
      dispatch(messageDeletedForMe({ threadId: activeThread._id, messageId: msg._id }));
    }
    try {
      await deleteMessageForMeApi(convId, msg._id);
    } catch (e) {
      setMessages((prev) => sortChron([...prev, msg]));
      showErrorToast("Delete Failed", e instanceof Error ? e.message : "Could not delete the message.");
    }
  }, [activeThread, conversation, params.conversationId, dispatch]);

  const handleDeleteForEveryoneAction = useCallback(async (msg: ChatMessage) => {
    const convId = conversation?._id ?? params.conversationId;
    if (!convId) return;

    const previousState = msg;
    // Optimistic tombstone.
    setMessages((prev) => prev.map((m) => (
      m._id === msg._id
        ? { ...m, deletedForEveryone: true, content: "", attachments: [], messageType: "text" }
        : m
    )));
    if (activeThread?._id) {
      dispatch(messageDeletedForEveryone({ threadId: activeThread._id, messageId: msg._id }));
    }
    try {
      await deleteMessageForEveryoneApi(convId, msg._id);
    } catch (e) {
      // Roll back — restore the original message.
      setMessages((prev) => prev.map((m) => (m._id === msg._id ? previousState : m)));
      showErrorToast(
        "Delete Failed",
        e instanceof Error ? e.message : "Could not delete for everyone (older than 2 hours?).",
      );
    }
  }, [activeThread, conversation, params.conversationId, dispatch]);

  const handleActionSelect = useCallback(async (action: MessageAction) => {
    const msg = actionTarget;
    setActionTarget(null);
    if (!msg) return;

    if (action === "reply") {
      setReplyTo(msg);
      // Focus the input so the keyboard pops up — matches WhatsApp.
      setTimeout(() => inputRef.current?.focus(), 50);
      return;
    }
    if (action === "copy") {
      const ok = await copyToClipboard(msg.content || "");
      if (!ok) {
        showErrorToast("Copy unavailable", "Clipboard module isn't ready. Try restarting the app.");
      }
      return;
    }
    if (action === "deleteForMe") {
      Alert.alert(
        "Delete message?",
        "This message will be removed from your device.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: () => void handleDeleteForMeAction(msg) },
        ],
      );
      return;
    }
    if (action === "deleteForEveryone") {
      Alert.alert(
        "Delete for everyone?",
        "This message will be removed for everyone in the chat.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Delete for everyone", style: "destructive", onPress: () => void handleDeleteForEveryoneAction(msg) },
        ],
      );
      return;
    }
  }, [actionTarget, handleDeleteForMeAction, handleDeleteForEveryoneAction]);

  // Jump-to-message when the user taps a reply snippet inside a bubble.
  // The FlatList's scrollToIndex can throw if the target row hasn't been
  // measured yet (because it's outside the viewport); we catch that path with
  // `onScrollToIndexFailed`, scroll roughly to its offset, then re-try.
  const handleReplyJump = useCallback((targetId: string) => {
    const idx = messages.findIndex((m) => m._id === targetId);
    if (idx < 0) return;

    try {
      flatRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.3 });
    } catch {
      flatRef.current?.scrollToOffset({ offset: Math.max(0, idx * 80), animated: true });
    }

    // Brief highlight — pulse the matching bubble for ~1.5s.
    setHighlightedId(targetId);
    if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
    highlightTimeoutRef.current = setTimeout(() => setHighlightedId(null), 1500);
  }, [messages]);

  useEffect(() => () => {
    if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
  }, []);

  // ── Typing ─────────────────────────────────────────────────────────────────
  const handleTextChange = useCallback((t: string) => {
    setMessageText(t);
    if (!conversation || !activeThread) return;
    emitTypingStart(conversation._id);
    if (typingRef.current) clearTimeout(typingRef.current);
    typingRef.current = setTimeout(() => {
      emitTypingStop(conversation._id);
    }, 2000);
  }, [conversation, activeThread]);

  // ── Offer actions ──────────────────────────────────────────────────────────
  const handleMakeOffer = useCallback(async () => {
    if (!activeThread || !conversation) return;
    const amount = parseFloat(offerInput.replace(/[^\d.]/g, ""));
    const listedPrice = parseListedPrice(activeThread.product?.price);
    const validation = validateOfferAmount(amount, listedPrice);
    if (!validation.valid) {
      setOfferError(validation.error);
      return;
    }
    setOfferError("");
    setOfferModal(false);
    try {
      const res = await makeOffer(activeThread._id, amount);
      setMessages((prev) => sortChron([...prev, res.message]));
      setActiveThreadSt(res.thread);
      scrollToBottom(true, true);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to make offer");
    }
  }, [activeThread, conversation, offerInput, scrollToBottom]);

  const handleAcceptOffer = useCallback(async (threadId: string) => {
    try {
      const res = await acceptOffer(threadId);
      setMessages((prev) => {
        const updated = prev.map((m) => (
          m.messageType === "offer" && m.offerData?.status === "pending"
            ? { ...m, offerData: { ...m.offerData!, status: "accepted" as const } }
            : m
        ));
        return sortChron([...updated, res.message]);
      });
      setActiveThreadSt(res.thread);
      setThreads((prev) => prev.map((t) => t._id === threadId ? res.thread : t));
      scrollToBottom(true, true);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to accept offer");
    }
  }, [scrollToBottom]);

  const handleDeclineOffer = useCallback(async (threadId: string) => {
    try {
      const res = await declineOffer(threadId);
      setMessages((prev) => {
        const updated = prev.map((m) => (
          m.messageType === "offer" && m.offerData?.status === "pending"
            ? { ...m, offerData: { ...m.offerData!, status: "declined" as const } }
            : m
        ));
        return sortChron([...updated, res.message]);
      });
      setActiveThreadSt(res.thread);
      setThreads((prev) => prev.map((t) => t._id === threadId ? res.thread : t));
      scrollToBottom(true, true);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to decline offer");
    }
  }, [scrollToBottom]);

  // ── Render message item ────────────────────────────────────────────────────
  const renderMessage = useCallback(({ item: msg, index }: { item: ChatMessage; index: number }) => {
    const fromMe = isFromMe(msg, user?.id);
    const showDate =
      index === 0 ||
      formatDateHeader(messages[index - 1]?.createdAt ?? "") !== formatDateHeader(msg.createdAt);

    if (msg.messageType === "system") {
      return (
        <>
          {showDate && (
            <View style={{ alignItems: "center", marginVertical: 8 }}>
              <Text style={{ fontFamily: ListifyFonts.regular, fontSize: 11, color: TEXT_MUTED, backgroundColor: "#E5E7EB", paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 }}>
                {formatDateHeader(msg.createdAt)}
              </Text>
            </View>
          )}
          <View style={{ alignItems: "center", marginVertical: 6 }}>
            <View style={{ backgroundColor: SYSTEM_BG, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 6 }}>
              <Text style={{ fontFamily: ListifyFonts.regular, fontSize: 12, color: "#6B7280", textAlign: "center" }}>
                {msg.content}
              </Text>
            </View>
          </View>
        </>
      );
    }

    if (msg.messageType === "offer" && activeThread) {
      return (
        <>
          {showDate && (
            <View style={{ alignItems: "center", marginVertical: 8 }}>
              <Text style={{ fontFamily: ListifyFonts.regular, fontSize: 11, color: TEXT_MUTED, backgroundColor: "#E5E7EB", paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 }}>
                {formatDateHeader(msg.createdAt)}
              </Text>
            </View>
          )}
          <View style={{ alignItems: fromMe ? "flex-end" : "flex-start", marginHorizontal: 12, marginVertical: 4 }}>
            <Pressable
              onLongPress={() => handleLongPressMessage(msg)}
              delayLongPress={250}
            >
              <OfferCard
                message={msg}
                thread={activeThread}
                isSeller={isSeller}
                fromMe={fromMe}
                onAccept={() => handleAcceptOffer(activeThread._id)}
                onDecline={() => handleDeclineOffer(activeThread._id)}
              />
            </Pressable>
            <Text style={{ fontFamily: ListifyFonts.regular, fontSize: 10, color: TEXT_MUTED, marginTop: 2 }}>
              {formatTime(msg.createdAt)}
            </Text>
          </View>
        </>
      );
    }

    const hasAttachments = !msg.deletedForEveryone && Array.isArray(msg.attachments) && msg.attachments.length > 0;
    const hasReplyTo     = !msg.deletedForEveryone && !!msg.replyTo && typeof msg.replyTo === "object";

    return (
      <>
        {showDate && (
          <View style={{ alignItems: "center", marginVertical: 8 }}>
            <Text style={{ fontFamily: ListifyFonts.regular, fontSize: 11, color: TEXT_MUTED, backgroundColor: "#E5E7EB", paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 }}>
              {formatDateHeader(msg.createdAt)}
            </Text>
          </View>
        )}
        <View
          style={{
            alignItems: fromMe ? "flex-end" : "flex-start",
            marginHorizontal: 12,
            marginVertical: 2,
          }}
        >
          <Pressable
            onLongPress={() => handleLongPressMessage(msg)}
            delayLongPress={250}
            style={{
              backgroundColor: fromMe ? BRAND : INCOMING_BG,
              borderRadius: 16,
              borderBottomRightRadius: fromMe ? 4 : 16,
              borderBottomLeftRadius:  fromMe ? 16 : 4,
              paddingHorizontal: 10,
              paddingVertical:    8,
              maxWidth: "78%",
              borderWidth: highlightedId === msg._id ? 2 : 0,
              borderColor: highlightedId === msg._id ? "#F59E0B" : "transparent",
            }}
          >
            {hasReplyTo && (
              <RepliedMessagePreview
                replyTo={msg.replyTo as NonNullable<ChatMessage["replyTo"]>}
                currentUserId={user?.id}
                fromMe={fromMe}
                onPress={() => {
                  const r = msg.replyTo;
                  if (r && typeof r === "object" && r._id) handleReplyJump(r._id);
                }}
                onLongPress={() => handleLongPressMessage(msg)}
              />
            )}

            {hasAttachments && (
              <View style={{ marginBottom: msg.content ? 6 : 0 }}>
                <MessageAttachmentView
                  attachments={msg.attachments as ChatAttachment[]}
                  fromMe={fromMe}
                  isPending={msg.status === "sending"}
                  onOpenMedia={handleOpenMedia}
                  onLongPress={() => handleLongPressMessage(msg)}
                />
              </View>
            )}

            {(!!msg.content || msg.deletedForEveryone) && (
              <Text style={{ fontFamily: ListifyFonts.regular, fontSize: 14, color: fromMe ? "#fff" : TEXT_DARK, lineHeight: 20, paddingHorizontal: 2 }}>
                {msg.deletedForEveryone ? (
                  <Text style={{ fontStyle: "italic", color: fromMe ? "rgba(255,255,255,0.7)" : TEXT_MUTED }}>
                    🚫 This message was deleted
                  </Text>
                ) : msg.content}
              </Text>
            )}
          </Pressable>
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 2, gap: 4 }}>
            <Text style={{ fontFamily: ListifyFonts.regular, fontSize: 10, color: TEXT_MUTED }}>
              {formatTime(msg.createdAt)}
            </Text>
            {fromMe && <MessageStatusTick status={msg.status} />}
          </View>
        </View>
      </>
    );
  }, [messages, user, activeThread, isSeller, handleAcceptOffer, handleDeclineOffer, handleLongPressMessage, handleReplyJump, handleOpenMedia, highlightedId]);

  const isClosed = activeThread?.status !== "active";

  // ── Contact name ───────────────────────────────────────────────────────────
  const contactName = useMemo(() => {
    if (typeof params.name === "string" && params.name.trim()) return params.name;
    const other = findOtherParticipant(conversation?.participants, user?.id);
    return other?.name ?? "Chat";
  }, [params.name, conversation?.participants, user?.id]);

  const contactUserId = useMemo(() => {
    const other = findOtherParticipant(conversation?.participants, user?.id);
    if (other) return participantId(other);
    if (params.recipientId) return params.recipientId;
    if (params.sellerId) return params.sellerId;
    return null;
  }, [conversation?.participants, params.recipientId, params.sellerId, user?.id]);

  const contactProfileImage = useMemo(() => {
    if (params.contactImage) return params.contactImage;

    const other = findOtherParticipant(conversation?.participants, user?.id);
    const fromConversation = profileImageFromParticipant(other);
    if (fromConversation) return fromConversation;

    if (activeThread && user?.id) {
      const sellerId = participantId(activeThread.seller);
      const buyerId = participantId(activeThread.buyer);
      const otherParticipant =
        String(user.id) === sellerId ? activeThread.buyer : activeThread.seller;
      const fromThread = profileImageFromParticipant(otherParticipant);
      if (fromThread) return fromThread;
    }

    return null;
  }, [activeThread, conversation?.participants, params.contactImage, user?.id]);

  const contactAvatarUri = useMemo(
    () => resolveAbsoluteMediaUrl(contactProfileImage),
    [contactProfileImage],
  );

  const navigateToSellerProfile = useCallback(() => {
    if (!contactUserId) {
      showErrorToast("Profile unavailable", "Could not open this seller's profile.");
      return;
    }
    router.push({
      pathname: "/seller-public-profile",
      params: {
        sellerId: contactUserId,
        sellerName: contactName,
        ...(contactProfileImage ? { sellerImage: contactProfileImage } : {}),
      },
    } as Href);
  }, [contactName, contactProfileImage, contactUserId, router]);

  const navigateToListingDetail = useCallback((thread: ProductThread) => {
    const productId = thread.product?.productId;
    const productType = thread.product?.productType;
    if (!productId || !productType) {
      showErrorToast("Listing unavailable", "Product details are missing for this thread.");
      return;
    }
    const href = getListingDetailHref(productType, productId);
    if (!href) {
      showErrorToast("Listing unavailable", "Could not open this listing.");
      return;
    }
    router.push(href);
  }, [router]);

  // Screen-first: only show the legacy full-screen spinner when we have
  // literally nothing to render yet (no route params for the header AND no
  // conversation loaded). In every other case the shell renders immediately —
  // header from params, composer disabled while activeThread resolves,
  // messages list showing a small in-place indicator if still empty.
  const hasShellSeed = Boolean(
    conversation ||
      activeThread ||
      params.productTitle ||
      params.name ||
      params.recipientId,
  );
  if (loading && !hasShellSeed) {
    return (
      <View style={{ flex: 1, backgroundColor: CHAT_BG, alignItems: "center", justifyContent: "center", paddingTop: insets.top }}>
        <ActivityIndicator color={BRAND} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: CHAT_BG }}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View
        style={{
          paddingTop: insets.top + 8,
          paddingBottom: 10,
          paddingHorizontal: 16,
          backgroundColor: BAR_BG,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          borderBottomWidth: 1,
          borderBottomColor: "#E5E7EB",
        }}
      >
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <MaterialIcons name="arrow-back" size={24} color={TEXT_DARK} />
        </Pressable>
        <Pressable
          onPress={navigateToSellerProfile}
          hitSlop={8}
          style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}
        >
          <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: BRAND + "22", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
            {contactAvatarUri ? (
              <Image
                source={contactAvatarUri}
                contentFit="cover"
                style={{ width: 38, height: 38 }}
              />
            ) : (
              <Text style={{ fontFamily: ListifyFonts.semiBold, fontSize: 16, color: BRAND }}>
                {contactName.charAt(0).toUpperCase()}
              </Text>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: ListifyFonts.semiBold, fontSize: 15, color: TEXT_DARK }} numberOfLines={1}>{contactName}</Text>
            {isTyping && typingUser && (
              <Text style={{ fontFamily: ListifyFonts.regular, fontSize: 11, color: BRAND }}>typing…</Text>
            )}
          </View>
        </Pressable>
        <Pressable
          onPress={() => {
            if (!conversation) return;
            const other = conversation.participants.find((p) => p.id !== user?.id);
            if (other) dispatch(outgoingCallStarted({ remoteUserId: other.id, remoteUserName: other.name, callType: "audio" }));
          }}
          hitSlop={10}
          style={{ padding: 6 }}
        >
          <MaterialIcons name="call" size={22} color={BRAND} />
        </Pressable>
      </View>

      {/* ── Thread tabs ────────────────────────────────────────────────────── */}
      {threads.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ maxHeight: 44, backgroundColor: BAR_BG, borderBottomWidth: 1, borderBottomColor: "#E5E7EB" }}
          contentContainerStyle={{ paddingHorizontal: 12, alignItems: "center", gap: 8 }}
        >
          {threads.map((t) => {
            const isActive = t._id === activeThread?._id;
            const isSold   = t.status !== "active";
            return (
              <Pressable
                key={t._id}
                onPress={() => openThread(t, conversation?._id)}
                onLongPress={() => navigateToListingDetail(t)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical:   6,
                  borderRadius:      20,
                  backgroundColor:   isActive ? BRAND : "#F3F4F6",
                  borderWidth:       1,
                  borderColor:       isActive ? BRAND : "#E5E7EB",
                  flexDirection:     "row",
                  alignItems:        "center",
                  gap:               4,
                }}
              >
                {isSold && <Text style={{ fontSize: 10 }}>🔒</Text>}
                <Text
                  style={{
                    fontFamily: ListifyFonts.semiBold,
                    fontSize:   12,
                    color:      isActive ? "#fff" : isSold ? "#9CA3AF" : TEXT_DARK,
                  }}
                  numberOfLines={1}
                >
                  {t.product?.title?.slice(0, 18) ?? "Product"}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {/* ── Thread section banner ───────────────────────────────────────────── */}
      {activeThread && (
        <ProductThreadSection
          thread={activeThread}
          currentUserId={user?.id}
          onPress={() => navigateToListingDetail(activeThread)}
        />
      )}

      {/* ── Messages + composer (keyboard inset lifts whole column) ─────────── */}
      <View style={{ flex: 1, marginBottom: keyboardInset }}>
        <FlatList
          ref={flatRef}
          style={{ flex: 1 }}
          data={messages}
          keyExtractor={(m) => m._id}
          renderItem={renderMessage}
          maintainVisibleContentPosition={{ minIndexForVisible: 0, autoscrollToTopThreshold: 48 }}
          contentContainerStyle={{ paddingVertical: 12, paddingBottom: 8 }}
          onContentSizeChange={handleListContentSizeChange}
          onScroll={handleListScroll}
          scrollEventThrottle={100}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="none"
          onScrollToIndexFailed={(info) => {
            const offset = Math.max(0, info.averageItemLength * info.index);
            flatRef.current?.scrollToOffset({ offset, animated: false });
            setTimeout(() => {
              try {
                flatRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0.3 });
              } catch {
                // Give up silently — the user still got close enough.
              }
            }, 80);
          }}
          ListEmptyComponent={
            <View style={{ alignItems: "center", paddingTop: 40 }}>
              <Text style={{ fontFamily: ListifyFonts.regular, fontSize: 14, color: TEXT_MUTED }}>
                {activeThread ? "Send the first message!" : "Select a product thread above"}
              </Text>
            </View>
          }
          ListFooterComponent={
            isTyping ? (
              <View style={{ alignItems: "flex-start", marginHorizontal: 12, marginBottom: 6 }}>
                <View style={{ backgroundColor: INCOMING_BG, borderRadius: 16, borderBottomLeftRadius: 4, paddingHorizontal: 14, paddingVertical: 8 }}>
                  <Text style={{ fontFamily: ListifyFonts.regular, fontSize: 14, color: TEXT_MUTED, letterSpacing: 4 }}>•••</Text>
                </View>
              </View>
            ) : null
          }
        />

        {isClosed && (
          <View style={{ backgroundColor: "#FEF2F2", paddingVertical: 10, paddingHorizontal: 16, alignItems: "center" }}>
            <Text style={{ fontFamily: ListifyFonts.semiBold, fontSize: 13, color: "#EF4444" }}>
              🔒 Conversation Closed
              {activeThread?.closedReason === "sold"
                ? " — Product Sold"
                : activeThread?.closedReason === "deleted"
                  ? " — Listing Removed"
                  : ""}
            </Text>
            <Text style={{ fontFamily: ListifyFonts.regular, fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>
              Message history is preserved
            </Text>
          </View>
        )}

        {!isClosed && (
          <View
            style={{
              backgroundColor: BAR_BG,
              borderTopWidth: replyTo ? 0 : 1,
              borderTopColor: "#E5E7EB",
            }}
          >
            {replyTo && (
              <ReplyPreviewBar
                message={replyTo}
                currentUserId={user?.id}
                onCancel={() => setReplyTo(null)}
              />
            )}

            {emojiSheet && (
              <EmojiPickerPanel
                onClose={() => setEmojiSheet(false)}
                onPick={handleEmojiPick}
              />
            )}

            <View
              style={{
                flexDirection:    "row",
                alignItems:       "flex-end",
                paddingHorizontal: 8,
                paddingTop:        8,
                paddingBottom:     composerSafePad,
                gap:              6,
              }}
            >
              {voice.isActive ? (
                <VoiceRecordingPanel voice={voice} />
              ) : (
                <>
              {/* Offer button (buyer only) */}
              {!isSeller && activeThread?.status === "active" && activeThread.offerStatus === "none" && (
                <Pressable
                  onPress={() => setOfferModal(true)}
                  style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: BRAND + "15", alignItems: "center", justifyContent: "center" }}
                >
                  <Text style={{ fontSize: 18 }}>💰</Text>
                </Pressable>
              )}

              <View
                style={{
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "flex-end",
                  minHeight: 40,
                  backgroundColor: "#F3F4F6",
                  borderRadius: 24,
                  paddingHorizontal: 6,
                  paddingVertical: 2,
                  gap: 2,
                }}
              >
                  <Pressable
                    onPress={() => {
                      Keyboard.dismiss();
                      setEmojiSheet((open) => !open);
                    }}
                    hitSlop={8}
                    style={{ width: 34, height: 34, alignItems: "center", justifyContent: "center" }}
                  >
                    <MaterialIcons name="emoji-emotions" size={22} color={emojiSheet ? BRAND : TEXT_MUTED} />
                  </Pressable>

                  <TextInput
                    ref={inputRef}
                    nativeID="chat-composer-input"
                    style={{
                      flex: 1,
                      minHeight: 38,
                      maxHeight: 120,
                      paddingHorizontal: 4,
                      paddingVertical: 10,
                      fontFamily: ListifyFonts.regular,
                      fontSize: 14,
                      color: TEXT_DARK,
                    }}
                    placeholder="Message"
                    placeholderTextColor={TEXT_MUTED}
                    value={messageText}
                    onChangeText={handleTextChange}
                    onFocus={() => {
                      setEmojiSheet(false);
                      isNearBottomRef.current = true;
                      scrollToBottom(true, true);
                    }}
                    onContentSizeChange={() => {
                      if (isNearBottomRef.current) scrollToBottom(true, true);
                    }}
                    multiline
                    blurOnSubmit={false}
                    returnKeyType="default"
                  />

                  <Pressable
                    onPress={() => setAttachmentSheet(true)}
                    hitSlop={8}
                    style={{ width: 34, height: 34, alignItems: "center", justifyContent: "center" }}
                  >
                    <MaterialIcons name="attach-file" size={22} color={TEXT_MUTED} />
                  </Pressable>

                  {!messageText.trim() && (
                    <Pressable
                      onPress={() => setAttachmentSheet(true)}
                      onLongPress={() => setAttachmentSheet(true)}
                      hitSlop={8}
                      style={{ width: 34, height: 34, alignItems: "center", justifyContent: "center" }}
                    >
                      <MaterialIcons name="photo-camera" size={22} color={TEXT_MUTED} />
                    </Pressable>
                  )}
              </View>

              {(messageText.trim() || sending) ? (
                <Pressable
                  onPress={handleSend}
                  disabled={!canSend || sending}
                  style={{
                    width: 44, height: 44, borderRadius: 22,
                    backgroundColor: (canSend || sending) ? BRAND : "#E5E7EB",
                    alignItems: "center", justifyContent: "center",
                  }}
                >
                  {sending
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <MaterialIcons name="send" size={20} color={(canSend || sending) ? "#fff" : "#9CA3AF"} />
                  }
                </Pressable>
              ) : (
                <VoiceMicButton voice={voice} />
              )}
                </>
              )}
            </View>
          </View>
        )}
      </View>

      {/* ── Attachment / emoji / actions sheets ─────────────────────────────── */}
      <AttachmentPickerSheet
        visible={attachmentSheet}
        onClose={() => setAttachmentSheet(false)}
        onPicked={handleAttachmentsPicked}
      />
      <MessageActionsSheet
        visible={!!actionTarget}
        message={actionTarget}
        currentUserId={user?.id}
        onClose={() => setActionTarget(null)}
        onSelect={handleActionSelect}
      />

      {/* ── Offer modal ──────────────────────────────────────────────────────── */}
      <Modal visible={offerModal} transparent animationType="slide" onRequestClose={() => setOfferModal(false)}>
        <View style={{ flex: 1 }}>
          <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)" }} onPress={() => setOfferModal(false)} />
          <View style={{ paddingBottom: Math.max(insets.bottom, 16) + keyboardInset }}>
            <View style={{ backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 }}>
              <Text style={{ fontFamily: ListifyFonts.bold, fontSize: 18, color: TEXT_DARK, marginBottom: 4 }}>Make an Offer</Text>
              {activeThread?.product?.title && (
                <Text style={{ fontFamily: ListifyFonts.regular, fontSize: 13, color: TEXT_MUTED, marginBottom: 16 }}>
                  for {activeThread.product.title}
                  {activeThread.product.price != null
                    ? ` (Listed: ${activeThread.product.currency}${activeThread.product.price.toLocaleString("en-IN")})`
                    : ""}
                </Text>
              )}
              <TextInput
                style={{
                  borderWidth:       1,
                  borderColor:       offerError ? "#DC2626" : "#D1D5DB",
                  borderRadius:      12,
                  paddingHorizontal: 16,
                  paddingVertical:   12,
                  fontFamily:        ListifyFonts.semiBold,
                  fontSize:          18,
                  color:             TEXT_DARK,
                  marginBottom:      8,
                }}
                placeholder={`₹ Your offer amount`}
                placeholderTextColor={TEXT_MUTED}
                keyboardType="numeric"
                value={offerInput}
                onChangeText={(val) => {
                  setOfferInput(val);
                  setOfferError("");
                }}
                autoFocus
              />
              {offerError ? (
                <Text style={{ fontFamily: ListifyFonts.medium, fontSize: 13, color: "#DC2626", marginBottom: 12 }}>
                  {offerError}
                </Text>
              ) : null}
              <Pressable
                onPress={handleMakeOffer}
                style={({ pressed }) => ({
                  backgroundColor: pressed ? "#059669" : BRAND,
                  borderRadius:    12,
                  paddingVertical: 14,
                  alignItems:      "center",
                  marginTop:       offerError ? 0 : 8,
                })}
              >
                <Text style={{ fontFamily: ListifyFonts.bold, fontSize: 16, color: "#fff" }}>Send Offer</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!mediaPreview}
        transparent
        animationType="fade"
        onRequestClose={() => setMediaPreview(null)}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.95)" }}>
          <Pressable
            onPress={() => setMediaPreview(null)}
            style={{ position: "absolute", top: insets.top + 8, right: 16, zIndex: 2, padding: 8 }}
            hitSlop={12}
          >
            <MaterialIcons name="close" size={28} color="#fff" />
          </Pressable>
          <Pressable
            style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 16 }}
            onPress={() => setMediaPreview(null)}
          >
            {mediaPreview?.kind === "image" ? (
              <Image
                source={mediaPreview.uri}
                contentFit="contain"
                style={{ width: "100%", height: "100%" }}
              />
            ) : (
              <Text style={{ fontFamily: ListifyFonts.regular, fontSize: 14, color: "#fff" }}>
                Video preview coming soon
              </Text>
            )}
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

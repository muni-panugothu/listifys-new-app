import { io, type Socket } from "socket.io-client";

import {
  AUTH_API_BASE_URL,
  getAuthApiBaseUrl,
  getAccessToken,
  refreshAccessToken,
  restoreTokens,
} from "@/features/auth/services/auth-api";

let socket: Socket | null = null;
let connectPromise: Promise<Socket> | null = null;
const joinedConversationIds = new Set<string>();
const joinedThreadIds = new Set<string>();
const joinedEventIds = new Set<string>();

export function getSocket(): Socket | null {
  return socket;
}

function rejoinActiveRooms() {
  if (!socket?.connected) return;
  for (const conversationId of joinedConversationIds) {
    socket.emit("conversation:join", conversationId);
  }
  for (const threadId of joinedThreadIds) {
    socket.emit("thread:join", threadId);
  }
  for (const eventId of joinedEventIds) {
    socket.emit("event:join", eventId);
  }
}

async function waitForSocketConnection(instance: Socket) {
  if (instance.connected) return instance;

  return new Promise<Socket>((resolve, reject) => {
    const onConnect = () => {
      cleanup();
      resolve(instance);
    };

    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };

    const cleanup = () => {
      instance.off("connect", onConnect);
      instance.off("connect_error", onError);
    };

    instance.once("connect", onConnect);
    instance.once("connect_error", onError);
    setTimeout(() => {
      cleanup();
      reject(new Error("Socket connection timed out"));
    }, 20000);
  });
}

export async function connectSocket(): Promise<Socket> {
  if (socket?.connected) return socket;
  if (connectPromise) return connectPromise;

  connectPromise = (async () => {
    if (!getAccessToken()) {
      await restoreTokens();
    }
    let token = getAccessToken();
    if (!token) {
      await refreshAccessToken();
      token = getAccessToken();
    }
    if (!token) {
      throw new Error("No access token available for Socket.IO");
    }

    if (socket) {
      socket.auth = { token };
      if (!socket.connected) {
        socket.connect();
      }
      return await waitForSocketConnection(socket);
    }

    socket = io(getAuthApiBaseUrl(), {
      auth: { token },
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      timeout: 20000,
    });

    socket.on("connect", () => {
      // eslint-disable-next-line no-console
      console.log("[Socket] Connected:", socket?.id);
      rejoinActiveRooms();
    });

    socket.on("connect_error", (err) => {
      // eslint-disable-next-line no-console
      console.warn("[Socket] Connect error:", err.message);
    });

    socket.on("disconnect", (reason) => {
      // eslint-disable-next-line no-console
      console.log("[Socket] Disconnected:", reason);
    });

    return await waitForSocketConnection(socket);
  })().finally(() => {
    connectPromise = null;
  });

  return connectPromise;
}

export function disconnectSocket() {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
  joinedConversationIds.clear();
  joinedThreadIds.clear();
  // Allow call listeners to be re-attached on next connect.
  import('@/features/calling/services/call-socket-service')
    .then(({ detachCallListeners }) => detachCallListeners())
    .catch(() => {});
}

// ── Conversation room management ──
export function joinConversation(conversationId: string) {
  joinedConversationIds.add(conversationId);
  socket?.emit("conversation:join", conversationId);
}

export function leaveConversation(conversationId: string) {
  joinedConversationIds.delete(conversationId);
  socket?.emit("conversation:leave", conversationId);
}

// ── Product thread room ──
export function joinThread(threadId: string) {
  joinedThreadIds.add(threadId);
  socket?.emit("thread:join", threadId);
}

export function leaveThread(threadId: string) {
  joinedThreadIds.delete(threadId);
  socket?.emit("thread:leave", threadId);
}

// ── Thread-scoped typing indicators ──
export function emitThreadTypingStart(conversationId: string, threadId: string) {
  socket?.emit("thread:typing:start", { conversationId, threadId });
}

export function emitThreadTypingStop(conversationId: string, threadId: string) {
  socket?.emit("thread:typing:stop", { conversationId, threadId });
}

// ── Typing indicators (conversation-level, kept for compat) ──
export function emitTypingStart(conversationId: string) {
  socket?.emit("typing:start", { conversationId });
}

export function emitTypingStop(conversationId: string) {
  socket?.emit("typing:stop", { conversationId });
}

// ── Message delivery ──
// Legacy single-message form. Prefer `emitMessagesDelivered` below — it batches
// receipts on a 250ms window so a thread of 100 messages becomes one round-trip.
export function emitMessageDelivered(messageId: string, conversationId: string) {
  socket?.emit("message:delivered", { messageId, conversationId });
}

// Batched delivery acknowledgment. Coalesces all calls within `DELIVERED_FLUSH_MS`
// per (conversationId, threadId) into a single `message:delivered` emit.
const DELIVERED_FLUSH_MS = 250;

type DeliveredBucket = {
  conversationId: string;
  threadId: string | null;
  ids: Set<string>;
  timer: ReturnType<typeof setTimeout> | null;
};

const deliveredBuckets = new Map<string, DeliveredBucket>();

function flushDeliveredBucket(key: string) {
  const bucket = deliveredBuckets.get(key);
  if (!bucket) return;
  if (bucket.timer) clearTimeout(bucket.timer);
  deliveredBuckets.delete(key);
  if (bucket.ids.size === 0) return;
  socket?.emit("message:delivered", {
    conversationId: bucket.conversationId,
    ...(bucket.threadId ? { threadId: bucket.threadId } : {}),
    messageIds: Array.from(bucket.ids),
  });
}

export function emitMessagesDelivered(
  conversationId: string,
  threadId: string | null,
  messageIds: string[],
) {
  if (!conversationId || messageIds.length === 0) return;
  const key = `${conversationId}::${threadId || ""}`;
  let bucket = deliveredBuckets.get(key);
  if (!bucket) {
    bucket = { conversationId, threadId, ids: new Set(), timer: null };
    deliveredBuckets.set(key, bucket);
  }
  for (const id of messageIds) bucket.ids.add(id);
  if (!bucket.timer) {
    bucket.timer = setTimeout(() => flushDeliveredBucket(key), DELIVERED_FLUSH_MS);
  }
}

// ── Status catch-up ──
// Used after a reconnect or when (re-)opening a thread to back-fill ticks for
// messages the user sent while offline. Returns the canonical status of every
// in-flight message they sent in that thread.
export type StatusCatchupUpdate = {
  messageId: string;
  status: "sent" | "delivered" | "read";
  deliveredAt: string | null;
  readAt: string | null;
};

export type StatusCatchupResponse = {
  ok: boolean;
  threadId?: string;
  conversationId?: string;
  updates?: StatusCatchupUpdate[];
  reason?: string;
};

export function requestStatusCatchup(
  threadId: string,
  sinceMessageId?: string | null,
): Promise<StatusCatchupResponse> {
  return new Promise((resolve) => {
    if (!socket?.connected) {
      resolve({ ok: false, reason: "not_connected" });
      return;
    }
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ ok: false, reason: "timeout" });
    }, 8000);
    socket.emit(
      "message:catchup:request",
      { threadId, ...(sinceMessageId ? { sinceMessageId } : {}) },
      (response: StatusCatchupResponse | undefined) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve(response ?? { ok: false, reason: "no_response" });
      },
    );
  });
}

// ── Message reactions ──
export function emitReact(messageId: string, conversationId: string, emoji: string) {
  socket?.emit("message:react", { messageId, conversationId, emoji });
}

export function emitUnreact(messageId: string, conversationId: string) {
  socket?.emit("message:unreact", { messageId, conversationId });
}

// ── Unread count ──
export function requestUnreadCount() {
  socket?.emit("chat:unreadCount:request");
}

// ── User presence ──
export function requestLastSeen(targetUserId: string) {
  socket?.emit("user:lastSeen", { targetUserId });
}

/** Request the list of currently online user IDs. */
export function requestOnlineUsers(): Promise<string[]> {
  return new Promise((resolve) => {
    if (!socket?.connected) {
      resolve([]);
      return;
    }
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve([]);
    }, 5000);

    const onList = (ids: string[]) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      socket?.off("users:online", onList);
      resolve(Array.isArray(ids) ? ids.map(String) : []);
    };

    socket.on("users:online", onList);
    socket.emit("users:online");
  });
}

export function joinEventRoom(eventId: string) {
  if (!eventId) return;
  joinedEventIds.add(eventId);
  socket?.emit("event:join", eventId);
}

export function leaveEventRoom(eventId: string) {
  if (!eventId) return;
  joinedEventIds.delete(eventId);
  socket?.emit("event:leave", eventId);
}

import { Platform } from "react-native";
import { requestJson, getAuthApiBaseUrl, getAccessToken, refreshAccessToken } from "@/features/auth/services/auth-api";
import { devWarn } from "@/lib/dev-log";

// ── Types ──────────────────────────────────────────────────────────────────────

export type ChatParticipant = {
  id: string;
  _id?: string;
  name: string;
  profileImageUrl?: string | null;
  provider?: string;
};

export type ProductThread = {
  _id: string;
  conversation: string;
  product: {
    productId: string;
    productType: string;
    title: string | null;
    price: number | null;
    image: string | null;
    currency: string;
  };
  seller: ChatParticipant | string;
  buyer: ChatParticipant | string;
  status: "active" | "closed" | "sold" | "expired";
  closedReason?: string | null;
  startedAt: string;
  closedAt?: string | null;
  lastMessageAt: string;
  offerStatus: "none" | "pending" | "accepted" | "declined" | "countered";
  activeOffer?: {
    amount: number | null;
    currency: string;
    offeredBy: string | null;
    offeredAt: string | null;
  };
  unreadCounts?: Record<string, number>;
  messageCount?: number;
  createdAt: string;
  updatedAt: string;
};

export type ChatMessage = {
  _id: string;
  conversation: string;
  productThread: string | null;
  sender: string | ChatParticipant;
  content: string;
  messageType: "text" | "image" | "video" | "audio" | "document" | "offer" | "system";
  offerData?: {
    amount: number | null;
    currency: string;
    status: "pending" | "accepted" | "declined" | "countered" | null;
  } | null;
  attachments?: Array<{
    name: string;
    url: string;
    mimeType: string;
    size: number;
    type: string;
  }>;
  // "sending" is a client-only state — present on optimistic bubbles until the
  // server echoes the message back. Anything coming from the server is always
  // one of "sent" | "delivered" | "read".
  status: "sending" | "sent" | "delivered" | "read";
  deliveredAt?: string | null;
  readAt?: string | null;
  // Client-supplied idempotency key. Set by the app on send; echoed back by the
  // server so the optimistic bubble can be reconciled with the canonical row.
  clientMessageId?: string | null;
  deliveryReceipts?: Array<{ user: string; deliveredAt: string | null; readAt: string | null }>;
  replyTo?: {
    _id: string;
    sender?: ChatParticipant;
    content?: string;
    attachments?: Array<{ name: string; url: string; mimeType: string; size: number; type: string }>;
    createdAt?: string;
  } | string | null;
  reactions?: Array<{ user: string; emoji: string }>;
  deletedFor?: string[];
  deletedForEveryone?: boolean;
  createdAt: string;
  updatedAt?: string;
};

export type Conversation = {
  _id: string;
  participants: ChatParticipant[];
  listing?: {
    listingId?: string | null;
    listingType?: string | null;
    listingTitle?: string | null;
    listingPrice?: number | null;
    listingImage?: string | null;
    currency?: string | null;
  };
  threadCount?: number;
  activeThreadCount?: number;
  lastMessage?: {
    _id: string;
    content: string;
    sender: string;
    attachments?: Array<{ type: string }>;
    productThread?: string | null;
    messageType?: ChatMessage["messageType"];
    status?: ChatMessage["status"];
    createdAt: string;
  } | null;
  unreadCount?: number;
  createdAt: string;
  updatedAt: string;
};

export type MessagesPagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
};

// ── Conversation API ───────────────────────────────────────────────────────────

/** Get or create the conversation for a user pair. Optionally bootstraps a product thread. */
export function getOrCreateConversation(data: {
  recipientId: string;
  sellerId?: string;
  productId?: string;
  productType?: string;
  productTitle?: string;
  productPrice?: number;
  productImage?: string;
  currency?: string;
}) {
  return requestJson<{
    success: boolean;
    conversation: Conversation;
    thread: ProductThread | null;
  }>("/api/chat/conversations", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/** Get all conversations for the current user */
export function getConversations(page = 1, limit = 20) {
  return requestJson<{
    success: boolean;
    conversations: Conversation[];
    pagination: { page: number; limit: number; total: number; totalPages: number; hasMore: boolean };
  }>(`/api/chat/conversations?page=${page}&limit=${limit}`, { method: "GET" });
}

/** Fetch a single conversation with populated participants. */
export function getConversation(conversationId: string) {
  return requestJson<{ success: boolean; conversation: Conversation }>(
    `/api/chat/conversations/${conversationId}`,
    { method: "GET" },
  );
}

// ── Product Thread API ─────────────────────────────────────────────────────────

/** Get or create a product thread within a conversation */
export function getOrCreateThread(conversationId: string, data: {
  productId: string;
  productType: string;
  productTitle?: string;
  productPrice?: number;
  productImage?: string;
  currency?: string;
  sellerId: string;
}) {
  return requestJson<{ success: boolean; thread: ProductThread }>(
    `/api/chat/conversations/${conversationId}/threads`,
    { method: "POST", body: JSON.stringify(data) },
  );
}

/** List all product threads in a conversation */
export function listThreads(conversationId: string, status: "active" | "sold" | "all" = "all") {
  return requestJson<{ success: boolean; threads: ProductThread[] }>(
    `/api/chat/conversations/${conversationId}/threads?status=${status}`,
    { method: "GET" },
  );
}

/** Close a thread (product sold) */
export function closeThread(threadId: string, reason: "sold" | "user_closed" = "sold") {
  return requestJson<{ success: boolean; thread: ProductThread }>(
    `/api/chat/threads/${threadId}/close`,
    { method: "PUT", body: JSON.stringify({ reason }) },
  );
}

// ── Message API ────────────────────────────────────────────────────────────────

/** Get messages for a conversation (optionally filtered to a thread) */
export function getMessages(conversationId: string, page = 1, limit = 50, threadId?: string) {
  const qs = `page=${page}&limit=${limit}${threadId ? `&threadId=${threadId}` : ""}`;
  return requestJson<{
    success: boolean;
    messages: ChatMessage[];
    pagination: MessagesPagination;
  }>(`/api/chat/conversations/${conversationId}/messages?${qs}`, { method: "GET" });
}

/** Get messages for a specific thread */
export function getThreadMessages(threadId: string, page = 1, limit = 50) {
  return requestJson<{
    success: boolean;
    messages: ChatMessage[];
    pagination: MessagesPagination;
  }>(`/api/chat/threads/${threadId}/messages?page=${page}&limit=${limit}`, { method: "GET" });
}

/** Send a message inside a product thread.
 *  `clientMessageId` (optional, recommended) makes the call idempotent: retrying
 *  with the same id within ~5 minutes returns the originally-saved message
 *  instead of creating a duplicate. The server will set `duplicate: true` on
 *  the response in that case. */
export function sendMessageApi(
  conversationId: string,
  data: {
    content: string;
    threadId: string;
    replyTo?: string;
    attachments?: Array<{ name: string; url: string; key: string; mimeType: string; size: number; type: string }>;
    clientMessageId?: string;
  },
) {
  return requestJson<{ success: boolean; message: ChatMessage; duplicate?: boolean }>(
    `/api/chat/conversations/${conversationId}/messages`,
    { method: "POST", body: JSON.stringify(data) },
  );
}

/** Generate a short, collision-resistant id for `clientMessageId`. Safe to call
 *  many times per second; the keyspace is large enough for our 5-minute dedup
 *  window and the server enforces uniqueness per sender. */
export function generateClientMessageId(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `c-${Date.now().toString(36)}-${rand}`;
}

/** Mark conversation as read */
export function markConversationRead(conversationId: string) {
  return requestJson<{ success: boolean; notificationsMarked?: number }>(
    `/api/chat/conversations/${conversationId}/read`,
    { method: "PUT" },
  );
}

/** Mark a single thread as read */
export function markThreadRead(threadId: string) {
  return requestJson<{ success: boolean; notificationsMarked?: number }>(
    `/api/chat/threads/${threadId}/read`,
    { method: "PUT" },
  );
}

/** Search messages in a conversation */
export function searchMessages(conversationId: string, query: string, threadId?: string, page = 1) {
  const qs = `q=${encodeURIComponent(query)}&page=${page}${threadId ? `&threadId=${threadId}` : ""}`;
  return requestJson<{ success: boolean; messages: ChatMessage[] }>(
    `/api/chat/conversations/${conversationId}/search?${qs}`,
    { method: "GET" },
  );
}

/** Get total unread count */
export function getUnreadCount() {
  return requestJson<{ success: boolean; unreadCount: number }>("/api/chat/unread-count", { method: "GET" });
}

// ── Attachments ────────────────────────────────────────────────────────────────

/** Match the upload URI shape used elsewhere in the app (profile, listings). */
function normalizeUploadUri(uri: string): string {
  if (!uri) return uri;
  if (Platform.OS === "android") return uri;
  return uri.startsWith("file://") ? uri.replace("file://", "") : uri;
}

/** Picker MIME types are often missing or generic on Android — infer from name. */
function normalizeUploadMimeType(mimeType: string, filename: string): string {
  const m = (mimeType || "").toLowerCase().trim();
  if (m === "image/jpg") return "image/jpeg";
  if (m && m !== "application/octet-stream") return m;

  const ext = (filename.split(".").pop() || "").toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png")  return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif")  return "image/gif";
  if (ext === "heic") return "image/heic";
  if (ext === "heif") return "image/heif";
  if (ext === "mp4" || ext === "mov") return "video/mp4";
  if (ext === "m4a") return "audio/mp4";
  if (ext === "3gp") return "video/3gpp";
  return "image/jpeg";
}

export type ChatAttachment = {
  name: string;
  url: string;
  key: string;
  mimeType: string;
  size: number;
  type: string;
};

/** Upload a single file (image / video / audio / document) for a conversation.
 *  Returns the S3-backed attachment ref to attach to a subsequent sendMessage call.
 *
 *  Implementation notes (all hard-won — DO NOT remove without testing on a
 *  real device):
 *   - Android requires the URI to start with `file://`. Some pickers give
 *     `content://` URIs that ResourcePool can't read, so we leave the URI as
 *     received (RN's networking layer handles `content://` itself) and trust
 *     the picker library to give us something fetch-able.
 *   - Don't set `Content-Type` — fetch must auto-generate the multipart
 *     boundary, otherwise multer rejects the body.
 *   - The server enforces a 25 MB cap + a magic-bytes sniff; the latter only
 *     fails when the picker advertises a wrong MIME (rare).
 */
export async function uploadChatAttachment(
  conversationId: string,
  file: { uri: string; name: string; mimeType: string; size?: number },
): Promise<ChatAttachment> {
  const uploadUrl = `${getAuthApiBaseUrl()}/api/chat/conversations/${conversationId}/attachments`;

  // Ensure a sane file name + extension so multer / the magic-byte sniffer
  // don't reject the upload.
  const safeName = (() => {
    const name = (file.name || "").trim();
    if (name) return name;
    const ext =
      file.mimeType.includes("video") ? "mp4"
      : file.mimeType.includes("audio") ? "m4a"
      : file.mimeType.includes("png")   ? "png"
      : "jpg";
    return `chat-${Date.now()}.${ext}`;
  })();

  const mimeType = normalizeUploadMimeType(file.mimeType, safeName);
  const uploadUri = normalizeUploadUri(file.uri);

  const buildFormData = () => {
    const fd = new FormData();
    fd.append("file", {
      uri:  uploadUri,
      name: safeName,
      type: mimeType,
    } as unknown as Blob);
    return fd;
  };

  const doUpload = () => {
    const token = getAccessToken();
    return fetch(uploadUrl, {
      method: "POST",
      headers: {
        // NOTE: Do NOT set Content-Type — fetch must auto-pick the boundary.
        Accept: "application/json",
        "X-Listify-Client": "mobile",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: buildFormData(),
    });
  };

  let res: Response;
  try {
    res = await doUpload();
    if (res.status === 401) {
      const refreshed = await refreshAccessToken();
      if (refreshed) res = await doUpload();
    }
  } catch (err: any) {
    // Network-level failure (no socket, DNS, etc.).
    throw new Error(
      `Upload failed: ${err?.message || "no network"}. Check that the server is reachable.`,
    );
  }

  let json: any = null;
  let rawText = "";
  try {
    rawText = await res.text();
    json = rawText ? JSON.parse(rawText) : null;
  } catch {
    json = null;
  }

  if (!res.ok || !json?.attachment) {
    const serverMsg = json?.message || rawText?.slice(0, 200) || `HTTP ${res.status}`;
    devWarn("[chat-api] uploadChatAttachment failed", {
      status: res.status,
      message: serverMsg,
      url: uploadUrl,
      mimeType: file.mimeType,
      uri: file.uri,
    });
    throw new Error(`Upload failed: ${serverMsg}`);
  }
  return json.attachment as ChatAttachment;
}

// ── Delete ─────────────────────────────────────────────────────────────────────

/** Delete a message for *me* only — peer still sees it. */
export function deleteMessageForMe(conversationId: string, messageId: string) {
  return requestJson<{ success: boolean }>(
    `/api/chat/conversations/${conversationId}/messages/${messageId}`,
    { method: "DELETE" },
  );
}

/** Delete a message for *everyone* — only the sender, and only within 2h of sending. */
export function deleteMessageForEveryone(conversationId: string, messageId: string) {
  return requestJson<{ success: boolean }>(
    `/api/chat/conversations/${conversationId}/messages/${messageId}/everyone`,
    { method: "DELETE" },
  );
}

// ── Offer API ──────────────────────────────────────────────────────────────────

/** Make an offer on a product thread */
export function makeOffer(threadId: string, amount: number, currency = "₹") {
  return requestJson<{ success: boolean; thread: ProductThread; message: ChatMessage }>(
    `/api/chat/threads/${threadId}/offer`,
    { method: "POST", body: JSON.stringify({ amount, currency }) },
  );
}

/** Accept an offer */
export function acceptOffer(threadId: string) {
  return requestJson<{ success: boolean; thread: ProductThread; message: ChatMessage }>(
    `/api/chat/threads/${threadId}/offer/accept`,
    { method: "PUT" },
  );
}

/** Decline an offer */
export function declineOffer(threadId: string) {
  return requestJson<{ success: boolean; thread: ProductThread; message: ChatMessage }>(
    `/api/chat/threads/${threadId}/offer/decline`,
    { method: "PUT" },
  );
}

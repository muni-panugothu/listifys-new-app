const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const User = require("../models/user.model.js");
const { logger } = require("../utils/logger.js");

// Map userId → Set of socketIds (supports multiple tabs/devices)
const onlineUsers = new Map();
// Map userId -> timeout handle to debounce transient disconnects (page refresh)
const offlineTimers = new Map();
// Map userId → last seen timestamp (updated on disconnect)
const lastSeenMap = new Map();

const OFFLINE_GRACE_MS = 5000;

// ── Socket.IO metrics ──────────────────────────────────────────────────────────
const socketMetrics = {
  totalConnections: 0,
  activeConnections: 0,
  authFailures: 0,
  peakConnections: 0,
  messagesIn: 0,
  messagesOut: 0,
  getStats() {
    return {
      ...this,
      onlineUsers: onlineUsers.size,
      uptime: process.uptime(),
    };
  },
};

let io = null;

async function emitChatUnreadCount(socket, userId) {
  try {
    const Conversation = require('../models/conversation.model');
    const userIdStr = userId.toString();
    const result = await Conversation.aggregate([
      { $match: { participants: userId } },
      { $project: { unreadArr: { $objectToArray: { $ifNull: ['$unreadCounts', {}] } } } },
      { $unwind: { path: '$unreadArr', preserveNullAndEmptyArrays: true } },
      { $match: { 'unreadArr.k': userIdStr } },
      { $group: { _id: null, totalUnread: { $sum: '$unreadArr.v' } } },
    ]);
    const totalUnread = result[0]?.totalUnread || 0;
    socket.emit('chat:unreadCount', { unreadCount: totalUnread });
  } catch (err) {
    logger.debug('[Socket] Failed to send unread count', { err: err.message });
  }
}

/**
 * Initialize Socket.IO on the existing HTTP server.
 * Call this once from server.js after app.listen().
 *
 * Production tuning for 10k+ concurrent socket connections:
 * - perMessageDeflate disabled (CPU-intensive, bad at scale)
 * - httpCompression disabled (handled by Express middleware)
 * - Higher pingTimeout for mobile/slow networks
 * - maxHttpBufferSize capped to prevent memory abuse
 * - connectionStateRecovery for seamless reconnects
 */
async function initSocket(httpServer, corsOptions) {
  io = new Server(httpServer, {
    cors: {
      origin: corsOptions.origin,
      credentials: true,
    },
    // ── Timing ─────────────────────────────────────────────────────────────────
    pingTimeout: 60_000,              // 60s before considering client dead
    pingInterval: 25_000,             // Ping every 25s (keeps NAT/proxy alive)
    upgradeTimeout: 30_000,           // 30s to upgrade from polling to websocket

    // ── Performance at scale ───────────────────────────────────────────────────
    perMessageDeflate: false,         // Disable — CPU-heavy, bad for 10k connections
    httpCompression: false,           // Handled by Express compression middleware
    maxHttpBufferSize: 1e6,           // 1MB max per message (prevents memory bombs)
    
    // ── Transport ──────────────────────────────────────────────────────────────
    transports: ['websocket', 'polling'], // Prefer WebSocket, fall back to polling
    allowUpgrades: true,

    // ── Connection state recovery (Socket.IO v4.6+) ────────────────────────────
    // Allows clients to reconnect within 2 min without re-auth, preserving room membership
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000,  // 2 minutes
      skipMiddlewares: false,                    // Still verify auth on recovery
    },
  });

  // ── Redis adapter for horizontal scaling (multi-instance support) ─────────
  // Uses native Redis protocol via ioredis (not Upstash REST)
  try {
    const redisUrl = process.env.UPSTASH_REDIS_URL;
    if (redisUrl) {
      const { createAdapter } = require('@socket.io/redis-adapter');
      const { createClient } = require('redis');

      const pubClient = createClient({ url: redisUrl });
      const subClient = pubClient.duplicate();

      pubClient.on('error', (err) => logger.warn('[Socket] Redis adapter pub error', { error: err.message }));
      subClient.on('error', (err) => logger.warn('[Socket] Redis adapter sub error', { error: err.message }));

      await Promise.all([pubClient.connect(), subClient.connect()]);
      io.adapter(createAdapter(pubClient, subClient));
      logger.info('[Socket] Redis adapter connected — multi-instance scaling enabled');
    } else {
      const wc = parseInt(process.env.WEB_CONCURRENCY, 10) || 0;
      if (wc > 1) {
        logger.error('[Socket] 🚨 No UPSTASH_REDIS_URL but WEB_CONCURRENCY=%d — Socket.IO events will NOT propagate across workers', wc);
      }
      logger.info('[Socket] No UPSTASH_REDIS_URL — running single-instance Socket.IO');
    }
  } catch (adapterErr) {
    // Non-fatal: fall back to in-memory adapter (single instance still works)
    const wc = parseInt(process.env.WEB_CONCURRENCY, 10) || 0;
    if (wc > 1) {
      logger.error('[Socket] 🚨 Redis adapter failed and WEB_CONCURRENCY=%d — cross-worker socket events broken', wc);
    }
    logger.warn('[Socket] Redis adapter failed, using in-memory', { error: adapterErr.message });
  }

  // ── Auth middleware — verify JWT from handshake ──
  io.use(async (socket, next) => {
    try {
      // Try cookie first, then auth header
      const cookieHeader = socket.handshake.headers.cookie || "";
      let token = null;

      // Parse accessToken from cookies
      const cookies = Object.fromEntries(
        cookieHeader.split(";").map((c) => {
          const [k, ...v] = c.trim().split("=");
          return [k, v.join("=")];
        })
      );
      token = cookies.accessToken;

      // Fallback: auth query/header
      if (!token) {
        token =
          socket.handshake.auth?.token ||
          socket.handshake.headers?.authorization?.split(" ")[1];
      }

      if (!token) {
        return next(new Error("Authentication required"));
      }

      // Wait for MongoDB before querying users
      if (mongoose.connection.readyState !== 1) {
        return next(new Error("Server still starting, please retry"));
      }

      const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
      const user = await User.findById(decoded.id).select("name profileImage googleProfileImage avatar provider status");
      if (!user) return next(new Error("User not found"));
      if (user.status !== 'active') return next(new Error("Account suspended"));

      socket.userId = user._id.toString();
      socket.userName = user.name;
      next();
    } catch (err) {
      socketMetrics.authFailures++;
      const message = err?.message || 'Unknown socket auth error';
      // Missing/expired tokens are expected during startup/logout transitions.
      if (message === 'Authentication required' || message === 'jwt expired' || message === 'jwt must be provided' || message === 'Server still starting, please retry') {
        logger.debug('[Socket] Auth rejected (expected)', { reason: message });
      } else {
        logger.warn('[Socket] Auth failed', { reason: message });
      }
      next(new Error("Authentication failed"));
    }
  });

  // ── Connection handler ──
  io.on("connection", (socket) => {
    const userId = socket.userId;

    // ── Track metrics ──────────────────────────────────────────────────────────
    socketMetrics.totalConnections++;
    socketMetrics.activeConnections++;
    socketMetrics.peakConnections = Math.max(socketMetrics.peakConnections, socketMetrics.activeConnections);

    // ── Per-socket event rate limiter (prevents click-spam / bot flooding) ─────
    const eventCounts = new Map();
    const SOCKET_RATE_LIMITS = {
      'typing:start':       { max: 10, windowMs: 5_000 },   // 10 typing events / 5s
      'typing:stop':        { max: 10, windowMs: 5_000 },
      'conversation:join':  { max: 20, windowMs: 60_000 },  // 20 joins / min
      'conversation:leave': { max: 20, windowMs: 60_000 },
      'users:online':       { max: 5,  windowMs: 10_000 },  // 5 requests / 10s
      'chat:unreadCount:request': { max: 10, windowMs: 10_000 },
      'message:delivered':  { max: 30, windowMs: 10_000 },  // 30 deliveries / 10s
      'user:lastSeen':      { max: 5,  windowMs: 10_000 },  // 5 last-seen queries / 10s
    };

    const isRateLimited = (eventName) => {
      const limit = SOCKET_RATE_LIMITS[eventName];
      if (!limit) return false;

      const now = Date.now();
      const key = eventName;
      
      if (!eventCounts.has(key)) {
        eventCounts.set(key, { count: 1, windowStart: now });
        return false;
      }

      const entry = eventCounts.get(key);
      if (now - entry.windowStart > limit.windowMs) {
        // Reset window
        entry.count = 1;
        entry.windowStart = now;
        return false;
      }

      entry.count++;
      if (entry.count > limit.max) {
        logger.warn(`[Socket] Rate limited: ${eventName}`, { userId, count: entry.count });
        return true;
      }
      return false;
    };

    // User reconnected before offline grace timer elapsed.
    if (offlineTimers.has(userId)) {
      clearTimeout(offlineTimers.get(userId));
      offlineTimers.delete(userId);
    }

    logger.info(`🔌 Socket connected: ${socket.userName} (${userId})`);

    // Track online status
    if (!onlineUsers.has(userId)) {
      onlineUsers.set(userId, new Set());
    }
    onlineUsers.get(userId).add(socket.id);

    // Broadcast online status only to user's personal room subscribers
    // (contacts/conversation partners join user:{id} rooms for presence)
    socket.to(`user:${userId}`).emit("user:online", { userId });

    // ── Send unread count immediately on connect ──
    emitChatUnreadCount(socket, userId);

    // ── Join personal room for targeted messages ──
    socket.join(`user:${userId}`);

    // ── Join a conversation room ──
    socket.on("conversation:join", async (conversationId) => {
      if (isRateLimited('conversation:join')) return;
      if (typeof conversationId !== 'string' || conversationId.length > 50) return;
      try {
        const Conversation = require('../models/conversation.model');
        const isParticipant = await Conversation.exists({
          _id: conversationId,
          participants: userId,
        });
        if (!isParticipant) return;
        socket.join(`conversation:${conversationId}`);
      } catch {
        // Invalid ObjectId or DB error — silently ignore
      }
    });

    socket.on("conversation:leave", (conversationId) => {
      if (isRateLimited('conversation:leave')) return;
      if (typeof conversationId !== 'string' || conversationId.length > 50) return;
      socket.leave(`conversation:${conversationId}`);
    });

    SOCKET_RATE_LIMITS['event:join'] = { max: 30, windowMs: 60_000 };
    SOCKET_RATE_LIMITS['event:leave'] = { max: 30, windowMs: 60_000 };

    socket.on('event:join', async (eventId) => {
      if (isRateLimited('event:join')) return;
      if (typeof eventId !== 'string' || eventId.length > 50) return;
      if (!mongoose.Types.ObjectId.isValid(eventId)) return;
      socket.join(`event:${eventId}`);
    });

    socket.on('event:leave', (eventId) => {
      if (isRateLimited('event:leave')) return;
      if (typeof eventId !== 'string' || eventId.length > 50) return;
      socket.leave(`event:${eventId}`);
    });

    // ── Product Thread events ─────────────────────────────────────────────────
    // thread:join  — join a thread room for fine-grained typing/read indicators
    SOCKET_RATE_LIMITS['thread:join']   = { max: 30, windowMs: 60_000 };
    SOCKET_RATE_LIMITS['thread:leave']  = { max: 30, windowMs: 60_000 };
    SOCKET_RATE_LIMITS['thread:typing'] = { max: 10, windowMs: 5_000 };

    socket.on('thread:join', async (threadId) => {
      if (typeof threadId !== 'string' || threadId.length > 50) return;
      try {
        const ProductThread = require('../models/product-thread.model');
        const thread = await ProductThread.findById(threadId).select('conversation seller buyer').lean();
        if (!thread) return;
        const isParticipant = [String(thread.seller), String(thread.buyer)].includes(userId);
        if (!isParticipant) return;
        socket.join(`thread:${threadId}`);
      } catch {}
    });

    socket.on('thread:leave', (threadId) => {
      if (typeof threadId !== 'string' || threadId.length > 50) return;
      socket.leave(`thread:${threadId}`);
    });

    // Client emits thread-scoped typing indicator
    socket.on('thread:typing:start', (data) => {
      const threadId = data?.threadId;
      const conversationId = data?.conversationId;
      if (typeof threadId !== 'string') return;
      socket.to(`conversation:${conversationId}`).emit('thread:typing:start', { threadId, userId, userName: socket.userName });
    });

    socket.on('thread:typing:stop', (data) => {
      const threadId = data?.threadId;
      const conversationId = data?.conversationId;
      if (typeof threadId !== 'string') return;
      socket.to(`conversation:${conversationId}`).emit('thread:typing:stop', { threadId, userId });
    });

    // Reaction on a message
    socket.on('message:react', async (data) => {
      const { messageId, emoji, conversationId } = data || {};
      if (!messageId || !emoji || typeof messageId !== 'string') return;
      try {
        const Message = require('../models/message.model');
        const msg = await Message.findOneAndUpdate(
          { _id: messageId, conversation: conversationId, 'reactions.user': { $ne: userId } },
          { $push: { reactions: { user: userId, emoji } } },
          { new: true },
        );
        if (msg) {
          io.to(`conversation:${conversationId}`).emit('message:reacted', {
            messageId, userId, emoji, conversationId,
            reactions: msg.reactions,
          });
        }
      } catch {}
    });

    socket.on('message:unreact', async (data) => {
      const { messageId, conversationId } = data || {};
      if (!messageId || typeof messageId !== 'string') return;
      try {
        const Message = require('../models/message.model');
        await Message.updateOne({ _id: messageId, conversation: conversationId }, { $pull: { reactions: { user: userId } } });
        io.to(`conversation:${conversationId}`).emit('message:unreacted', { messageId, userId, conversationId });
      } catch {}
    });


    socket.on("typing:start", (data) => {
      if (isRateLimited('typing:start')) return;
      const conversationId = data?.conversationId;
      if (typeof conversationId !== 'string') return;
      socket.to(`conversation:${conversationId}`).emit("typing:start", {
        conversationId,
        userId,
        userName: socket.userName,
      });
      socketMetrics.messagesOut++;
    });

    socket.on("typing:stop", (data) => {
      if (isRateLimited('typing:stop')) return;
      const conversationId = data?.conversationId;
      if (typeof conversationId !== 'string') return;
      socket.to(`conversation:${conversationId}`).emit("typing:stop", {
        conversationId,
        userId,
      });
      socketMetrics.messagesOut++;
    });

    // ── Request online users list ──
    socket.on("users:online", () => {
      if (isRateLimited('users:online')) return;
      socket.emit("users:online", Array.from(onlineUsers.keys()));
    });

    // ── Client can request unread count explicitly (useful after listener attach) ──
    socket.on('chat:unreadCount:request', () => {
      if (isRateLimited('chat:unreadCount:request')) return;
      emitChatUnreadCount(socket, userId);
    });

    // ── CALLING ────────────────────────────────────────────────────────────────
    // call:initiate  — caller starts a call
    // call:accept    — receiver accepts
    // call:reject    — receiver rejects
    // call:end       — either side ends the call
    // call:ice-candidate — WebRTC ICE exchange
    // call:update-fcm-token — store device FCM token for offline call push

    socket.on('call:update-fcm-token', async ({ fcmToken }) => {
      if (!fcmToken || typeof fcmToken !== 'string' || fcmToken.length > 500) return;
      try {
        const User = require('../models/user.model');
        await User.updateOne({ _id: userId }, { fcmToken });
        logger.info('[Socket] FCM token updated', { userId, tokenPrefix: fcmToken.slice(0, 20) });
      } catch (err) {
        logger.debug('[Socket] call:update-fcm-token error', { err: err.message });
      }
    });

    socket.on('call:initiate', async (data) => {
      const { to, callType, offer, callerName, callerPhoto } = data || {};
      if (!to || !offer || !['audio', 'video'].includes(callType)) return;
      if (typeof to !== 'string' || to.length > 50) return;

      const callId = `${userId}-${to}-${Date.now()}`;

      const toSockets = onlineUsers.get(to);
      if (toSockets && toSockets.size > 0) {
        // Receiver is online — forward via socket
        io.to(`user:${to}`).emit('call:incoming', {
          callId,
          from: userId,
          callerName: callerName || socket.userName,
          callerPhoto: callerPhoto || '',
          callType,
          offer,
        });
      } else {
        // Receiver offline — send FCM data push to wake device
        try {
          const User = require('../models/user.model');
          const receiver = await User.findById(to).select('fcmToken');
          if (receiver?.fcmToken) {
            const { sendCallNotification } = require('../services/fcm.service');
            await sendCallNotification(receiver.fcmToken, {
              callId,
              callType,
              callerName: callerName || socket.userName,
              callerPhoto: callerPhoto || '',
            });
          }
        } catch (err) {
          logger.debug('[Socket] call:initiate FCM error', { err: err.message });
        }
      }

      // Notify caller of the callId so they can match responses
      socket.emit('call:initiated', { callId, to });
    });

    socket.on('call:accept', ({ to, answer, callId }) => {
      if (!to || !answer || typeof to !== 'string') return;
      io.to(`user:${to}`).emit('call:accepted', { answer, callId, from: userId });
    });

    socket.on('call:reject', ({ to, callId }) => {
      if (!to || typeof to !== 'string') return;
      io.to(`user:${to}`).emit('call:rejected', { callId, from: userId });
      // Save missed call log
      (async () => {
        try {
          const CallLog = require('../models/calllog.model');
          await CallLog.create({ caller: to, receiver: userId, type: 'audio', status: 'rejected' });
        } catch {}
      })();
    });

    socket.on('call:end', ({ to, callId, duration, callType }) => {
      if (!to || typeof to !== 'string') return;
      io.to(`user:${to}`).emit('call:ended', { callId, from: userId });
      // Save completed call log
      (async () => {
        try {
          const CallLog = require('../models/calllog.model');
          await CallLog.create({
            caller:   userId,
            receiver: to,
            type:     callType || 'audio',
            status:   'completed',
            duration: duration || 0,
            endedAt:  new Date(),
          });
        } catch {}
      })();
    });

    socket.on('call:ice-candidate', ({ to, candidate }) => {
      if (!to || !candidate || typeof to !== 'string') return;
      io.to(`user:${to}`).emit('call:ice-candidate', { candidate, from: userId });
    });
    // ── END CALLING ────────────────────────────────────────────────────────────
    // ── Message delivery acknowledgment ──
    // Accepts both the legacy single-id shape and the new batched shape.
    //   legacy: { messageId, conversationId }
    //   batch : { messageIds: string[], conversationId, threadId? }
    socket.on("message:delivered", async (data) => {
      if (isRateLimited('message:delivered')) return;
      const conversationId = data?.conversationId;
      const threadId       = data?.threadId;
      if (typeof conversationId !== 'string' || conversationId.length > 50) return;

      const rawIds = Array.isArray(data?.messageIds)
        ? data.messageIds
        : data?.messageId
          ? [data.messageId]
          : [];
      const ids = rawIds
        .filter((id) => typeof id === 'string' && id.length <= 50)
        .slice(0, 200);
      if (ids.length === 0) return;

      try {
        const chatService = require('../services/chat.service');
        const { bySender, deliveredAt } = await chatService.markMessagesDelivered({ messageIds: ids, userId });

        // Backwards compat: legacy clients still listen for `message:status`
        // on the conversation room. Also fire the per-sender batch event.
        const at = deliveredAt instanceof Date ? deliveredAt.toISOString() : new Date().toISOString();

        for (const [senderId, entries] of Object.entries(bySender)) {
          const buckets = new Map();
          for (const e of entries) {
            const key = `${e.conversationId}::${e.threadId || ''}`;
            if (!buckets.has(key)) buckets.set(key, { conversationId: e.conversationId, threadId: e.threadId, ids: [] });
            buckets.get(key).ids.push(e.messageId);
          }
          for (const bucket of buckets.values()) {
            io.to(`user:${senderId}`).emit('message:status:batch', {
              conversationId: bucket.conversationId,
              threadId:       bucket.threadId,
              status:         'delivered',
              messageIds:     bucket.ids,
              userId,
              at,
            });
            // Legacy single-message status (one per id, in the conversation room)
            for (const mid of bucket.ids) {
              io.to(`conversation:${bucket.conversationId}`).emit('message:status', {
                messageId:    mid,
                conversationId: bucket.conversationId,
                threadId:     bucket.threadId,
                status:       'delivered',
                userId,
                at,
              });
            }
          }
        }

        socketMetrics.messagesOut++;
      } catch (err) {
        logger.debug('[Socket] message:delivered error', { err: err.message });
      }
    });

    // ── Status catch-up ──
    // Client calls this after a reconnect (or when opening a thread) to back-fill
    // ticks for messages they sent while the socket was down. Returns the latest
    // status of each in-flight message they sent in that thread.
    SOCKET_RATE_LIMITS['message:catchup:request'] = { max: 20, windowMs: 60_000 };

    socket.on('message:catchup:request', async (data, ack) => {
      if (isRateLimited('message:catchup:request')) {
        if (typeof ack === 'function') ack({ ok: false, reason: 'rate_limited' });
        return;
      }
      const threadId       = data?.threadId;
      const sinceMessageId = data?.sinceMessageId;
      if (typeof threadId !== 'string' || threadId.length > 50) {
        if (typeof ack === 'function') ack({ ok: false, reason: 'invalid_thread' });
        return;
      }
      try {
        const chatService = require('../services/chat.service');
        const ProductThread = require('../models/product-thread.model');
        const thread = await ProductThread.findById(threadId).select('conversation seller buyer').lean();
        if (!thread) {
          if (typeof ack === 'function') ack({ ok: false, reason: 'thread_not_found' });
          return;
        }
        const isParticipant = [String(thread.seller), String(thread.buyer)].includes(userId);
        if (!isParticipant) {
          if (typeof ack === 'function') ack({ ok: false, reason: 'forbidden' });
          return;
        }

        const updates = await chatService.getStatusCatchup({ userId, threadId, sinceMessageId });
        if (typeof ack === 'function') {
          ack({ ok: true, threadId, conversationId: String(thread.conversation), updates });
        } else if (updates.length > 0) {
          // No ack callback — emit as a normal event so the client picks it up.
          socket.emit('message:status:batch', {
            conversationId: String(thread.conversation),
            threadId,
            status:         'catchup',
            updates,
            userId,
            at:             new Date().toISOString(),
          });
        }
      } catch (err) {
        logger.debug('[Socket] message:catchup:request error', { err: err.message });
        if (typeof ack === 'function') ack({ ok: false, reason: 'server_error' });
      }
    });

    // ── Request another user's last seen time ──
    socket.on("user:lastSeen", (data) => {
      if (isRateLimited('user:lastSeen')) return;
      const targetUserId = data?.targetUserId;
      if (typeof targetUserId !== 'string' || targetUserId.length > 50) return;
      const isOnline = onlineUsers.has(targetUserId) && onlineUsers.get(targetUserId).size > 0;
      const lastSeen = lastSeenMap.get(targetUserId) || null;
      socket.emit("user:lastSeen", { userId: targetUserId, isOnline, lastSeen });
    });

    // ── Disconnect ──
    socket.on("disconnect", (reason) => {
      socketMetrics.activeConnections--;
      logger.info(`🔌 Socket disconnected: ${socket.userName} (${userId}) [reason=${reason}]`);

      const sockets = onlineUsers.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          // Record last seen time immediately
          lastSeenMap.set(userId, new Date().toISOString());

          // Debounce offline to avoid false "user:offline" on browser refresh.
          const timer = setTimeout(() => {
            const activeSockets = onlineUsers.get(userId);
            if (!activeSockets || activeSockets.size === 0) {
              onlineUsers.delete(userId);
              // Broadcast offline only to user's presence subscribers
              io.to(`user:${userId}`).emit("user:offline", { userId, lastSeen: lastSeenMap.get(userId) });
            }
            offlineTimers.delete(userId);
          }, OFFLINE_GRACE_MS);

          offlineTimers.set(userId, timer);
        }
      }
    });
  });

  return io;
}

/** Get the io instance (for emitting from controllers) */
function getIO() {
  if (!io) throw new Error("Socket.IO not initialized");
  return io;
}

/**
 * Push a real-time force-logout event to every socket belonging to a user.
 * Called after /api/auth/logout-all revokes all tokens in Redis.
 * The client listens to `auth:force_logout` and clears local session.
 *
 * @param {string} userId   – The user to force-logout
 * @param {string} [reason] – Reason string shown on the client ("signed_out_all_devices" | "session_revoked")
 */
function forceLogoutUser(userId, reason = 'signed_out_all_devices') {
  if (!io) return; // not yet initialised (e.g. during startup)
  const userIdStr = userId.toString();
  io.to(`user:${userIdStr}`).emit('auth:force_logout', { reason });
  logger.info('[Socket] force_logout emitted', { userId: userIdStr, reason });
}

/** Check if a user is online */
function isUserOnline(userId) {
  return onlineUsers.has(userId.toString());
}

/** Get socket stats for CloudWatch metrics */
function getSocketStats() {
  return {
    activeConnections: socketMetrics.activeConnections,
    onlineUsers: onlineUsers.size,
  };
}

// ── Prune stale lastSeenMap entries every 30 minutes ───────────────────────────
const LAST_SEEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
setInterval(() => {
  const cutoff = Date.now() - LAST_SEEN_TTL_MS;
  for (const [userId, ts] of lastSeenMap) {
    if (new Date(ts).getTime() < cutoff && !onlineUsers.has(userId)) {
      lastSeenMap.delete(userId);
    }
  }
}, 30 * 60 * 1000);

module.exports = { initSocket, getIO, isUserOnline, forceLogoutUser, socketMetrics, lastSeenMap, getSocketStats };

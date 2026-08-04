'use strict';
/**
 * chat.controller.js
 * Thin HTTP layer: validate → delegate to chat.service → respond.
 */

const mongoose      = require('mongoose');
const chatService   = require('../services/chat.service');
const Conversation  = require('../models/conversation.model');
const Message       = require('../models/message.model');
const ProductThread = require('../models/product-thread.model');
const User          = require('../models/user.model');
const { getIO }     = require('../config/socket');
const { createNotification } = require('./notification.controller');
const { logger }    = require('../utils/logger');
const { encrypt, isEncryptionEnabled } = require('../services/encryption.service');
const s3Service     = require('../services/s3.service');
const { publishMessagePersisted } = require('../queues/producers/chat.producer');
const { publishOfferEvent }       = require('../queues/producers/offer.producer');
const { publishAuditEvent }       = require('../queues/producers/audit.producer');

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const setNoCacheHeaders = (res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
};

const emitToConversation = (conversationId, event, data) => {
  try { getIO().to(`conversation:${conversationId}`).emit(event, data); } catch (_) {}
};
const emitToUser = (userId, event, data) => {
  try { getIO().to(`user:${userId}`).emit(event, data); } catch (_) {}
};

/**
 * Notify the buyer when the seller accepts or declines their offer.
 * Sends an in-app notification (DB + socket) and an FCM push.
 */
const notifyOfferResult = async ({ thread, sellerId, accepted }) => {
  const buyerId = String(thread.buyer);
  const currency = thread.activeOffer?.currency || '₹';
  const amount = Number(thread.activeOffer?.amount || 0);
  const productTitle = thread.product?.title || 'your offer';
  const notifType = accepted ? 'offer_accepted' : 'offer_rejected';
  const amountLabel = amount ? ` of ${currency}${amount.toLocaleString('en-IN')}` : '';
  const message = accepted
    ? `Your offer${amountLabel} on "${productTitle}" was accepted 🎉`
    : `Your offer${amountLabel} on "${productTitle}" was declined`;

  const seller = await User.findById(sellerId).select('name').lean();
  const metadata = {
    conversationId: String(thread.conversation),
    threadId: String(thread._id),
    listingId: thread.product?.productId ? String(thread.product.productId) : undefined,
    listingType: thread.product?.productType,
  };

  createNotification({
    recipient: buyerId,
    sender: sellerId,
    type: notifType,
    message,
    metadata,
    title: accepted ? '✅ Offer accepted' : '❌ Offer declined',
    imageUrl: thread.product?.image || null,
    senderName: seller?.name,
  })
    .then((n) => {
      if (n) {
        emitToUser(buyerId, 'notification:new', {
          _id: n._id, type: notifType, message, read: false,
          sender: { id: sellerId, name: seller?.name }, metadata: n.metadata, createdAt: n.createdAt,
        });
      }
    })
    .catch(() => {});
};

// ── CONVERSATIONS ─────────────────────────────────────────────────────────────

exports.getOrCreateConversation = async (req, res) => {
  try {
    const senderId = req.user.id;
    const { recipientId, productId, productType, productTitle, productPrice, productImage, currency, sellerId } = req.body;
    if (!recipientId || !isValidId(recipientId)) return res.status(400).json({ success: false, message: 'Valid recipientId is required' });
    if (recipientId === senderId) return res.status(400).json({ success: false, message: 'Cannot message yourself' });
    if (productId && !isValidId(productId)) return res.status(400).json({ success: false, message: 'Invalid productId' });
    const recipient = await User.findById(recipientId).select('_id').lean();
    if (!recipient) return res.status(404).json({ success: false, message: 'Recipient not found' });

    const conversation = await chatService.getOrCreateConversation(senderId, recipientId);
    let thread = null;
    if (productId && productType) {
      const listingSellerId = sellerId && isValidId(sellerId) ? sellerId : recipientId;
      
      // Check if a thread already exists for this product
      const existingThread = await ProductThread.findOne({
        conversation: conversation._id,
        'product.productId': productId,
      }).select('_id seller buyer').lean();
      
      // Only prevent NEW threads where sender is the seller (non-buyer initiating)
      // Allow existing threads to continue (seller can reply to buyer messages)
      if (!existingThread && String(senderId) === String(listingSellerId)) {
        return res.status(400).json({ success: false, message: 'You cannot message on your own listing' });
      }
      
      // Determine buyer: if senderId is not the seller, then senderId is the buyer
      // Otherwise, the recipient is the buyer
      const buyerId = String(senderId) === String(listingSellerId) ? recipientId : senderId;
      
      thread = await chatService.getOrCreateProductThread({
        conversationId: conversation._id, productId, productType, productTitle, productPrice, productImage, currency,
        sellerId: listingSellerId, buyerId,
      });
    }
    setNoCacheHeaders(res);
    return res.status(200).json({ success: true, conversation: chatService.formatConversation(conversation, senderId), thread: thread || null, encrypted: isEncryptionEnabled() });
  } catch (err) {
    logger.error('[chat] getOrCreateConversation', { error: err.message });
    return res.status(err.statusCode || 500).json({ success: false, message: err.message || 'Server error' });
  }
};

exports.getConversations = async (req, res) => {
  try {
    const userId = req.user.id;
    const page   = Math.max(parseInt(req.query.page) || 1, 1);
    const limit  = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);
    const skip   = (page - 1) * limit;
    const filter = { participants: userId };
    const [conversations, total] = await Promise.all([
      Conversation.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit)
        .populate('participants', 'name profileImage googleProfileImage avatar provider')
        .populate({ path: 'lastMessage', select: 'content attachments sender createdAt productThread messageType' }),
      Conversation.countDocuments(filter),
    ]);
    const formatted = conversations.map((c) => chatService.formatConversation(c, userId));
    setNoCacheHeaders(res);
    return res.status(200).json({ success: true, conversations: formatted, pagination: { page, limit, total, totalPages: Math.ceil(total / limit), hasMore: skip + limit < total }, encrypted: isEncryptionEnabled() });
  } catch (err) {
    logger.error('[chat] getConversations', { error: err.message });
    return res.status(500).json({ success: false, message: 'Failed to fetch conversations' });
  }
};

exports.getConversation = async (req, res) => {
  try {
    const userId = req.user.id;
    const { conversationId } = req.params;
    if (!isValidId(conversationId)) {
      return res.status(400).json({ success: false, message: 'Invalid conversationId' });
    }
    const conversation = await Conversation.findOne({ _id: conversationId, participants: userId })
      .populate('participants', 'name profileImage googleProfileImage avatar provider')
      .populate({ path: 'lastMessage', select: 'content attachments sender createdAt productThread messageType' });
    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }
    setNoCacheHeaders(res);
    return res.status(200).json({
      success: true,
      conversation: chatService.formatConversation(conversation, userId),
      encrypted: isEncryptionEnabled(),
    });
  } catch (err) {
    logger.error('[chat] getConversation', { error: err.message });
    return res.status(500).json({ success: false, message: 'Failed to fetch conversation' });
  }
};

// ── PRODUCT THREADS ───────────────────────────────────────────────────────────

exports.getOrCreateThread = async (req, res) => {
  try {
    const userId = req.user.id;
    const { conversationId } = req.params;
    if (!isValidId(conversationId)) return res.status(400).json({ success: false, message: 'Invalid conversationId' });
    const { productId, productType, productTitle, productPrice, productImage, currency, sellerId } = req.body;
    if (!productId || !isValidId(productId)) return res.status(400).json({ success: false, message: 'Valid productId required' });
    if (!productType) return res.status(400).json({ success: false, message: 'productType required' });
    if (!sellerId || !isValidId(sellerId)) return res.status(400).json({ success: false, message: 'Valid sellerId required' });
    const conversation = await Conversation.findOne({ _id: conversationId, participants: userId });
    if (!conversation) return res.status(404).json({ success: false, message: 'Conversation not found' });
    const buyerId = String(userId) === String(sellerId)
      ? conversation.participants.find((p) => String(p) !== String(sellerId))
      : userId;
    const thread = await chatService.getOrCreateProductThread({ conversationId, productId, productType, productTitle, productPrice, productImage, currency, sellerId, buyerId });
    return res.status(200).json({ success: true, thread });
  } catch (err) {
    logger.error('[chat] getOrCreateThread', { error: err.message });
    return res.status(err.statusCode || 500).json({ success: false, message: err.message || 'Server error' });
  }
};

exports.listThreads = async (req, res) => {
  try {
    const userId = req.user.id;
    const { conversationId } = req.params;
    if (!isValidId(conversationId)) return res.status(400).json({ success: false, message: 'Invalid conversationId' });
    const conversation = await Conversation.findOne({ _id: conversationId, participants: userId });
    if (!conversation) return res.status(404).json({ success: false, message: 'Conversation not found' });
    const threads = await chatService.getThreads(conversationId, userId, { statusFilter: req.query.status || 'all' });
    return res.status(200).json({ success: true, threads });
  } catch (err) {
    logger.error('[chat] listThreads', { error: err.message });
    return res.status(500).json({ success: false, message: 'Failed to fetch threads' });
  }
};

exports.closeThread = async (req, res) => {
  try {
    const userId = req.user.id;
    const { threadId } = req.params;
    if (!isValidId(threadId)) return res.status(400).json({ success: false, message: 'Invalid threadId' });
    const reason = req.body?.reason || 'sold';
    const thread = await chatService.closeThread(threadId, userId, reason);
    emitToConversation(String(thread.conversation), 'thread:closed', { threadId: String(thread._id), status: thread.status, closedReason: thread.closedReason, closedAt: thread.closedAt });
    publishAuditEvent({ action: 'thread.closed', userId, threadId, reason }).catch(() => {});
    return res.status(200).json({ success: true, thread });
  } catch (err) {
    logger.error('[chat] closeThread', { error: err.message });
    return res.status(err.statusCode || 500).json({ success: false, message: err.message || 'Server error' });
  }
};

// ── MESSAGES ──────────────────────────────────────────────────────────────────

exports.getMessages = async (req, res) => {
  try {
    const userId = req.user.id;
    const { conversationId } = req.params;
    if (!isValidId(conversationId)) return res.status(400).json({ success: false, message: 'Invalid conversationId' });
    const threadId = req.query.threadId && isValidId(req.query.threadId) ? req.query.threadId : null;
    const conversation = await Conversation.findOne({ _id: conversationId, participants: userId });
    if (!conversation) return res.status(404).json({ success: false, message: 'Conversation not found' });
    const result = await chatService.getMessages({ conversationId, threadId, userId, page: parseInt(req.query.page) || 1, limit: parseInt(req.query.limit) || 50 });
    const formatted = result.messages.map((m) => chatService.formatMessage(m, userId));
    setNoCacheHeaders(res);
    return res.status(200).json({ success: true, messages: formatted, pagination: result.pagination, encrypted: isEncryptionEnabled() });
  } catch (err) {
    logger.error('[chat] getMessages', { error: err.message });
    return res.status(500).json({ success: false, message: 'Failed to fetch messages' });
  }
};

exports.getThreadMessages = async (req, res) => {
  try {
    const userId = req.user.id;
    const { threadId } = req.params;
    if (!isValidId(threadId)) return res.status(400).json({ success: false, message: 'Invalid threadId' });
    const thread = await ProductThread.findById(threadId).select('conversation').lean();
    if (!thread) return res.status(404).json({ success: false, message: 'Thread not found' });
    const conversation = await Conversation.findOne({ _id: thread.conversation, participants: userId });
    if (!conversation) return res.status(403).json({ success: false, message: 'Access denied' });
    const result = await chatService.getMessages({ conversationId: thread.conversation, threadId, userId, page: parseInt(req.query.page) || 1, limit: parseInt(req.query.limit) || 50 });
    const formatted = result.messages.map((m) => chatService.formatMessage(m, userId));
    setNoCacheHeaders(res);
    return res.status(200).json({ success: true, messages: formatted, pagination: result.pagination });
  } catch (err) {
    logger.error('[chat] getThreadMessages', { error: err.message });
    return res.status(500).json({ success: false, message: 'Failed to fetch messages' });
  }
};

exports.sendMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    const { conversationId } = req.params;
    if (!isValidId(conversationId)) return res.status(400).json({ success: false, message: 'Invalid conversationId' });
    const { content, threadId, attachments, replyTo, clientMessageId } = req.body;
    if (!threadId || !isValidId(threadId)) return res.status(400).json({ success: false, message: 'threadId is required' });
    const { message, plainContent, conversation, thread, duplicate } = await chatService.sendMessage({
      conversationId, threadId, senderId: userId, content, attachments, replyTo, clientMessageId,
    });
    const formattedMsg = chatService.formatMessage(message, userId);

    // On a deduped retry we already broadcast everything the first time. Just
    // echo the canonical message back to the caller so their optimistic bubble
    // can settle, but skip the fan-out and notifications.
    if (duplicate) {
      setNoCacheHeaders(res);
      return res.status(200).json({ success: true, message: formattedMsg, duplicate: true, encrypted: isEncryptionEnabled() });
    }

    emitToConversation(conversationId, 'chat:message', { ...formattedMsg, threadId: String(threadId) });
    const senderUser = await User.findById(userId).select('name profileImage googleProfileImage avatar').lean();
    const senderName = senderUser?.name || 'Someone';
    const senderPhoto = senderUser?.profileImage || senderUser?.googleProfileImage || senderUser?.avatar || null;
    for (const pid of conversation.participants) {
      const pidStr = String(pid);
      if (pidStr === String(userId)) continue;
      emitToUser(pidStr, 'chat:conversation_update', { conversationId: String(conversationId), threadId: String(threadId), lastMessage: { content: (plainContent || '').slice(0, 80) || 'Attachment', sender: userId, createdAt: message.createdAt }, senderName });
      const msgPreview = (plainContent || '').slice(0, 80) || 'Sent an attachment';
      const notifMessage = `${senderName} sent a message regarding ${thread.product?.title || 'a product'}`;
      const avatarUrl = senderPhoto ? s3Service.toProxyUrl(senderPhoto) : null;
      createNotification({
        recipient: pidStr,
        sender: userId,
        type: 'message',
        message: notifMessage,
        pushMessage: msgPreview,
        title: `${senderName} sent a message${thread.product?.title ? ` regarding ${thread.product.title}` : ''}`,
        imageUrl: thread.product?.image || null,
        iconUrl: avatarUrl,
        senderName,
        metadata: { conversationId: String(conversationId), threadId: String(threadId), senderId: userId, senderName },
      })
        .then((n) => {
          if (n) {
            emitToUser(pidStr, 'notification:new', { _id: n._id, type: 'message', message: n.message, sender: { id: userId, name: senderName }, metadata: n.metadata, createdAt: n.createdAt });
          }
        })
        .catch(() => {});
      publishMessagePersisted({ messageId: String(message._id), conversationId: String(conversationId), threadId: String(threadId), senderId: String(userId), recipientId: pidStr, senderName, preview: (plainContent || '').slice(0, 80) || 'Attachment', productTitle: thread.product?.title || '' }).catch(() => {});
    }
    setNoCacheHeaders(res);
    return res.status(201).json({ success: true, message: formattedMsg, encrypted: isEncryptionEnabled() });
  } catch (err) {
    logger.error('[chat] sendMessage', { error: err.message });
    return res.status(err.statusCode || 500).json({ success: false, message: err.message || 'Failed to send message' });
  }
};

exports.uploadAttachment = async (req, res) => {
  try {
    const userId = req.user.id;
    const { conversationId } = req.params;
    if (!isValidId(conversationId)) return res.status(400).json({ success: false, message: 'Invalid conversationId' });
    if (!req.file) return res.status(400).json({ success: false, message: 'File required' });
    const conversation = await Conversation.findOne({ _id: conversationId, participants: userId }).lean();
    if (!conversation) return res.status(404).json({ success: false, message: 'Conversation not found' });
    const mimeType = String(req.file.mimetype || '').toLowerCase();
    const uploadResult = await s3Service.uploadChatAttachment(
      req.file.buffer,
      userId,
      mimeType,
      req.file.originalname || 'file',
    );
    const attachmentType =
      mimeType.startsWith('image/') ? 'image'
      : mimeType.startsWith('video/') ? 'video'
      : mimeType.startsWith('audio/') ? 'audio'
      : 'document';
    return res.status(200).json({
      success: true,
      attachment: {
        name: req.file.originalname || uploadResult.key,
        url: `/api/images/${uploadResult.key}`,
        key: uploadResult.key,
        mimeType,
        size: req.file.size,
        type: attachmentType,
      },
    });
  } catch (err) {
    logger.error('[chat] uploadAttachment', { error: err.message });
    return res.status(500).json({ success: false, message: err.message || 'Upload failed' });
  }
};

// Fan out `message:status:batch` so the original sender's bubble turns blue
// without a refetch. One event per sender, one per (sender, thread) bucket.
const emitReadBatchToSenders = (bySender, readerId, readAt) => {
  if (!bySender) return;
  for (const [senderId, entries] of Object.entries(bySender)) {
    if (!entries || entries.length === 0) continue;
    // Bucket by threadId so each batch is small and self-contained.
    const buckets = new Map();
    for (const e of entries) {
      const key = `${e.conversationId}::${e.threadId || ''}`;
      if (!buckets.has(key)) buckets.set(key, { conversationId: e.conversationId, threadId: e.threadId, ids: [] });
      buckets.get(key).ids.push(e.messageId);
    }
    for (const bucket of buckets.values()) {
      emitToUser(senderId, 'message:status:batch', {
        conversationId: bucket.conversationId,
        threadId:       bucket.threadId,
        status:         'read',
        messageIds:     bucket.ids,
        userId:         String(readerId),
        at:             readAt instanceof Date ? readAt.toISOString() : new Date().toISOString(),
      });
    }
  }
};

exports.markAsRead = async (req, res) => {
  try {
    const userId = req.user.id;
    const { conversationId } = req.params;
    if (!isValidId(conversationId)) return res.status(400).json({ success: false, message: 'Invalid conversationId' });
    const { notificationsMarked, bySender, readAt } = await chatService.markConversationRead(conversationId, userId);
    if (notificationsMarked > 0) {
      emitToUser(userId, 'notification:unread_adjust', { delta: -notificationsMarked });
    }
    emitReadBatchToSenders(bySender, userId, readAt);
    setNoCacheHeaders(res);
    return res.status(200).json({ success: true, notificationsMarked });
  } catch (err) { return res.status(500).json({ success: false, message: 'Failed to mark as read' }); }
};

exports.markThreadRead = async (req, res) => {
  try {
    const userId = req.user.id;
    const { threadId } = req.params;
    if (!isValidId(threadId)) return res.status(400).json({ success: false, message: 'Invalid threadId' });
    const thread = await ProductThread.findById(threadId).select('conversation').lean();
    if (!thread) return res.status(404).json({ success: false, message: 'Thread not found' });
    const { notificationsMarked, bySender, readAt } = await chatService.markThreadRead(String(thread.conversation), threadId, userId);
    if (notificationsMarked > 0) {
      emitToUser(userId, 'notification:unread_adjust', { delta: -notificationsMarked });
    }
    emitReadBatchToSenders(bySender, userId, readAt);
    setNoCacheHeaders(res);
    return res.status(200).json({ success: true, notificationsMarked });
  } catch (err) { return res.status(500).json({ success: false, message: 'Failed to mark as read' }); }
};

exports.deleteMessageForMe = async (req, res) => {
  try {
    const userId = req.user.id;
    const { conversationId, messageId } = req.params;
    if (!isValidId(conversationId) || !isValidId(messageId)) return res.status(400).json({ success: false, message: 'Invalid id' });
    const msg = await Message.findOneAndUpdate({ _id: messageId, conversation: conversationId }, { $addToSet: { deletedFor: userId } }, { new: true });
    if (!msg) return res.status(404).json({ success: false, message: 'Message not found' });
    return res.status(200).json({ success: true });
  } catch (err) { return res.status(500).json({ success: false, message: 'Failed to delete message' }); }
};

exports.deleteMessageForEveryone = async (req, res) => {
  try {
    const userId = req.user.id;
    const { conversationId, messageId } = req.params;
    if (!isValidId(conversationId) || !isValidId(messageId)) return res.status(400).json({ success: false, message: 'Invalid id' });
    const msg = await Message.findOne({ _id: messageId, conversation: conversationId });
    if (!msg) return res.status(404).json({ success: false, message: 'Message not found' });
    if (String(msg.sender) !== String(userId)) return res.status(403).json({ success: false, message: 'Can only delete your own messages' });
    const TWO_HOURS = 2 * 60 * 60 * 1000;
    if (Date.now() - new Date(msg.createdAt).getTime() > TWO_HOURS) return res.status(409).json({ success: false, message: 'Can only delete within 2 hours' });
    msg.deletedForEveryone = true;
    msg.content = encrypt('This message was deleted');
    msg.attachments = [];
    await msg.save();
    emitToConversation(conversationId, 'chat:message_deleted', { messageId, conversationId, threadId: String(msg.productThread || '') });
    return res.status(200).json({ success: true });
  } catch (err) { return res.status(500).json({ success: false, message: 'Failed to delete message' }); }
};

exports.searchMessages = async (req, res) => {
  try {
    const userId = req.user.id;
    const { conversationId } = req.params;
    if (!isValidId(conversationId)) return res.status(400).json({ success: false, message: 'Invalid conversationId' });
    const conversation = await Conversation.findOne({ _id: conversationId, participants: userId });
    if (!conversation) return res.status(404).json({ success: false, message: 'Conversation not found' });
    const threadId = req.query.threadId && isValidId(req.query.threadId) ? req.query.threadId : null;
    const messages = await chatService.searchMessages({ conversationId, userId, query: req.query.q, threadId, page: parseInt(req.query.page) || 1, limit: parseInt(req.query.limit) || 30 });
    return res.status(200).json({ success: true, messages: messages.map((m) => chatService.formatMessage(m, userId)) });
  } catch (err) {
    logger.error('[chat] searchMessages', { error: err.message });
    return res.status(err.statusCode || 500).json({ success: false, message: err.message || 'Search failed' });
  }
};

// ── OFFERS ────────────────────────────────────────────────────────────────────

exports.makeOffer = async (req, res) => {
  try {
    const userId = req.user.id;
    const { threadId } = req.params;
    if (!isValidId(threadId)) return res.status(400).json({ success: false, message: 'Invalid threadId' });
    const { amount, currency } = req.body;
    if (!amount || isNaN(Number(amount))) return res.status(400).json({ success: false, message: 'Valid amount required' });
    const { thread, message, plainLabel } = await chatService.makeOffer({ threadId, buyerId: userId, amount: Number(amount), currency: currency || '₹' });
    const formattedMsg = chatService.formatMessage(message, userId);
    emitToConversation(String(thread.conversation), 'chat:offer', { threadId: String(thread._id), message: formattedMsg, offerStatus: thread.offerStatus, activeOffer: thread.activeOffer });
    const buyer = await User.findById(userId).select('name profileImage googleProfileImage avatar').lean();
    const buyerPhoto = buyer?.profileImage || buyer?.googleProfileImage || buyer?.avatar || null;
    createNotification({
      recipient: String(thread.seller),
      sender: userId,
      type: 'offer_received',
      message: plainLabel,
      title: `💰 ${buyer?.name || 'Buyer'} made an offer${thread.product?.title ? ` on ${thread.product.title}` : ''}`,
      imageUrl: thread.product?.image || null,
      iconUrl: buyerPhoto ? s3Service.toProxyUrl(buyerPhoto) : null,
      senderName: buyer?.name,
      metadata: {
        conversationId: String(thread.conversation),
        threadId: String(thread._id),
        offerAmount: amount,
        listingId: thread.product?.productId ? String(thread.product.productId) : undefined,
        listingType: thread.product?.productType,
        senderId: userId,
        senderName: buyer?.name,
      },
    })
      .then((n) => {
        if (n) {
          emitToUser(String(thread.seller), 'notification:new', { _id: n._id, type: 'offer_received', message: plainLabel, read: false, sender: { id: userId, name: buyer?.name }, metadata: n.metadata, createdAt: n.createdAt });
        }
      })
      .catch(() => {});
    publishOfferEvent({ type: 'offer.made', threadId: String(thread._id), buyerId: userId, sellerId: String(thread.seller), amount, currency: currency || '₹', productTitle: thread.product?.title }).catch(() => {});
    return res.status(200).json({ success: true, thread, message: formattedMsg });
  } catch (err) {
    logger.error('[chat] makeOffer', { error: err.message });
    return res.status(err.statusCode || 500).json({ success: false, message: err.message || 'Failed to make offer' });
  }
};

exports.acceptOffer = async (req, res) => {
  try {
    const userId = req.user.id;
    const { threadId } = req.params;
    if (!isValidId(threadId)) return res.status(400).json({ success: false, message: 'Invalid threadId' });
    const { thread, message } = await chatService.respondToOffer({ threadId, sellerId: userId, accept: true });
    const formattedMsg = chatService.formatMessage(message, userId);
    emitToConversation(String(thread.conversation), 'chat:offer_update', { threadId: String(thread._id), message: formattedMsg, offerStatus: thread.offerStatus, accepted: true });
    notifyOfferResult({ thread, sellerId: userId, accepted: true }).catch(() => {});
    publishOfferEvent({ type: 'offer.accepted', threadId: String(thread._id), sellerId: userId, buyerId: String(thread.buyer), amount: thread.activeOffer?.amount }).catch(() => {});
    return res.status(200).json({ success: true, thread, message: formattedMsg });
  } catch (err) { return res.status(err.statusCode || 500).json({ success: false, message: err.message || 'Failed to accept offer' }); }
};

exports.declineOffer = async (req, res) => {
  try {
    const userId = req.user.id;
    const { threadId } = req.params;
    if (!isValidId(threadId)) return res.status(400).json({ success: false, message: 'Invalid threadId' });
    const { thread, message } = await chatService.respondToOffer({ threadId, sellerId: userId, accept: false });
    const formattedMsg = chatService.formatMessage(message, userId);
    emitToConversation(String(thread.conversation), 'chat:offer_update', { threadId: String(thread._id), message: formattedMsg, offerStatus: thread.offerStatus, accepted: false });
    notifyOfferResult({ thread, sellerId: userId, accepted: false }).catch(() => {});
    publishOfferEvent({ type: 'offer.declined', threadId: String(thread._id), sellerId: userId, buyerId: String(thread.buyer) }).catch(() => {});
    return res.status(200).json({ success: true, thread, message: formattedMsg });
  } catch (err) { return res.status(err.statusCode || 500).json({ success: false, message: err.message || 'Failed to decline offer' }); }
};

// ── UNREAD ────────────────────────────────────────────────────────────────────

exports.getUnreadCount = async (req, res) => {
  try {
    const userId = req.user.id;
    const conversations = await Conversation.find({ participants: userId }).select('unreadCounts').lean();
    let total = 0;
    for (const c of conversations) { total += c.unreadCounts?.[userId] || 0; }
    setNoCacheHeaders(res);
    return res.status(200).json({ success: true, unreadCount: total });
  } catch (err) { return res.status(500).json({ success: false, message: 'Failed to get unread count' }); }
};

// Legacy compat
exports.makeOfferLegacy = exports.makeOffer;

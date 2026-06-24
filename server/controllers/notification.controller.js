const Notification = require("../models/notification.model");
const mongoose = require("mongoose");
const { logger } = require("../utils/logger");
const { encrypt, decrypt, isEncryptionEnabled } = require("../services/encryption.service");
const { dispatchInAppNotificationPush } = require("../services/notification-push.service");

// Helper: set no-cache headers on sensitive responses
const setNoCacheHeaders = (res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
};

// ==================== GET NOTIFICATIONS ====================
exports.getNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);
    const skip = (page - 1) * limit;

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find({ recipient: userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("sender", "name profileImage googleProfileImage avatar provider")
        .lean(),
      Notification.countDocuments({ recipient: userId }),
      Notification.countDocuments({ recipient: userId, read: false }),
    ]);

    // Attach sender profile image URL and decrypt message
    const formatted = notifications.map((n) => {
      const s = n.sender;
      const profileImageUrl = s
        ? s.profileImage || s.googleProfileImage || s.avatar || null
        : null;
      return {
        ...n,
        message: (() => { try { return decrypt(n.message); } catch { return n.message; } })(),
        sender: s
          ? {
              id: s._id,
              name: s.name,
              profileImageUrl,
              provider: s.provider,
            }
          : null,
      };
    });

    setNoCacheHeaders(res);
    res.status(200).json({
      success: true,
      notifications: formatted,
      encrypted: isEncryptionEnabled(),
      unreadCount,
      pagination: {
        total,
        page,
        totalPages: Math.ceil(total / limit),
        limit,
        hasMore: page * limit < total,
      },
    });
  } catch (error) {
    logger.error("Get notifications error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch notifications" });
  }
};

// ==================== GET UNREAD COUNT ====================
exports.getUnreadCount = async (req, res) => {
  try {
    const count = await Notification.countDocuments({
      recipient: req.user.id,
      read: false,
    });
    setNoCacheHeaders(res);
    res.status(200).json({ success: true, unreadCount: count });
  } catch (error) {
    logger.error("Get unread count error:", error);
    res.status(500).json({ success: false, message: "Failed to get unread count" });
  }
};

// ==================== MARK AS READ ====================
exports.markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid notification id" });
    }
    const notification = await Notification.findOneAndUpdate(
      { _id: id, recipient: req.user.id },
      { read: true },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ success: false, message: "Notification not found" });
    }

    res.status(200).json({ success: true, notification });
  } catch (error) {
    logger.error("Mark notification read error:", error);
    res.status(500).json({ success: false, message: "Failed to mark notification as read" });
  }
};

// ==================== MARK ALL AS READ ====================
exports.markAllAsRead = async (req, res) => {
  try {
    await Notification.updateMany(
      { recipient: req.user.id, read: false },
      { read: true }
    );
    res.status(200).json({ success: true, message: "All notifications marked as read" });
  } catch (error) {
    logger.error("Mark all notifications read error:", error);
    res.status(500).json({ success: false, message: "Failed to mark all as read" });
  }
};

// ==================== DELETE NOTIFICATION ====================
exports.deleteNotification = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid notification id" });
    }
    const notification = await Notification.findOneAndDelete({
      _id: req.params.id,
      recipient: req.user.id,
    });

    if (!notification) {
      return res.status(404).json({ success: false, message: "Notification not found" });
    }

    res.status(200).json({ success: true, message: "Notification deleted" });
  } catch (error) {
    logger.error("Delete notification error:", error);
    res.status(500).json({ success: false, message: "Failed to delete notification" });
  }
};

// ==================== DELETE ALL NOTIFICATIONS ====================
exports.deleteAllNotifications = async (req, res) => {
  try {
    const result = await Notification.deleteMany({ recipient: req.user.id });
    res.status(200).json({ success: true, message: "All notifications cleared", deletedCount: result.deletedCount });
  } catch (error) {
    logger.error("Delete all notifications error:", error);
    res.status(500).json({ success: false, message: "Failed to clear notifications" });
  }
};

// ==================== TRACK NOTIFICATION EVENT ====================
exports.trackEvent = async (req, res) => {
  try {
    const { notificationId, event, actionId, timestamp } = req.body;

    if (!notificationId || !event) {
      return res.status(400).json({ success: false, message: "notificationId and event are required" });
    }

    // FCM-only pushes use synthetic ids (msg_*, offer_*) — skip DB analytics update.
    if (!mongoose.Types.ObjectId.isValid(notificationId)) {
      return res.status(200).json({ success: true, skipped: true });
    }

    const ts = timestamp ? new Date(timestamp) : new Date();

    const update = {};
    switch (event) {
      case "shown":
        update.shownAt = ts;
        break;
      case "clicked":
        update.clickedAt = ts;
        update.read = true;
        break;
      case "action_clicked":
        update.clickedAt = ts;
        update.read = true;
        if (actionId) update.ctaClicked = actionId;
        break;
      case "dismissed":
        update.dismissedAt = ts;
        break;
      default:
        return res.status(400).json({ success: false, message: "Unknown event type" });
    }

    await Notification.findByIdAndUpdate(notificationId, { $set: update });
    res.status(200).json({ success: true });
  } catch (error) {
    logger.error("Track notification event error:", error);
    res.status(500).json({ success: false, message: "Failed to track event" });
  }
};

// ==================== REGISTER FCM TOKEN ====================
exports.registerFcmToken = async (req, res) => {
  try {
    const fcmToken = typeof req.body?.fcmToken === 'string' ? req.body.fcmToken.trim() : '';
    if (!fcmToken || fcmToken.length > 500) {
      return res.status(400).json({ success: false, message: 'Invalid FCM token' });
    }

    const User = require('../models/user.model');
    await User.updateOne({ _id: req.user.id }, { fcmToken });

    logger.info('[FCM] Device token registered', {
      userId: req.user.id,
      tokenPrefix: fcmToken.slice(0, 20),
    });

    setNoCacheHeaders(res);
    return res.status(200).json({ success: true });
  } catch (error) {
    logger.error('Register FCM token error:', error);
    return res.status(500).json({ success: false, message: 'Failed to register FCM token' });
  }
};

// ==================== UNREGISTER FCM TOKEN ====================
// Clears the user's device token so absolutely no FCM pushes can be delivered.
// Called when a user turns OFF push notifications in settings.
exports.unregisterFcmToken = async (req, res) => {
  try {
    const User = require('../models/user.model');
    await User.updateOne(
      { _id: req.user.id },
      { $unset: { fcmToken: '' } },
    );

    logger.info('[FCM] Device token cleared', { userId: req.user.id });

    setNoCacheHeaders(res);
    return res.status(200).json({ success: true });
  } catch (error) {
    logger.error('Unregister FCM token error:', error);
    return res.status(500).json({ success: false, message: 'Failed to unregister FCM token' });
  }
};

// ==================== CREATE NOTIFICATION (internal helper) ====================
exports.createNotification = async ({
  recipient,
  sender,
  type,
  message,
  metadata = {},
  allowSelf = false,
  title,
  imageUrl,
  iconUrl,
  senderName,
  skipPush = false,
  pushMessage,
}) => {
  try {
    // Guard against missing recipient/sender
    if (!recipient || !sender) return null;

    // Don't notify yourself
    if (!allowSelf && recipient.toString() === sender.toString()) return null;

    // Encrypt notification message before storing
    const encryptedMessage = encrypt(message);

    const notification = await Notification.create({
      recipient,
      sender,
      type,
      message: encryptedMessage,
      metadata,
    });

    logger.info("🔔 Notification created", { type, recipient, sender });

    if (!skipPush) {
      const pushSent = await dispatchInAppNotificationPush({
        notificationId: notification._id,
        recipientId: recipient,
        notifType: type,
        message: pushMessage || message,
        title,
        imageUrl: imageUrl || metadata?.listingImage || metadata?.imageUrl || null,
        iconUrl: iconUrl || metadata?.senderPhoto || metadata?.iconUrl || null,
        metadata,
        senderName: senderName || metadata?.senderName,
      });

      if (pushSent) {
        await Notification.findByIdAndUpdate(notification._id, { $set: { pushSent: true } });
      }
    }

    return notification;
  } catch (error) {
    logger.error("Create notification error:", error);
    return null;
  }
};

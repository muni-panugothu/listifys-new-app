const User = require("../models/user.model.js");
const { createNotification } = require("../controllers/notification.controller.js");
const { getIO } = require("../config/socket");
const { decrypt } = require("./encryption.service.js");
const { logger } = require("../utils/logger");

/**
 * Notify all followers of a seller when they post a new listing.
 * Creates a DB notification for each follower and pushes a real-time
 * socket event so the UI updates instantly (like Amazon/Flipkart).
 *
 * @param {string} sellerId   - The ObjectId of the user who posted
 * @param {object} listing    - The newly created listing object
 * @param {string} listingType - "forsale" | "electronics" | "vehicles"
 */
async function notifyFollowersOfNewListing(sellerId, listing, listingType) {
  try {
    const seller = await User.findById(sellerId).select(
      "followers name email firstName lastName profileImage googleProfileImage avatar",
    );
    if (!seller || !seller.followers || seller.followers.length === 0) return;

    const sellerName = seller.firstName
      ? `${seller.firstName} ${seller.lastName || ""}`.trim()
      : seller.name || seller.email?.split("@")[0] || "Someone";

    const listingImage = listing.images?.[0] || listing.image || listing.thumbnail || null;
    const priceLabel =
      listing.price != null && !Number.isNaN(Number(listing.price))
        ? `${listing.currency || "₹"}${Number(listing.price).toLocaleString("en-IN")}`
        : null;
    const message = `${sellerName} posted: "${listing.title}"`;
    // Premium-style push body: title + price (like OLX/OfferUp "seller you follow" alerts).
    const pushBody = priceLabel ? `${listing.title} · ${priceLabel}` : listing.title || message;
    const io = getIO();

    const notificationPromises = seller.followers.map(async (followerId) => {
      const notification = await createNotification({
        recipient: followerId,
        sender: sellerId,
        type: "new_listing",
        message,
        pushMessage: pushBody,
        title: `🆕 New from ${sellerName}`,
        imageUrl: listingImage,
        iconUrl: seller.profileImage || seller.googleProfileImage || seller.avatar || null,
        senderName: sellerName,
        metadata: {
          listingId: listing._id,
          listingType,
          listingTitle: listing.title,
          listingImage,
          listingPrice: listing.price,
          sellerName,
        },
      });

      if (notification) {
        if (io) {
          const populated = await notification.populate(
            "sender",
            "name profileImage googleProfileImage avatar provider firstName lastName",
          );
          const s = populated.sender;
          const profileImg = s.profileImage || s.googleProfileImage || s.avatar || null;
          io.to(`user:${followerId}`).emit("notification:new", {
            _id: populated._id,
            type: populated.type,
            message: decrypt(populated.message),
            read: false,
            createdAt: populated.createdAt,
            metadata: populated.metadata,
            sender: {
              _id: s._id,
              name: s.firstName ? `${s.firstName} ${s.lastName || ""}`.trim() : s.name || "User",
              profileImage: profileImg,
              profileImageUrl: profileImg,
            },
          });
        }
      }
    });

    await Promise.allSettled(notificationPromises);
    logger.info(`📢 Notified ${seller.followers.length} followers of new ${listingType} listing`, {
      sellerId, listingId: listing._id,
    });
  } catch (err) {
    logger.error("[notifyFollowers] Error:", err.message);
  }
}

module.exports = { notifyFollowersOfNewListing };

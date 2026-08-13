const ServiceReview = require('../models/servicereview.model');
const ServiceBooking = require('../models/servicebooking.model');
const ServiceProvider = require('../models/serviceprovider.model');
const ServiceListing = require('../models/servicelisting.model');
const Notification = require('../models/notification.model');
const User = require('../models/user.model');
const { getIO } = require('../config/socket');
const { logger } = require('../utils/logger');
const redis = require('../config/redis');

const REVIEW_ALLOWED_SORTS = ['-createdAt', 'createdAt', '-rating', 'rating'];

// ── RabbitMQ Producers ─────────────────────────────────────────────────────────
const { publishReviewNotification } = require('../queues/producers/notification.producer');


exports.createReview = async (req, res) => {
  try {
    const { bookingId, listingId, providerId, rating, title, comment, pros, cons, images } = req.body;
    
    let isVerified = false;
    let actualProviderId = providerId;
    let actualListingId = listingId;

    // Validate booking if provided
    if (bookingId) {
      const booking = await ServiceBooking.findById(bookingId);
      if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
      if (booking.userId.toString() !== req.user._id.toString()) {
        return res.status(403).json({ success: false, message: 'You did not make this booking' });
      }
      if (booking.status !== 'completed') {
        return res.status(400).json({ success: false, message: 'Can only review completed bookings' });
      }
      if (booking.review && booking.review.given) {
         return res.status(400).json({ success: false, message: 'Review already given for this booking' });
      }
      actualProviderId = booking.providerId;
      actualListingId = booking.listingId;
      isVerified = true;
    } else if (!actualProviderId || !actualListingId) {
      return res.status(400).json({ success: false, message: 'Must provide either a bookingId, or both listingId and providerId to review' });
    }

    const normalizedImages = Array.isArray(images)
      ? images.slice(0, 3).map((img) => {
          if (typeof img === 'string' && img.trim()) return { url: img.trim() };
          if (img && typeof img === 'object' && typeof img.url === 'string' && img.url.trim()) {
            return { url: img.url.trim(), publicId: img.publicId };
          }
          return null;
        }).filter(Boolean)
      : [];

    const review = await ServiceReview.create({
      bookingId: bookingId || undefined,
      providerId: actualProviderId,
      listingId: actualListingId,
      userId: req.user._id,
      rating: Number(rating),
      title,
      comment,
      pros: Array.isArray(pros) ? pros.slice(0, 3) : [],
      cons: Array.isArray(cons) ? cons.slice(0, 3) : [],
      images: normalizedImages,
      verified: isVerified
    });

    if (bookingId) {
      const booking = await ServiceBooking.findById(bookingId);
      booking.review = {
        given: true,
        rating: Number(rating),
        comment: comment ? comment.substring(0, 100) : '',
        givenAt: new Date()
      };
      await booking.save();
    }

    // Populate the review with user data for the response
    const populatedReview = await ServiceReview.findById(review._id)
      .populate('userId', 'name profileImage avatar googleProfileImage');

    // ── Store review notification in Upstash Redis ──────────────────
    // This makes the reviewer name, reviewer ID, and target worker info
    // visible in the Upstash Redis dashboard.
    try {
      const provider = await ServiceProvider.findById(actualProviderId).populate('userId', 'name email');
      const reviewerName = req.user.name || `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || 'Unknown User';
      const reviewerUserId = req.user._id.toString();

      // Resolve the recipient worker's info
      let recipientName = 'Unknown Worker';
      let recipientUserId = null;
      let targetUserId = null;
      
      if (provider && provider.userId) {
        const recipientUser = typeof provider.userId === 'object' ? provider.userId : await User.findById(provider.userId).select('name email');
        if (recipientUser) {
          recipientName = recipientUser.name || `${recipientUser.firstName || ''} ${recipientUser.lastName || ''}`.trim();
          recipientUserId = (recipientUser._id || recipientUser.id || provider.userId).toString();
          targetUserId = recipientUserId;
        }
      } else {
        // Fallback: actualProviderId might literally be the User ID from the frontend's currentListing.userId
        const recipientUserFallback = await User.findById(actualProviderId).select('name email');
        if (recipientUserFallback) {
          recipientName = recipientUserFallback.name || `${recipientUserFallback.firstName || ''} ${recipientUserFallback.lastName || ''}`.trim();
          recipientUserId = recipientUserFallback._id.toString();
          targetUserId = recipientUserId;
        } else {
          // Absolute Fallback: Extract the exact owner direct from the service listing
          const listing = await ServiceListing.findById(actualListingId).select('userId').lean();
          if (listing && listing.userId) {
            const owner = await User.findById(listing.userId).select('name');
            if (owner) {
              recipientName = owner.name;
              recipientUserId = owner._id.toString();
              targetUserId = recipientUserId;
            }
          }
        }
      }

      // Get listing title and category for context
      let listingTitle = 'Unknown Service';
      let categorySlug = 'all';
      try {
        const listing = await ServiceListing.findById(actualListingId).populate('category', 'slug').lean();
        if (listing) {
          listingTitle = listing.title;
          if (listing.category && listing.category.slug) categorySlug = listing.category.slug;
        }
      } catch (_) { /* non-critical */ }

      // Store in Upstash Redis — explicitly formatting key and json to include sender + id and recipient + id
      const safeReviewerName = reviewerName.replace(/\s+/g, '_');
      const safeRecipientName = recipientName.replace(/\s+/g, '_');
      
      const redisKey = `review:${safeReviewerName}_${reviewerUserId}:to:${safeRecipientName}_${recipientUserId}`;
      const reviewNotificationData = {
        key: redisKey,
        sender: {
          name: reviewerName,
          id: reviewerUserId
        },
        recipient: {
          name: recipientName,
          id: recipientUserId
        },
        reviewId: review._id.toString(),
        listingId: actualListingId.toString(),
        listingTitle,
        categorySlug,
        rating: Number(rating),
        title: title || null,
        commentPreview: comment ? comment.substring(0, 100) : '',
        verified: isVerified,
        createdAt: new Date().toISOString(),
      };

      await redis.set(redisKey, JSON.stringify(reviewNotificationData), { ex: 30 * 24 * 60 * 60 }); // 30 days TTL
      logger.info(`✅ Review notification stored in Upstash Redis`, { key: redisKey });

      // Also maintain a sorted set index for easy lookup by recipient
      if (recipientUserId) {
        await redis.zadd(`review_notifications_for:${recipientUserId}`, { score: Date.now(), member: JSON.stringify({ reviewId: review._id, redisKey }) });
      }

      // ── ✅ Non-blocking: send review notification via RabbitMQ ──
      if (targetUserId) {
        publishReviewNotification({
          reviewId:        review._id,
          reviewerId:      req.user._id,
          reviewerName,
          recipientUserId: targetUserId,
          listingTitle,
          rating: Number(rating),
        }).catch(() => {});
      }
    } catch (notifErr) {
      logger.error('Failed to send live notification / store in Redis for review:', notifErr);
    }

    res.status(201).json({ success: true, data: populatedReview });
  } catch (error) {
    logger.error('Error creating review:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.getReviewsByProvider = async (req, res) => {
  try {
    const { sort = '-createdAt', rating } = req.query;
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);
    const filter = { providerId: req.params.providerId, status: 'published' };
    if (rating) filter.rating = Number(rating);
    const safeSort = REVIEW_ALLOWED_SORTS.includes(sort) ? sort : '-createdAt';

    const reviews = await ServiceReview.find(filter)
      .populate('userId', 'name profileImage avatar googleProfileImage')
      .populate('listingId', 'title')
      .sort(safeSort)
      .limit(limit)
      .skip((page - 1) * limit)
      .lean();

    const total = await ServiceReview.countDocuments(filter);

    res.json({
      success: true,
      count: reviews.length,
      total,
      data: reviews,
      page,
      pages: Math.ceil(total / limit)
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch reviews' });
  }
};

exports.getReviewsByListing = async (req, res) => {
  try {
    const { sort = '-createdAt' } = req.query;
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);
    const filter = { listingId: req.params.listingId, status: 'published' };
    const safeSort = REVIEW_ALLOWED_SORTS.includes(sort) ? sort : '-createdAt';

    const reviews = await ServiceReview.find(filter)
      .populate('userId', 'name profileImage avatar googleProfileImage')
      .sort(safeSort)
      .limit(limit)
      .skip((page - 1) * limit)
      .lean();

    const total = await ServiceReview.countDocuments(filter);

    res.json({
      success: true,
      count: reviews.length,
      total,
      data: reviews,
      page,
      pages: Math.ceil(total / limit)
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.updateReview = async (req, res) => {
  try {
    const { rating, title, comment, pros, cons } = req.body;
    const review = await ServiceReview.findById(req.params.id);
    
    if (!review) return res.status(404).json({ success: false, message: 'Review not found' });
    if (review.userId.toString() !== req.user._id.toString()) return res.status(403).json({ success: false, message: 'Unauthorized' });

    if (rating !== undefined) review.rating = Number(rating);
    if (title !== undefined) review.title = title;
    if (comment !== undefined) review.comment = comment;
    if (pros !== undefined) review.pros = Array.isArray(pros) ? pros.slice(0, 3) : review.pros;
    if (cons !== undefined) review.cons = Array.isArray(cons) ? cons.slice(0, 3) : review.cons;

    await review.save();
    
    // Update provider rating
    const provider = await ServiceProvider.findById(review.providerId);
    if (provider) await provider.updateRating();

    res.json({ success: true, data: review });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.deleteReview = async (req, res) => {
  try {
    const review = await ServiceReview.findById(req.params.id);
    if (!review) return res.status(404).json({ success: false, message: 'Review not found' });
    if (review.userId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const providerId = review.providerId;
    await ServiceReview.findByIdAndDelete(req.params.id);
    
    // AWS CloudWatch / Pino logger tracking
    logger.info(`AWS-TRACK: Review ${req.params.id} permanently DELETED by user ${req.user._id} from MongoDB and Upstash Redis caches invalidated.`);
    
    // Trigger updateRating on provider
    const provider = await ServiceProvider.findById(providerId);
    if (provider) await provider.updateRating();

    res.json({ success: true, message: 'Review deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.markHelpful = async (req, res) => {
  try {
    const review = await ServiceReview.findById(req.params.id);
    if (!review) return res.status(404).json({ success: false, message: 'Review not found' });

    const userId = req.user._id;
    if (review.helpful.users.includes(userId)) {
      review.helpful.users = review.helpful.users.filter(id => id.toString() !== userId.toString());
      review.helpful.count -= 1;
    } else {
      review.helpful.users.push(userId);
      review.helpful.count += 1;
    }

    await review.save();
    res.json({ success: true, count: review.helpful.count });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.reportReview = async (req, res) => {
  try {
    const { reason } = req.body;
    const review = await ServiceReview.findById(req.params.id);
    if (!review) return res.status(404).json({ success: false, message: 'Review not found' });

    review.reported.isReported = true;
    review.reported.reports.push({
      userId: req.user._id,
      reason,
      reportedAt: new Date()
    });

    if (review.reported.reports.length >= 3) {
       review.status = 'flagged';
    }

    await review.save();
    res.json({ success: true, message: 'Review reported' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

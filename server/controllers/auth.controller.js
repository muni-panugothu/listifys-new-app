const User = require("../models/user.model");
const jwt = require("jsonwebtoken");
const RedisService = require("../services/redis.service");
const EmailService = require("../services/email.service");
const OTPGenerator = require("../utils/otpGenerator");
const argon2 = require("argon2");
const { logger } = require("../utils/logger");
const { invalidateEntityCache } = require("../middleware/cache.middleware");
const { handleGoogleAuth } = require("../services/googleAuth.OAuth");
const TwilioService = require("../services/twilio.service");
const TwilioVerify = require("../services/twilio-verify.service");
const passwordSecurity = require("../utils/passwordSecurity");
const { createNotification } = require("./notification.controller");
const { getIO } = require("../config/socket");
const deviceService = require("../services/device.service");
const s3Service = require("../services/s3.service");
const securityNotificationService = require("../services/security-notification.service");
const crypto = require("crypto");
const mongoose = require("mongoose");
const redis = require("../config/redis");
const SellerReview = require("../models/seller-review.model");
const { countUserListings } = require("../utils/listing-models");
const { invalidateAuthCache } = require("../middleware/auth.middleware");

// ── RabbitMQ Producers (non-blocking async side-effects) ───────────────────────
const {
  publishOTPEmail,
  publishWelcomeEmail,
  publishLoginNotificationEmail,
  publishPasswordResetSuccessEmail,
  publishSecurityAlert,
  publishAuditLog,
} = require('../queues/producers/auth.producer');
const { dispatchOtpEmail } = require('../utils/otpEmailDispatch');

// ==================== TOKEN UTILITIES (single source of truth) ====================
const {
  generateAccessToken,
  generateRefreshToken,
  storeRefreshToken,
  verifyRefreshToken,
  revokeRefreshToken,
  revokeRefreshTokenByJti,
  revokeAllUserTokens,
  setTokenCookies,
  clearTokenCookies,
  refreshTokens,
  maskOtp,
} = require("../utils/tokenUtils");

const PROFILE_CACHE_TTL_SECONDS = 300;
const DEVICES_CACHE_TTL_SECONDS = 180;
const ACTIVITY_CACHE_TTL_SECONDS = 180;

const getResolvedProfileImage = (user) =>
  s3Service.toProxyUrl(
    user?.getProfileImage
      ? user.getProfileImage()
      : user?.profileImage || user?.googleProfileImage || user?.avatar || null,
  );

const readJsonCache = async (key) => {
  try {
    const cached = await redis.get(key);
    if (!cached) return null;
    return typeof cached === 'string' ? JSON.parse(cached) : cached;
  } catch (_) {
    return null;
  }
};

const writeJsonCache = async (key, value, ttlSeconds) => {
  try {
    await redis.setex(key, ttlSeconds, JSON.stringify(value));
  } catch (_) {
    // Non-fatal cache path.
  }
};

const invalidateAccountCaches = async (userId) => {
  try {
    const id = String(userId);
    invalidateAuthCache(id);
    await Promise.all([
      redis.del(`profile:${id}`),        // legacy key (kept for backward compat)
      redis.del(`profile_meta:${id}`),   // new metadata cache
      redis.del(`counts:${id}`),         // new counts cache
      redis.del(`devices:${id}`),
      redis.del(`activity:${id}`),
      redis.del(`settings:${id}`),
    ]);
  } catch (_) {
    // Non-fatal cache path.
  }
};

// ==================== HELPER FUNCTIONS ====================

/**
 * Send token response with HTTP-only cookies
 */
const sendTokenResponse = async (user, statusCode, res, message) => {
  try {
    const accessToken = generateAccessToken(user._id, res.req);
    const refreshToken = generateRefreshToken(user._id);

    const stored = await storeRefreshToken(user._id.toString(), refreshToken, res.req);
    if (!stored) {
      logger.error('Failed to store refresh token in Redis', { userId: user._id });
      clearTokenCookies(res);
      return res.status(503).json({
        success: false,
        message: 'Authentication service temporarily unavailable. Please try again.',
      });
    }
    setTokenCookies(res, accessToken, refreshToken);

    const profileImageUrl = s3Service.toProxyUrl(
      user.getProfileImage ? user.getProfileImage() : 
      (user.profileImage || user.googleProfileImage || user.avatar || null)
    );

    const userResponse = {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      provider: user.provider,
      hasPassword: !!user.password,
      avatar: user.avatar,
      profileImage: s3Service.toProxyUrl(user.profileImage) || null,
      profileImageKey: user.profileImageKey || null,
      googleProfileImage: user.googleProfileImage || null,
      isVerified: user.isVerified,
      profileImageUrl: profileImageUrl,
      passwordExpiration: user.passwordNeedsChange
        ? user.passwordNeedsChange()
        : null,
      devices: user.devices
        ? user.devices.map((d) => deviceService.formatDeviceForDisplay(d))
        : [],
    };

    logger.info("✅ Token response sent with HTTP-only cookies", {
      userId: user._id,
    });

    res.status(statusCode).json({
      success: true,
      message,
      user: userResponse,
      accessToken,
      refreshToken,
    });
  } catch (error) {
    logger.error("❌ Error sending token response:", error);
    res.status(500).json({
      success: false,
      message: "Error generating authentication tokens",
    });
  }
};

// ==================== FIXED: LOGIN WITH PROPER TOKEN STORAGE ====================
exports.login = async (req, res) => {
  try {
    const { email, phone, identity, password } = req.body;
    const invalidCredentialsMessage =
      "Invalid email or password. Please try again.";
    const rawIdentity = String(identity || email || phone || '').trim();
    const isEmailIdentity = rawIdentity.includes('@');
    const normalizedEmail = isEmailIdentity ? rawIdentity.toLowerCase() : null;
    const normalizedPhone = !isEmailIdentity
      ? TwilioService.normalizePhone(rawIdentity)
      : null;

    logger.info("🔍 Login attempt for:", {
      identity: isEmailIdentity ? normalizedEmail : normalizedPhone,
      isEmailIdentity,
    });

    if (!rawIdentity || !password) {
      return res.status(400).json({
        success: false,
        message: "Please provide identity and password",
      });
    }

    const findQuery = isEmailIdentity
      ? { email: normalizedEmail }
      : {
          $or: [
            { phone: normalizedPhone },
            { phone: rawIdentity },
            { phone: `+${rawIdentity.replace(/^\+/, '')}` },
          ],
        };

    const user = await User.findOne(findQuery).select(
      "+password +passwordHistory +devices +loginHistory",
    );

    if (!user) {
      logger.userLog('login', {
        identity: rawIdentity,
        ip: req.ip,
        userAgent: req.get('user-agent'),
        success: false,
        reason: 'user_not_found',
      });
      return res.status(401).json({
        success: false,
        message: invalidCredentialsMessage,
        code: "INVALID_CREDENTIALS",
      });
    }

    // Google accounts can use email/password login only after setting a password.
    if (user.provider === "google" && !user.password) {
      logger.userLog('login', {
        identity: rawIdentity,
        ip: req.ip,
        userAgent: req.get('user-agent'),
        success: false,
        reason: 'google_provider_password_login',
      });
      return res.status(401).json({
        success: false,
        message: invalidCredentialsMessage,
        code: "INVALID_CREDENTIALS",
      });
    }

    if (!user.password) {
      logger.userLog('login', {
        identity: rawIdentity,
        ip: req.ip,
        userAgent: req.get('user-agent'),
        success: false,
        reason: 'password_not_set',
      });
      return res.status(401).json({
        success: false,
        message: invalidCredentialsMessage,
        code: "INVALID_CREDENTIALS",
      });
    }

    // Check account lockout BEFORE expensive password comparison
    if (user.isLocked && user.isLocked()) {
      if (user.addLoginHistory) {
        const failLocation = deviceService.getLocationFromIP(req.ip);
        await user.addLoginHistory({
          ipAddress: req.ip,
          userAgent: req.get("user-agent"),
          location: failLocation,
          loginType: "email",
          success: false,
          failureReason: "account_locked",
        });
      }
      return res.status(423).json({
        success: false,
        message:
          "Account is temporarily locked due to too many failed attempts. Please try again after 5 minutes or reset your password.",
        locked: true,
        code: 'ACCOUNT_LOCKED',
      });
    }

    const isPasswordMatch = await user.comparePassword(password);

    if (!isPasswordMatch) {
      // Increment failed login attempts (locks after 5 failures)
      if (user.incrementLoginAttempts) {
        await user.incrementLoginAttempts();
      }

      // Track wrong password attempts in Redis with full details
      const currentAttempts = (user.loginAttempts || 0) + 1;
      await RedisService.trackWrongPasswordAttempt({
        userId: user._id.toString(),
        name: user.name,
        email: user.email,
        phone: user.phone || null,
        provider: user.provider || "local",
        currentAttempt: currentAttempts,
        ip: req.ip,
        userAgent: req.get("user-agent"),
      });

      // Store blocked user details in Redis if account just got locked
      if (currentAttempts >= 5) {
        await RedisService.storeBlockedUser({
          userId: user._id.toString(),
          name: user.name,
          email: user.email,
          phone: user.phone || null,
          failedAttempts: currentAttempts,
          ip: req.ip,
          userAgent: req.get("user-agent"),
        });
      }

      // Log failed login attempt
      if (user.addLoginHistory) {
        const failLocation = deviceService.getLocationFromIP(req.ip);
        await user.addLoginHistory({
          ipAddress: req.ip,
          userAgent: req.get("user-agent"),
          location: failLocation,
          loginType: "email",
          success: false,
          failureReason: "invalid_password",
        });
      }

      // Log security event
      if (user.addSecurityLog) {
        await user.addSecurityLog(
          "failed_login",
          req.ip,
          req.get("user-agent"),
          { reason: "invalid_password", attempt: currentAttempts }
        );
      }

      logger.userLog('login', {
        identity: rawIdentity,
        ip: req.ip,
        userAgent: req.get('user-agent'),
        success: false,
        reason: 'invalid_password',
      });
      return res.status(401).json({
        success: false,
        message: invalidCredentialsMessage,
        code: "INVALID_CREDENTIALS",
      });
    }

    // Generate tokens (pass req for fingerprint binding)
    const accessToken = generateAccessToken(user._id, req);
    const refreshToken = generateRefreshToken(user._id);
    const decoded = jwt.decode(refreshToken);

    // Create device session
    const deviceSession = await deviceService.createDeviceSession(req, decoded.jti);

    // Update user devices
    await user.updateDeviceSession(deviceSession, decoded.jti);

    // Add to login history
    await user.addLoginHistory({
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
      deviceId: deviceSession.deviceId,
      deviceName: deviceSession.deviceName,
      location: deviceSession.location,
      loginType: isEmailIdentity ? "email" : "phone",
      success: true,
    });

    if (user.resetLoginAttempts) {
      await user.resetLoginAttempts();
    }

    // Clear blocked user record and wrong password tracking from Redis
    const redisIdentityKey = isEmailIdentity
      ? normalizedEmail
      : String(normalizedPhone || rawIdentity).replace(/^\+/, '');
    await RedisService.removeBlockedUser(redisIdentityKey);
    await RedisService.clearWrongPasswordAttempts(redisIdentityKey);

    // Store tokens in Redis
    const stored = await storeRefreshToken(user._id.toString(), refreshToken, req);
    if (!stored) {
      logger.error('Failed to store refresh token in Redis', { userId: user._id });
      clearTokenCookies(res);
      return res.status(503).json({
        success: false,
        message: 'Authentication service temporarily unavailable. Please try again.',
      });
    }
    
    // Set cookies
    setTokenCookies(res, accessToken, refreshToken);

    // Prepare user response with profile image URL
    const profileImageUrl = s3Service.toProxyUrl(
      user.getProfileImage ? user.getProfileImage() : 
      (user.profileImage || user.googleProfileImage || user.avatar || null)
    );

    const userResponse = {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      provider: user.provider,
      hasPassword: !!user.password,
      avatar: user.avatar,
      profileImage: s3Service.toProxyUrl(user.profileImage) || null,
      profileImageKey: user.profileImageKey || null,
      googleProfileImage: user.googleProfileImage || null,
      isVerified: user.isVerified,
      profileImageUrl: profileImageUrl,
      devices: user.devices.map((d) => deviceService.formatDeviceForDisplay(d)),
      currentDevice: deviceService.formatDeviceForDisplay(deviceSession),
      passwordExpiration: user.passwordNeedsChange
        ? user.passwordNeedsChange()
        : null,
    };

    // Check Redis image cache — if user logged out earlier, their image is here
    let cachedImage = null;
    try {
      const cached = await RedisService.getCachedProfileImage(user.email);
      if (cached?.url) {
        cachedImage = cached;
      }
    } catch (_) { /* non-critical */ }

    logger.info(`✅ Login successful for: ${user.email || user.phone || rawIdentity}`, {
      device: deviceSession.deviceName,
      location: deviceSession.location,
    });

    // ── CloudWatch: structured user login log ────────────────────
    logger.userLog('login', {
      userId: user._id.toString(),
      email: user.email,
      phone: user.phone,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      provider: user.provider || (isEmailIdentity ? 'local' : 'phone'),
      success: true,
      extra: { device: deviceSession.deviceName, location: deviceSession.location },
    });

    res.status(200).json({
      success: true,
      message: "Login successful",
      user: userResponse,
      accessToken,
      refreshToken,
      cachedImage, // { url, name, cachedAt } or null
    });

    // ✅ NON-BLOCKING via RabbitMQ: login notification + audit log
    publishLoginNotificationEmail({
      email: user.email,
      username: user.name,
      loginDetails: {
        device: deviceSession.deviceName,
        browser: deviceSession.browser || 'Unknown',
        os: deviceSession.os || 'Unknown',
        ip: req.ip,
        location: deviceSession.location,
        time: new Date().toISOString(),
      },
    }).catch(() => {});

    publishAuditLog({
      userId: user._id.toString(),
      action: 'login',
      email: user.email,
      phone: user.phone,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      metadata: {
        device: deviceSession.deviceName,
        provider: user.provider || (isEmailIdentity ? 'local' : 'phone'),
        location: deviceSession.location,
      },
    }).catch(() => {});

    // ✅ NON-BLOCKING: Security push notification for new device/location
    securityNotificationService.checkAndNotifyNewLogin(user, deviceSession).catch(() => {});
  } catch (error) {
    logger.error("❌ Login error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// ==================== UPDATED: GOOGLE LOGIN WITH DEVICE TRACKING ====================
exports.googleTokenAuth = async (req, res) => {
  try {
    logger.info("[GoogleAuth] Token login request received");
    const { token: googleToken, idToken, accessToken: googleAccessToken } = req.body;

    // Accept token from web OR idToken from mobile (React Native Google Sign-In)
    const resolvedToken = googleToken || idToken || googleAccessToken;

    if (!resolvedToken) {
      return res.status(400).json({
        success: false,
        message: "Google token is required",
      });
    }

    const { user, isNew } = await handleGoogleAuth(resolvedToken, req);

    // Upload Google profile picture in the background — don't block login response.
    if (user.googleProfileImage && !user.profileImage) {
      const userId = user._id.toString();
      const googleImageUrl = user.googleProfileImage;
      setImmediate(() => {
        s3Service.uploadRemoteProfileImage(googleImageUrl, userId)
          .then(async (uploadResult) => {
            if (!uploadResult?.imageUrl) return;
            const fresh = await User.findById(userId);
            if (!fresh || fresh.profileImage) return;
            fresh.profileImage = uploadResult.imageUrl;
            fresh.profileImageKey = uploadResult.key;
            await fresh.save();
            logger.info('✅ Google profile image uploaded to S3 (background)', { userId });
          })
          .catch((imgErr) => {
            logger.warn('Could not upload Google profile image to S3:', imgErr.message);
          });
      });
    }

    // Generate tokens (pass req for fingerprint binding)
    const accessToken = generateAccessToken(user._id, req);
    const refreshToken = generateRefreshToken(user._id);
    const decoded = jwt.decode(refreshToken);

    // Create device session
    const deviceSession = await deviceService.createDeviceSession(req, decoded.jti);

    // Update user devices
    await user.updateDeviceSession(deviceSession, decoded.jti);

    // Add to login history
    await user.addLoginHistory({
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
      deviceId: deviceSession.deviceId,
      deviceName: deviceSession.deviceName,
      location: deviceSession.location,
      loginType: "google",
      success: true,
    });

    // Store tokens in Redis
    const stored = await storeRefreshToken(user._id.toString(), refreshToken, req);
    if (!stored) {
      logger.error('Failed to store refresh token in Redis', { userId: user._id });
      clearTokenCookies(res);
      return res.status(503).json({
        success: false,
        message: 'Authentication service temporarily unavailable. Please try again.',
      });
    }
    setTokenCookies(res, accessToken, refreshToken);

    const message = isNew
      ? "Account created with Google"
      : "Google login successful";
    const statusCode = isNew ? 201 : 200;

    const profileImageUrl = s3Service.toProxyUrl(
      user.getProfileImage ? user.getProfileImage() : 
      (user.profileImage || user.googleProfileImage || user.avatar || null)
    );

    const userResponse = {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      provider: user.provider,
      avatar: user.avatar,
      profileImage: s3Service.toProxyUrl(user.profileImage) || null,
      profileImageKey: user.profileImageKey || null,
      googleProfileImage: user.googleProfileImage || null,
      isVerified: user.isVerified,
      profileImageUrl: profileImageUrl,
      devices: user.devices.map((d) => deviceService.formatDeviceForDisplay(d)),
      currentDevice: deviceService.formatDeviceForDisplay(deviceSession),
    };

    // Check Redis image cache — if user logged out earlier, their image is here
    let cachedImage = null;
    try {
      const cached = await RedisService.getCachedProfileImage(user.email);
      if (cached?.url) {
        cachedImage = cached;
      }
    } catch (_) { /* non-critical */ }

    logger.info(`✅ Google login successful for: ${user.email}`, {
      device: deviceSession.deviceName,
      location: deviceSession.location,
      isNew,
    });

    // ── CloudWatch: structured Google login log ──────────────────
    logger.userLog('login', {
      userId: user._id.toString(),
      email: user.email,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      provider: 'google',
      success: true,
      extra: { device: deviceSession.deviceName, location: deviceSession.location, isNew },
    });

    res.status(statusCode).json({
      success: true,
      message,
      user: userResponse,
      accessToken,
      refreshToken,
      cachedImage, // { url, name, cachedAt } or null
    });
  } catch (error) {
    logger.error("❌ Google Token Auth Error:", error);
    const message =
      error?.message?.includes("Google authentication failed") ||
      error?.message?.includes("Google ID token") ||
      error?.message?.includes("Invalid audience")
        ? error.message
        : error?.message
          ? `Invalid Google token: ${error.message}`
          : "Invalid Google token";

    res.status(401).json({
      success: false,
      message,
    });
  }
};

// ==================== UPDATED: LOGOUT WITH DEVICE CLEANUP + IMAGE CACHING ====================
exports.logout = async (req, res) => {
  try {
    const { refreshToken } = req.cookies;

    if (refreshToken) {
      const decoded = jwt.decode(refreshToken);

      // Deactivate session & cache profile image before clearing
      if (decoded?.id) {
        const user = await User.findById(decoded.id);
        if (user) {
          await user.deactivateSession(decoded.jti);

          // Cache the user's current profile image in Redis (survives logout)
          const imageUrl = s3Service.toProxyUrl(
            user.getProfileImage
              ? user.getProfileImage()
              : user.profileImage || user.googleProfileImage || user.avatar || null
          );
          if (imageUrl && user.email) {
            await RedisService.cacheProfileImage(user.email, {
              url: imageUrl,
              name: user.name,
            });
          }
        }
      }

      // Revoke from Redis
      await revokeRefreshToken(refreshToken);
    }

    clearTokenCookies(res);

    res.status(200).json({
      success: true,
      message: "Logged out successfully",
    });

    // ── CloudWatch: structured logout log ────────────────────────
    logger.userLog('logout', {
      userId: req.user?._id?.toString() || 'unknown',
      ip: req.ip,
      userAgent: req.get('user-agent'),
      success: true,
    });
  } catch (error) {
    logger.error("Logout error:", error);
    res.status(500).json({
      success: false,
      message: "Error during logout",
    });
  }
};

// ==================== UPDATED: LOGOUT ALL DEVICES ====================
exports.logoutAll = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get all session token IDs for user
    const redis = require("../config/redis");
    const tokenIds = await redis.smembers(`user_sessions:${userId}`);

    // Deactivate all sessions in user document
    const user = await User.findById(userId);
    if (user) {
      user.devices.forEach((device) => {
        device.sessions.forEach((session) => {
          session.isActive = false;
          session.logoutTime = new Date();
        });
      });
      await user.save();
    }

    // Revoke all tokens from Redis
    await revokeAllUserTokens(userId);

    // Clear cookie
    clearTokenCookies(res);

    res.status(200).json({
      success: true,
      message: "Logged out from all devices successfully",
    });
  } catch (error) {
    logger.error("Logout all error:", error);
    res.status(500).json({
      success: false,
      message: "Error during logout",
    });
  }
};

// ==================== UPLOAD PROFILE IMAGE TO S3 ====================
exports.uploadProfileImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No image file provided",
      });
    }

    // Validate image
    const validation = s3Service.validateImage(req.file);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: validation.error,
      });
    }

    const userId = req.user.id;

    // Upload to S3
    const uploadResult = await s3Service.uploadProfileImage(
      req.file.buffer,
      userId,
      req.file.mimetype,
    );

    // Atomic DB update with retry — resilient to brief MongoDB disconnects
    let user;
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        user = await User.findByIdAndUpdate(
          userId,
          {
            $set: {
              profileImage: uploadResult.imageUrl,
              profileImageKey: uploadResult.key,
              profileImageThumbnail: uploadResult.imageUrl,
              updatedAt: new Date(),
            },
          },
          { returnDocument: 'after' }
        );
        break; // success
      } catch (dbError) {
        if (attempt === maxRetries) {
          logger.error("❌ Failed to update profile image in DB after retries:", dbError);
          // S3 upload succeeded but DB save failed — return the image URL
          // so the client at least has it; next upload will still work.
          return res.status(500).json({
            success: false,
            message: "Image uploaded to storage but failed to update profile. Please try again.",
            imageUrl: uploadResult.imageUrl,
          });
        }
        logger.warn(`DB save attempt ${attempt} failed, retrying...`, dbError.message);
        await new Promise((r) => setTimeout(r, 500 * attempt));
      }
    }

    // Log activity (non-critical)
    try {
      await user.addSecurityLog(
        "profile_image_updated",
        req.ip,
        req.get("user-agent"),
        { imageKey: uploadResult.key },
      );
    } catch (_) { /* non-critical */ }

    const profileImageUrl = getResolvedProfileImage(user);

    // Update Redis image cache with the proxy URL
    try {
      await RedisService.cacheProfileImage(user.email, {
        url: s3Service.toProxyUrl(uploadResult.imageUrl),
        name: user.name,
      });
    } catch (_) { /* non-critical */ }

    await invalidateAccountCaches(userId);

    res.status(200).json({
      success: true,
      message: "Profile image uploaded successfully",
      imageUrl: s3Service.toProxyUrl(uploadResult.imageUrl),
      imageKey: uploadResult.key,
      user: {
        ...user.toJSON(),
        profileImage: s3Service.toProxyUrl(uploadResult.imageUrl),
        profileImageUrl: profileImageUrl,
        updatedAt: user.updatedAt,
      }
    });
  } catch (error) {
    logger.error("❌ Profile image upload error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to upload profile image",
    });
  }
};

// ==================== GENERATE UPLOAD URL FOR CLIENT-SIDE UPLOAD ====================
exports.generateUploadUrl = async (req, res) => {
  try {
    const { fileType } = req.body;
    const userId = req.user.id;

    if (!fileType || !fileType.startsWith("image/")) {
      return res.status(400).json({
        success: false,
        message: "Valid image file type is required",
      });
    }

    const uploadData = await s3Service.generateUploadUrl(userId, fileType);

    res.status(200).json({
      success: true,
      ...uploadData,
    });
  } catch (error) {
    logger.error("❌ Generate upload URL error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate upload URL",
    });
  }
};

// ==================== GET USER DEVICES ====================
exports.getUserDevices = async (req, res) => {
  try {
    const cacheKey = `devices:${req.user.id}`;
    const cached = await readJsonCache(cacheKey);
    if (cached) {
      return res.status(200).json(cached);
    }

    const user = await User.findById(req.user.id);

    const formattedDevices = user.devices.map((device) =>
      deviceService.formatDeviceForDisplay(device),
    );

    // Get current device from refresh token
    const { refreshToken } = req.cookies;
    let currentDeviceId = null;

    if (refreshToken) {
      const decoded = jwt.decode(refreshToken);
      if (decoded?.jti) {
        const currentSession = user.devices.find((d) =>
          d.sessions.some((s) => s.tokenId === decoded.jti),
        );
        currentDeviceId = currentSession?.deviceId;
      }
    }

    const payload = {
      success: true,
      devices: formattedDevices,
      currentDeviceId,
    };

    await writeJsonCache(cacheKey, payload, DEVICES_CACHE_TTL_SECONDS);

    res.status(200).json(payload);
  } catch (error) {
    logger.error("❌ Get user devices error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get devices",
    });
  }
};

// ==================== GET LOGIN HISTORY ====================
exports.getLoginHistory = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("loginHistory");

    // Map ISO country codes to display names
    const countryNames = new Intl.DisplayNames(["en"], { type: "region" });

    const history = user.loginHistory
      .sort((a, b) => b.timestamp - a.timestamp)
      .map((log) => {
        let location = "Unknown";
        let timezone = null;

        // Try stored location first, fall back to IP lookup for old entries
        let loc = log.location;
        if ((!loc || (!loc.city && !loc.country)) && log.ipAddress) {
          loc = deviceService.getLocationFromIP(log.ipAddress);
        }

        if (loc) {
          const city = loc.city || "";
          const region = loc.region || "";
          let country = loc.country || "";
          timezone = loc.timezone || null;
          // Convert ISO code (IN, US) to full name (India, United States)
          if (country && country.length === 2) {
            try { country = countryNames.of(country) || country; } catch (_) { /* keep code */ }
          }
          const parts = [city, region, country].filter(
            (p) => p && p !== "Local" && p !== "Development"
          );
          location = parts.length > 0 ? parts.join(", ") : "Local Network";
        }

        return {
          timestamp: log.timestamp,
          ipAddress: log.ipAddress,
          location,
          timezone,
          deviceName: log.deviceName || "Unknown Device",
          loginType: log.loginType,
          success: log.success,
          failureReason: log.failureReason,
        };
      });

    res.status(200).json({
      success: true,
      history,
    });
  } catch (error) {
    logger.error("❌ Get login history error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get login history",
    });
  }
};

// ==================== GET USER ACTIVITY LOG ====================
exports.getActivityLog = async (req, res) => {
  try {
    const cacheKey = `activity:${req.user.id}`;
    const cached = await readJsonCache(cacheKey);
    if (cached) {
      return res.status(200).json(cached);
    }

    const user = await User.findById(req.user.id).select("loginHistory securityLogs");
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const loginEvents = (user.loginHistory || []).map((entry) => ({
      id: `login-${entry._id || entry.timestamp?.getTime?.() || Math.random()}`,
      type: entry.success ? 'login' : 'login-failed',
      title: entry.success ? 'Signed in' : 'Failed sign-in attempt',
      description: entry.success
        ? `${entry.deviceName || 'Unknown device'}${entry.location?.city || entry.location?.country ? ` from ${[entry.location?.city, entry.location?.country].filter(Boolean).join(', ')}` : ''}`
        : entry.failureReason || 'Login attempt failed',
      timestamp: entry.timestamp,
      metadata: {
        ipAddress: entry.ipAddress,
        deviceName: entry.deviceName,
        loginType: entry.loginType,
        success: entry.success,
      },
    }));

    const securityEvents = (user.securityLogs || []).map((entry) => ({
      id: `security-${entry._id || entry.timestamp?.getTime?.() || Math.random()}`,
      type: entry.action || 'security',
      title:
        entry.action === 'profile_updated'
          ? 'Updated profile details'
          : entry.action === 'profile_image_updated'
            ? 'Changed profile image'
            : entry.action === 'password_changed'
              ? 'Changed password'
              : entry.action === 'failed_login'
                ? 'Security alert'
                : 'Security activity',
      description:
        entry.action === 'profile_updated'
          ? 'Your account profile information was updated.'
          : entry.action === 'profile_image_updated'
            ? 'Your dashboard avatar was changed.'
            : entry.action === 'password_changed'
              ? 'Your password was updated successfully.'
              : entry.details?.reason || 'A security-related action was recorded.',
      timestamp: entry.timestamp,
      metadata: entry.details || {},
    }));

    const activity = [...loginEvents, ...securityEvents]
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 100);

    const payload = {
      success: true,
      summary: {
        totalActions: activity.length,
        successfulLogins: loginEvents.filter((entry) => entry.type === 'login').length,
        securityEvents: securityEvents.length,
      },
      activity,
    };

    await writeJsonCache(cacheKey, payload, ACTIVITY_CACHE_TTL_SECONDS);

    res.status(200).json(payload);
  } catch (error) {
    logger.error("❌ Get activity log error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get activity log",
    });
  }
};

// ==================== REVOKE DEVICE ====================
exports.revokeDevice = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const userId = req.user.id;

    const user = await User.findById(userId);

    const device = user.devices.find((d) => d.deviceId === deviceId);

    if (!device) {
      return res.status(404).json({
        success: false,
        message: "Device not found",
      });
    }

    // Check if trying to revoke current device
    const { refreshToken } = req.cookies;
    if (refreshToken) {
      const decoded = jwt.decode(refreshToken);
      if (decoded?.jti) {
        const isCurrent = device.sessions.some(
          (s) => s.tokenId === decoded.jti,
        );
        if (isCurrent) {
          return res.status(400).json({
            success: false,
            message: "Cannot revoke current device. Use logout instead.",
          });
        }
      }
    }

    // Revoke all sessions for this device
    for (const session of device.sessions) {
      if (session.tokenId) {
        await revokeRefreshTokenByJti(session.tokenId);
      }
    }

    // Remove device
    user.devices = user.devices.filter((d) => d.deviceId !== deviceId);
    await user.save();

    await invalidateAccountCaches(userId);

    logger.info("✅ Device revoked", { userId, deviceId });

    res.status(200).json({
      success: true,
      message: "Device revoked successfully",
    });
  } catch (error) {
    logger.error("❌ Revoke device error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to revoke device",
    });
  }
};

// ==================== GET GOOGLE CLIENT ID ====================
exports.getGoogleClientId = (req, res) => {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;

    if (!clientId) {
      return res.status(500).json({
        success: false,
        message: "Google authentication is not configured on the server",
      });
    }

    res.status(200).json({
      success: true,
      clientId: clientId,
    });
  } catch (error) {
    logger.error("Get Google client ID error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// ==================== REGISTRATION METHODS ====================
exports.initiateRegister = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const normalizedEmail = String(email || "").trim().toLowerCase();

    logger.info("🔍 Registration attempt:", { email: normalizedEmail, name });

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message:
          "All fields are required: name, email, password",
      });
    }

    const emailRegex = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid email address",
      });
    }

    const passwordValidation = await passwordSecurity.validatePassword(
      password,
      null,
      true,
    );

    if (!passwordValidation.isValid) {
      return res.status(400).json({
        success: false,
        message: "Password does not meet security requirements",
        errors: passwordValidation.errors,
        strength: passwordValidation.strength,
      });
    }

    // No confirmPassword check needed

    const userExists = await User.findOne({ email: normalizedEmail });
    if (userExists) {
      return res.status(409).json({
        success: false,
        message: "User already exists. Please sign in instead.",
        code: "USER_ALREADY_EXISTS",
      });
    }

    const pendingRegistration =
      await RedisService.getPendingRegistration(normalizedEmail);
    if (pendingRegistration) {
      const now = new Date();
      const createdAt = new Date(pendingRegistration.createdAt);
      const expiresAt = new Date(createdAt.getTime() + 10 * 60 * 1000);

      if (now < expiresAt) {
        // Resend OTP instead of silently returning
        const lastResendTime = pendingRegistration.lastResendTime;
        if (lastResendTime) {
          const timeSinceLastResend = (now - new Date(lastResendTime)) / 1000;
          if (timeSinceLastResend < 60) {
            return res.status(200).json({
              success: true,
              message: "OTP sent to your email. Please verify to complete registration.",
              email: normalizedEmail,
              expiresIn: Math.ceil((expiresAt - now) / 1000),
            });
          }
        }

        const newOtp = OTPGenerator.generateOTP();
        await RedisService.storeOTP(normalizedEmail, newOtp);
        pendingRegistration.lastResendTime = now.toISOString();
        pendingRegistration.resendCount = (pendingRegistration.resendCount || 0) + 1;
        await RedisService.storePendingRegistration(normalizedEmail, pendingRegistration);

        logger.info(`📤 Re-sending registration OTP email to: ${normalizedEmail}`);
        void dispatchOtpEmail({
          email: normalizedEmail,
          username: pendingRegistration.name,
          otp: newOtp,
          type: "registration",
        });

        return res.status(200).json({
          success: true,
          message: "OTP sent to your email. Please verify to complete registration.",
          email: normalizedEmail,
          expiresIn: Math.ceil((expiresAt - now) / 1000),
        });
      } else {
        await RedisService.deletePendingRegistration(normalizedEmail);
      }
    }

    const emailBlocked = await RedisService.checkEmailBlocked(normalizedEmail);
    if (emailBlocked) {
      return res.status(429).json({
        success: false,
        message: "Too many registration attempts. Please try again in 1 hour.",
      });
    }

    const otp = OTPGenerator.generateOTP();
    logger.info(`✅ Generated OTP for ${normalizedEmail}`);

    const hashedPassword = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    const userData = {
      name,
      email: normalizedEmail,
      password: hashedPassword,
      provider: "local",
      otpAttempts: 0,
      resendCount: 0,
      createdAt: new Date().toISOString(),
      lastResendTime: null,
      passwordStrength: passwordValidation.strength,
      breachChecked: passwordValidation.breach,
    };

    const storeResult = await RedisService.storePendingRegistration(
      normalizedEmail,
      userData,
    );
    if (!storeResult) {
      throw new Error("Failed to store registration data");
    }

    const otpStoreResult = await RedisService.storeOTP(normalizedEmail, otp);
    if (!otpStoreResult) {
      throw new Error("Failed to store OTP");
    }

    await RedisService.incrementRegistrationAttempts(normalizedEmail);

    // Non-blocking — API responds immediately; email sends via queue or SMTP fallback.
    logger.info(`📤 Sending registration OTP email to: ${normalizedEmail}`);
    void dispatchOtpEmail({
      email: normalizedEmail,
      username: name,
      otp,
      type: "registration",
    });

    // Audit log (fire-and-forget via queue)
    publishAuditLog({
      action: 'otp_requested',
      email: normalizedEmail,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      metadata: { type: 'registration' },
    }).catch(() => {});

    res.status(200).json({
      success: true,
      message:
        "OTP sent to your email. Please verify to complete registration.",
      email: normalizedEmail,
      expiresIn: 600,
    });
  } catch (error) {
    logger.error("❌ Registration initiation error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

exports.verifyOTPAndRegister = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: "Email and OTP are required",
      });
    }

    const otpBlocked = await RedisService.checkOTPBlocked(email);
    if (otpBlocked.blocked) {
      return res.status(429).json({
        success: false,
        message: `Too many failed attempts. Please try again in ${otpBlocked.remainingSeconds} seconds.`,
        blocked: true,
        remainingSeconds: otpBlocked.remainingSeconds,
      });
    }

    const pendingData = await RedisService.getPendingRegistration(email);
    if (!pendingData) {
      return res.status(400).json({
        success: false,
        message:
          "Registration session expired or not found. Please start over.",
      });
    }

    const otpVerification = await RedisService.verifyOTP(email, otp);
    if (!otpVerification.valid) {
      const attemptResult = await RedisService.incrementOTPAttempts(email, {
        userId: pendingData.userId || null,
        userName: pendingData.name || null,
        context: "registration",
      });

      let errorMessage =
        otpVerification.reason || "Invalid OTP. Please try again.";

      if (attemptResult.blocked) {
        errorMessage = `Too many failed attempts. Please try again in 60 seconds.`;
        return res.status(429).json({
          success: false,
          message: errorMessage,
          blocked: true,
          remainingSeconds: 60,
          attempts: attemptResult.attempts,
        });
      }

      const attemptsRemaining = 3 - attemptResult.attempts;
      return res.status(400).json({
        success: false,
        message: errorMessage,
        attemptsRemaining: attemptsRemaining,
        attempts: attemptResult.attempts,
      });
    }

    await RedisService.clearOTPAttempts(email);
    await RedisService.clearOTPBlock(email);

    const userExists = await User.findOne({ email });
    if (userExists) {
      await RedisService.deletePendingRegistration(email);
      return res.status(409).json({
        success: false,
        message: "User already exists. Please sign in instead.",
        code: "USER_ALREADY_EXISTS",
      });
    }

    const user = new User({
      name: pendingData.name,
      email: pendingData.email,
      password: pendingData.password,
      provider: "local",
      isVerified: true,
      lastPasswordChange: new Date(),
    });

    user.passwordHistory = [
      {
        password: pendingData.password,
        changedAt: new Date(),
        changedBy: "user",
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      },
    ];

    await user.save();

    logger.info(`✅ User created in database: ${email}`);

    logger.userLog('register', {
      userId: user._id.toString(),
      email,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      provider: 'local',
      success: true,
    });

    // ✅ NON-BLOCKING: send welcome email via queue
    publishWelcomeEmail({ email, username: user.name, userId: user._id.toString() }).catch(() => {});

    // ✅ NON-BLOCKING: store audit log via queue (persists to MongoDB)
    publishAuditLog({
      userId: user._id.toString(),
      action: 'register',
      email,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      metadata: { provider: 'local' },
    }).catch(() => {});

    await RedisService.deletePendingRegistration(email);

    return await sendTokenResponse(
      user,
      201,
      res,
      "User registered successfully",
    );
  } catch (error) {
    logger.error("❌ OTP verification error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during registration",
    });
  }
};

// ==================== REFRESH TOKEN ====================
exports.refreshToken = async (req, res) => {
  try {
    // React Native clients send the token in the request body (no cookie jar).
    // Browser clients send it as an HttpOnly cookie. Accept both.
    const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: "No refresh token provided",
        code: "NO_REFRESH_TOKEN",
      });
    }

    const result = await refreshTokens(refreshToken, req);

    // Token is genuinely invalid / expired → clear cookies
    if (result.error === 'invalid') {
      clearTokenCookies(res);
      return res.status(401).json({
        success: false,
        message: "Invalid or expired refresh token",
        code: "INVALID_REFRESH_TOKEN",
      });
    }

    // Transient failure (Redis/network blip) → DON'T clear cookies!
    // The token is probably still valid. Let the client retry.
    if (result.error === 'transient') {
      return res.status(503).json({
        success: false,
        message: "Token service temporarily unavailable. Please retry.",
        code: "SERVICE_UNAVAILABLE",
      });
    }

    setTokenCookies(res, result.tokens.accessToken, result.tokens.refreshToken);

    // Return tokens in the body so React Native clients (which cannot rely
    // on HttpOnly cookies) can read and store the new credentials.
    res.status(200).json({
      success: true,
      message: "Token refreshed successfully",
      accessToken: result.tokens.accessToken,
      refreshToken: result.tokens.refreshToken,
    });
  } catch (error) {
    logger.error("Refresh token error:", error);
    // DON'T clear cookies on server errors — the session may still be valid
    res.status(500).json({
      success: false,
      message: "Server error during token refresh",
      code: "SERVER_ERROR",
    });
  }
};

// ==================== CHECK AUTH ====================
exports.checkAuth = async (req, res) => {
  try {
    const { accessToken } = req.cookies;

    if (!accessToken) {
      // The access token cookie may have expired (15 min maxAge) while
      // the refresh token (7 days, path=/api/auth) is still valid.
      // Return ACCESS_TOKEN_EXPIRED so the client keeps the persisted
      // user state and triggers a refresh instead of logging out.
      return res.status(200).json({
        success: true,
        isAuthenticated: false,
        code: 'ACCESS_TOKEN_EXPIRED',
      });
    }

    // Step 1: verify the JWT (pure crypto, no DB)
    let decoded;
    try {
      decoded = jwt.verify(
        accessToken,
        process.env.JWT_ACCESS_SECRET,
      );
    } catch (jwtError) {
      if (jwtError.name === "TokenExpiredError") {
        // Access token expired — DON'T try to refresh here.
        // Let the client-side interceptor call /api/auth/refresh
        // (which uses the SETNX-locked tokenUtils.refreshTokens).
        // Returning isAuthenticated:false with code so the client
        // knows it can retry after refreshing.
        return res.status(200).json({
          success: true,
          isAuthenticated: false,
          code: "ACCESS_TOKEN_EXPIRED",
        });
      }
      // Invalid / malformed token
      return res.status(200).json({
        success: true,
        isAuthenticated: false,
      });
    }

    if (decoded.type !== "access") {
      return res.status(200).json({
        success: true,
        isAuthenticated: false,
      });
    }

    // --- Step 2: fetch user from DB (lightweight select for performance) ---
    let user;
    try {
      user = await User.findById(decoded.id).select(
        'name email role provider status profileImage googleProfileImage avatar isVerified passwordNeedsChange'
      );
    } catch (dbError) {
      // MongoDB is temporarily down — return 503 so the client
      // does NOT clear the session.  The user stays logged in
      // and simply retries on the next check.
      logger.warn("checkAuth: MongoDB unreachable, keeping session", {
        error: dbError.message,
      });
      return res.status(503).json({
        success: false,
        message: "Database temporarily unavailable",
        code: "DB_UNAVAILABLE",
      });
    }

    if (!user) {
      return res.status(200).json({
        success: true,
        isAuthenticated: false,
      });
    }

    // --- Step 3: verify active session exists in Upstash Redis ---
    // NOTE: This is a soft check — JWT + MongoDB already verified the user.
    // If Redis session data is stale or missing (e.g. after MongoDB reconnect,
    // token rotation edge case), we still trust the valid access token.
    // The session info is added to the response for client-side awareness.
    let redisSessionValid = true;
    try {
      const redis = require("../config/redis");
      const sessionTokenIds = await redis.smembers(`user_sessions:${decoded.id}`);

      if (!sessionTokenIds || sessionTokenIds.length === 0) {
        logger.info("checkAuth: No active sessions in Redis for user (soft check)", { userId: decoded.id });
        redisSessionValid = false;
      } else {
        // Verify at least one session still has a valid refresh token (single MGET round-trip)
        const keys = sessionTokenIds.map((id) => `refresh_token:${id}`);
        const results = await redis.mget(...keys);
        const hasValidSession = results.some((r) => r !== null);

        if (!hasValidSession) {
          logger.info("checkAuth: All Redis sessions expired for user (soft check)", { userId: decoded.id });
          redisSessionValid = false;
        }
      }
    } catch (redisError) {
      // Redis temporarily down — don't block authentication.
      logger.warn("checkAuth: Redis check failed, proceeding with JWT+DB only", {
        error: redisError.message,
        userId: decoded.id,
      });
    }

    const passwordExpiration = user.passwordNeedsChange
      ? user.passwordNeedsChange()
      : null;

    const profileImageUrl = s3Service.toProxyUrl(
      user.getProfileImage
        ? user.getProfileImage()
        : user.profileImage || user.googleProfileImage || user.avatar || null
    );

    return res.status(200).json({
      success: true,
      isAuthenticated: true,
      redisSessionValid,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        provider: user.provider,
        avatar: user.avatar,
        profileImage: s3Service.toProxyUrl(user.profileImage) || null,
        profileImageKey: user.profileImageKey,
        googleProfileImage: user.googleProfileImage,
        isVerified: user.isVerified,
        profileImageUrl: profileImageUrl,
        passwordExpiration,
      },
    });
  } catch (error) {
    logger.error("Check auth error:", error);
    // Return 503 (not 500) so the client keeps the session alive
    res.status(503).json({
      success: false,
      message: "Server error",
      code: "SERVER_ERROR",
    });
  }
};

// ==================== GET PROFILE ====================
exports.getProfile = async (req, res) => {
  try {
    const user   = req.user;
    const userId = String(user._id || user.id);

    // Two-tier cache:
    //   profile_meta:{id}  — name, email, bio, prefs, etc.  → 5-minute TTL
    //   counts:{id}        — listingsCount, followersCount, followingCount → 60-second TTL
    // Splitting lets listing/follow actions bust ONLY the counts key, so profile
    // metadata stays warm while counts are always fresh (≤ 60 s stale).
    const metaKey   = `profile_meta:${userId}`;
    const countsKey = `counts:${userId}`;

    const [cachedMeta, cachedCounts] = await Promise.all([
      readJsonCache(metaKey),
      readJsonCache(countsKey),
    ]);

    // Fast path: both caches warm — skip all DB queries
    if (cachedMeta && cachedCounts) {
      return res.status(200).json({
        success: true,
        user: { ...cachedMeta, ...cachedCounts },
      });
    }

    // Only run the queries that are actually needed
    const [passwordProbeUser, followData, listingsCountResult] = await Promise.all([
      // hasPassword — only needed when metadata cache is cold
      cachedMeta
        ? Promise.resolve(null)
        : User.findById(user._id).select("+password"),
      // follow aggregate — only needed when counts cache is cold
      cachedCounts
        ? Promise.resolve(null)
        : User.aggregate([
            { $match: { _id: user._id } },
            { $project: {
              followersCount: { $size: { $ifNull: ['$followers', []] } },
              followingCount: { $size: { $ifNull: ['$following', []] } },
            }},
          ]),
      // listing counts — only needed when counts cache is cold
      cachedCounts ? Promise.resolve(null) : countUserListings(user._id),
    ]);

    // ── Build / restore profile metadata ──────────────────────────────────
    let metaData = cachedMeta;
    if (!cachedMeta) {
      const profileImageUrl = getResolvedProfileImage(user);
      metaData = {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        provider: user.provider,
        hasPassword: !!passwordProbeUser?.password,
        avatar: user.avatar,
        profileImage: s3Service.toProxyUrl(user.profileImage) || null,
        profileImageKey: user.profileImageKey,
        googleProfileImage: user.googleProfileImage,
        isVerified: user.isVerified,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        phone: user.phone || null,
        address: user.address || null,
        bio: user.bio || null,
        dateOfBirth: user.dateOfBirth || null,
        gender: user.gender || null,
        profileImageUrl,
        preferences: {
          emailNotifications: user.preferences?.emailNotifications ?? true,
          pushNotifications: user.preferences?.pushNotifications ?? true,
          marketingEmails: user.preferences?.marketingEmails ?? false,
          twoFactorAuth: user.preferences?.twoFactorAuth ?? false,
          theme: user.preferences?.theme ?? 'auto',
        },
        passwordExpiration: user.passwordNeedsChange
          ? user.passwordNeedsChange()
          : null,
      };
      await writeJsonCache(metaKey, metaData, PROFILE_CACHE_TTL_SECONDS);
    }

    // ── Build / restore activity counts (60-second cache) ─────────────────
    // Short TTL means dashboard counts refresh within 1 minute of any action
    // without needing per-controller cache invalidation.
    let countsData = cachedCounts;
    if (!cachedCounts) {
      const followersCount = followData?.[0]?.followersCount || 0;
      const followingCount = followData?.[0]?.followingCount || 0;
      const listingsCount  = listingsCountResult || 0;
      countsData = { followersCount, followingCount, listingsCount };
      await writeJsonCache(countsKey, countsData, 60); // 60-second TTL
    }

    res.status(200).json({
      success: true,
      user: { ...metaData, ...countsData },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// ==================== UPDATE PROFILE ====================
exports.updateProfile = async (req, res) => {
  try {
    const { name, email, phone, address, bio, dateOfBirth, gender } = req.body;
    const updateData = {};

    if (name !== undefined && name !== "") updateData.name = name;
    if (address !== undefined) updateData.address = address; // allow empty string to clear
    if (bio !== undefined) updateData.bio = bio; // allow empty string to clear
    updateData.updatedAt = new Date();

    // Gender normalisation
    if (gender !== undefined && gender !== "") {
      const genderMap = {
        male: "male",
        female: "female",
        other: "other",
        "non-binary": "other",
        nonbinary: "other",
        "prefer not to say": "prefer-not-to-say",
        "prefer-not-to-say": "prefer-not-to-say",
        prefernottosay: "prefer-not-to-say",
      };
      const normalised = genderMap[gender.toLowerCase().trim()];
      if (normalised) {
        updateData.gender = normalised;
      }
    }

    // Phone sanitisation
    if (phone !== undefined && phone !== "") {
      const digits = String(phone).replace(/\D/g, "");
      const cleaned = digits.slice(-10);
      if (cleaned.length !== 10) {
        return res.status(400).json({
          success: false,
          message: "Phone number must be exactly 10 digits",
        });
      }
      updateData.phone = cleaned;
    }

    // Date of birth — allow empty string / null to clear
    if (dateOfBirth !== undefined) {
      if (dateOfBirth === "" || dateOfBirth === null) {
        updateData.dateOfBirth = null;
      } else {
        const dob = new Date(dateOfBirth);
        if (isNaN(dob.getTime())) {
          return res.status(400).json({
            success: false,
            message: "Invalid date of birth",
          });
        }
        if (dob > new Date()) {
          return res.status(400).json({
            success: false,
            message: "Date of birth cannot be in the future",
          });
        }
        updateData.dateOfBirth = dob;
      }
    }

    // Email change — require OTP verification via separate endpoint
    // Direct email changes are not allowed to prevent account takeover
    if (email !== undefined && email !== "" && email !== req.user.email) {
      return res.status(400).json({
        success: false,
        message: "Email changes require verification. Please use the change email option in Settings.",
      });
    }

    const user = await User.findByIdAndUpdate(req.user.id, updateData, {
      new: true,
      runValidators: true,
    });

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // Log activity (non-fatal)
    try {
      await user.addSecurityLog(
        "profile_updated",
        req.ip,
        req.get("user-agent"),
        { updatedFields: Object.keys(updateData) },
      );
    } catch (logErr) {
      logger.warn("Could not log profile update activity:", logErr.message);
    }

    const profileImageUrl = getResolvedProfileImage(user);
    const passwordProbeUser = await User.findById(user._id).select("+password");
    const hasPassword = !!passwordProbeUser?.password;

    // Invalidate review caches so name updates reflect instantly everywhere
    try {
      await invalidateEntityCache("srvcReviewProv");
      await invalidateEntityCache("srvcReviewList");
    } catch (_) { /* bypass cache err */ }

    await invalidateAccountCaches(user._id);

    const userResponse = {
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone || null,
      address: user.address || null,
      bio: user.bio || null,
      dateOfBirth: user.dateOfBirth || null,
      gender: user.gender || null,
      role: user.role,
      provider: user.provider,
      hasPassword,
      avatar: user.avatar,
      profileImage: s3Service.toProxyUrl(user.profileImage) || null,
      profileImageKey: user.profileImageKey || null,
      googleProfileImage: user.googleProfileImage || null,
      isVerified: user.isVerified,
      profileImageUrl: profileImageUrl,
      updatedAt: user.updatedAt,
    };

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      user: userResponse,
    });
  } catch (error) {
    logger.error("❌ Update profile error:", error);

    if (error.name === "ValidationError") {
      const errors = Object.values(error.errors).map((e) => e.message);
      return res.status(400).json({
        success: false,
        message: errors.join(", "),
        errors,
      });
    }

    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// ==================== FIXED: CHANGE PASSWORD with backward compatibility ====================
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmNewPassword, confirmPassword } = req.body;
    const confirmation = confirmNewPassword ?? confirmPassword;

    logger.debug("Change password request received", { userId: req.user.id });

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Please provide current password and new password",
      });
    }

    if (confirmation !== undefined && confirmation !== newPassword) {
      return res.status(400).json({
        success: false,
        message: "New passwords do not match",
      });
    }

    // Get user with password field
    const user = await User.findById(req.user.id).select(
      "+password +passwordHistory",
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Verify current password first (before any new-password checks).
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Current password is incorrect",
      });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({
        success: false,
        message: "New password must be different from your current password",
      });
    }

    // Strength + breach only — history is checked below after current password is verified.
    const passwordValidation = await passwordSecurity.validatePassword(
      newPassword,
      null,
      true,
    );

    if (!passwordValidation.isValid) {
      return res.status(400).json({
        success: false,
        message: passwordValidation.errors?.[0] || "Password does not meet security requirements",
        errors: passwordValidation.errors,
        strength: passwordValidation.strength,
      });
    }

    // Check password history (skip re-checking current hash — already verified above).
    const historyCheck = await user.isPasswordInHistory(newPassword, { skipCurrent: true });
    if (historyCheck.inHistory) {
      return res.status(400).json({
        success: false,
        message: historyCheck.message || "You have used this password recently. Please choose a different password.",
      });
    }

    // Add current password to history BEFORE changing it
    await user.addToPasswordHistory(currentPassword, {
      changedBy: "user",
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    });

    // Hash new password with Argon2id
    const hashedPassword = await argon2.hash(newPassword, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    // Update user password
    user.password = hashedPassword;
    user.lastPasswordChange = new Date();
    await user.save();

    // Log the activity
    try {
      await user.addSecurityLog(
        "password_changed",
        req.ip,
        req.get("user-agent"),
        { method: "user_change" },
      );
    } catch (logErr) {
      logger.warn("Could not log password change activity:", logErr.message);
    }

    logger.info("Password changed successfully", { userId: user._id });

    res.status(200).json({
      success: true,
      message: "Password changed successfully.",
    });
  } catch (error) {
    logger.error("Change password error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during password change",
    });
  }
};

// ==================== FORGOT PASSWORD FLOW ====================
exports.initiateForgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const genericForgotPasswordResponse = {
      success: true,
      message: "If an account exists for this email, a password reset OTP has been sent.",
    };

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    const user = await User.findOne({ email }).select("+password provider name email phone");

    if (!user) {
      // Return a generic success to prevent account enumeration
      logger.userLog("forgot_password", {
        email,
        ip: req.ip,
        userAgent: req.get("user-agent"),
        success: true,
        reason: "unknown_email_masked",
      });
      return res.status(200).json(genericForgotPasswordResponse);
    }

    const pendingReset = await RedisService.getPendingPasswordReset(email);
    if (pendingReset) {
      const now = new Date();
      const createdAt = new Date(pendingReset.createdAt);
      const expiresAt = new Date(createdAt.getTime() + 10 * 60 * 1000);

      if (now < expiresAt) {
        // A previous attempt is still within its window.
        // Check whether the OTP was actually stored (i.e. email was sent).
        // If the OTP is missing — e.g. because the queue-worker never fired —
        // delete the stale entry and allow the user to try again immediately.
        const otpExists = await RedisService.checkOTPExists(email);
        if (otpExists) {
          // Return success so the app routes to the OTP screen instead of showing an error.
          return res.status(200).json({
            success: true,
            message:
              "Password reset OTP already sent. Please check your email for the code.",
            email,
            expiresIn: Math.ceil((expiresAt - now) / 1000),
            alreadyInProgress: true,
          });
        }
        // OTP is gone (expired or was never delivered) — clear the stale lock.
        await RedisService.deletePendingPasswordReset(email);
      } else {
        await RedisService.deletePendingPasswordReset(email);
      }
    }

    const emailBlocked = await RedisService.checkEmailBlocked(email);
    if (emailBlocked) {
      return res.status(429).json({
        success: false,
        message:
          "Too many password reset attempts. Please try again in 1 hour.",
      });
    }

    const otp = OTPGenerator.generateOTP();
    logger.info(`✅ Generated password reset OTP for ${email}: ${maskOtp(otp)}`);

    const resetData = {
      userId: user._id.toString(),
      email: user.email,
      username: user.name,
      phone: user.phone || null,
      provider: user.provider || "local",
      otpAttempts: 0,
      resendCount: 0,
      createdAt: new Date().toISOString(),
      lastResendTime: null,
      type: "password_reset",
    };

    const storeResult = await RedisService.storePendingPasswordReset(
      email,
      resetData,
    );
    if (!storeResult) {
      throw new Error("Failed to store password reset data");
    }

    const otpStoreResult = await RedisService.storeOTP(email, otp);
    if (!otpStoreResult) {
      throw new Error("Failed to store OTP");
    }

    await RedisService.incrementRegistrationAttempts(email);

    logger.info(`📤 Sending password reset OTP email to: ${email}`);
    void dispatchOtpEmail({
      email,
      username: user.name,
      otp,
      type: "forgot_password",
    });

    publishAuditLog({
      action: 'forgot_password_otp_requested',
      userId: user._id?.toString(),
      email,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    }).catch(() => {});

    const { isDevOtpExposed } = require("../utils/devOtp");
    const response = {
      success: true,
      message: "Password reset OTP sent to your email",
      email: email,
      expiresIn: 600,
    };
    if (isDevOtpExposed()) {
      response.devOtp = otp;
    }
    res.status(200).json(response);
  } catch (error) {
    logger.error("❌ Forgot password initiation error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// ==================== FIXED: verifyForgotPasswordOTP with proper data storage ====================
exports.verifyForgotPasswordOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    // SECURITY: never log OTP values
    logger.debug("verifyForgotPasswordOTP called", { email });

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: "Email and OTP are required",
      });
    }

    const redis = require("../config/redis");
    const otpHash = crypto.createHash("sha256").update(String(otp)).digest("hex");
    const verifiedKey = `reset_otp_verified:${email}`;

    // Idempotent replay: concurrent client retries often hit after the first
    // success deleted pending reset / OTP. Return the same token when OTP matches.
    try {
      const prior = await redis.get(verifiedKey);
      if (prior) {
        const parsed = typeof prior === "string" ? JSON.parse(prior) : prior;
        if (parsed?.resetToken && parsed?.otpHash === otpHash) {
          logger.info("OTP verify replay (idempotent)", { email });
          return res.status(200).json({
            success: true,
            message: "OTP verified successfully",
            resetToken: parsed.resetToken,
          });
        }
      }
    } catch (_) {
      // Fall through to normal verify path.
    }

    // Check if OTP is blocked
    const otpBlocked = await RedisService.checkOTPBlocked(email);
    if (otpBlocked.blocked) {
      return res.status(429).json({
        success: false,
        message: `Too many failed attempts. Please try again in ${otpBlocked.remainingSeconds} seconds.`,
        blocked: true,
        remainingSeconds: otpBlocked.remainingSeconds,
      });
    }

    // Get pending password reset data
    const pendingData = await RedisService.getPendingPasswordReset(email);
    
    if (!pendingData) {
      return res.status(400).json({
        success: false,
        message: "Password reset session expired or not found. Please start over.",
      });
    }

    // Serialize concurrent verifies for the same email (double-tap / multi-base race).
    const lockKey = `reset_otp_verify_lock:${email}`;
    const lockAcquired = await redis.set(lockKey, "1", { ex: 15, nx: true });
    if (!lockAcquired) {
      // Another request is verifying — wait briefly for its verified token.
      for (let i = 0; i < 8; i++) {
        await new Promise((r) => setTimeout(r, 150));
        try {
          const prior = await redis.get(verifiedKey);
          if (prior) {
            const parsed = typeof prior === "string" ? JSON.parse(prior) : prior;
            if (parsed?.resetToken && parsed?.otpHash === otpHash) {
              return res.status(200).json({
                success: true,
                message: "OTP verified successfully",
                resetToken: parsed.resetToken,
              });
            }
          }
        } catch (_) {
          /* continue waiting */
        }
      }
      return res.status(409).json({
        success: false,
        message: "Verification already in progress. Please wait a moment.",
      });
    }

    try {
      // Re-check pending under lock (first request may have already cleaned up).
      const pendingUnderLock = await RedisService.getPendingPasswordReset(email);
      if (!pendingUnderLock) {
        const prior = await redis.get(verifiedKey);
        if (prior) {
          const parsed = typeof prior === "string" ? JSON.parse(prior) : prior;
          if (parsed?.resetToken && parsed?.otpHash === otpHash) {
            return res.status(200).json({
              success: true,
              message: "OTP verified successfully",
              resetToken: parsed.resetToken,
            });
          }
        }
        return res.status(400).json({
          success: false,
          message: "Password reset session expired or not found. Please start over.",
        });
      }

      // Verify OTP
      const otpVerification = await RedisService.verifyOTP(email, otp);

      if (!otpVerification.valid) {
        const attemptResult = await RedisService.incrementOTPAttempts(email, {
          userId: pendingUnderLock.userId || null,
          userName: pendingUnderLock.username || pendingUnderLock.name || null,
          phone: pendingUnderLock.phone || null,
          provider: pendingUnderLock.provider || "local",
          context: "forgot_password",
        });

        let errorMessage = otpVerification.reason || "Invalid OTP. Please try again.";

        if (attemptResult.blocked) {
          return res.status(429).json({
            success: false,
            message: "Too many failed attempts. Please try again in 60 seconds.",
            blocked: true,
            remainingSeconds: 60,
            attempts: attemptResult.attempts,
          });
        }

        const attemptsRemaining = 3 - attemptResult.attempts;
        return res.status(400).json({
          success: false,
          message: errorMessage,
          attemptsRemaining,
          attempts: attemptResult.attempts,
        });
      }

      // Clear OTP attempts and block
      await RedisService.clearOTPAttempts(email);
      await RedisService.clearOTPBlock(email);

      // Generate a raw cryptographically random reset token (returned to client)
      // Store ONLY the SHA-256 hash as the Redis key so a Redis dump yields
      // no usable tokens.
      const rawToken = crypto.randomBytes(32).toString("hex");
      const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");

      // Create a clean data object with all required fields
      const resetData = {
        userId: pendingUnderLock.userId,
        email: pendingUnderLock.email || email,
        createdAt: new Date().toISOString()
      };

      const stringifiedData = JSON.stringify(resetData);

      // Key = SHA-256(rawToken) — safe to store; only the holder of rawToken can look it up
      await redis.setex(
        `reset:${hashedToken}`,
        600, // 10 minutes
        stringifiedData
      );
      await redis.setex(
        `reset_email:${hashedToken}`,
        600,
        email
      );

      // Allow brief idempotent replays (same OTP) after cleanup.
      await redis.setex(
        verifiedKey,
        120,
        JSON.stringify({ resetToken: rawToken, otpHash })
      );

      // Clean up OTP data
      await RedisService.deleteOTP(email);
      await RedisService.deletePendingPasswordReset(email);

      logger.info("OTP verified for password reset", { email });

      return res.status(200).json({
        success: true,
        message: "OTP verified successfully",
        resetToken: rawToken,   // raw token sent to client; hash stored in Redis
      });
    } finally {
      await redis.del(lockKey).catch(() => {});
    }
  } catch (error) {
    logger.error("Verify forgot password OTP error:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Server error during OTP verification" 
    });
  }
};

exports.resendForgotPasswordOTP = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res
        .status(400)
        .json({ success: false, message: "Email is required" });
    }

    const otpBlocked = await RedisService.checkOTPBlocked(email);
    if (otpBlocked.blocked) {
      return res.status(429).json({
        success: false,
        message: `Too many failed attempts. Please try again in ${otpBlocked.remainingSeconds} seconds.`,
        blocked: true,
        remainingSeconds: otpBlocked.remainingSeconds,
      });
    }

    const pendingData = await RedisService.getPendingPasswordReset(email);
    if (!pendingData) {
      return res.status(200).json({
        success: true,
        message: "If that email has a pending reset, a new OTP has been sent.",
      });
    }

    const lastResendTime = pendingData.lastResendTime;
    if (lastResendTime) {
      const timeDiff = (Date.now() - new Date(lastResendTime).getTime()) / 1000;
      if (timeDiff < 60) {
        return res.status(429).json({
          success: false,
          message: "Please wait before requesting another OTP.",
          waitTime: Math.ceil(60 - timeDiff),
        });
      }
    }

    const otp = OTPGenerator.generateOTP();

    pendingData.lastResendTime = new Date().toISOString();
    pendingData.resendCount = (pendingData.resendCount || 0) + 1;

    await RedisService.storePendingPasswordReset(email, pendingData);
    await RedisService.storeOTP(email, otp);
    await RedisService.clearOTPAttempts(email);
    await RedisService.clearOTPBlock(email);

    logger.info(`📤 Resending password reset OTP email to: ${email}`);
    void dispatchOtpEmail({
      email,
      username: pendingData.username || email,
      otp,
      type: "forgot_password",
    });

    return res.status(200).json({
      success: true,
      message: "New OTP sent to your email.",
      email,
      ...(require("../utils/devOtp").isDevOtpExposed() ? { devOtp: otp } : {}),
    });
  } catch (error) {
    logger.error("❌ Resend forgot password OTP error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};


// ==================== FIXED: resetPasswordWithToken with proper data handling ====================
exports.resetPasswordWithToken = async (req, res) => {
  try {
    const { resetToken } = req.params;
    const { email, password } = req.body;

    logger.debug("Reset password request received", { email });

    // Basic validation
    if (!resetToken) {
      return res.status(400).json({
        success: false,
        message: "Reset token is required",
      });
    }

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    if (!password) {
      return res.status(400).json({
        success: false,
        message: "Password is required",
      });
    }

    // Get Redis instance
    const redis = require("../config/redis");
    
    // Check Redis connection
    try {
      await redis.ping();
    } catch (redisError) {
      logger.error("Redis connection failed during password reset:", redisError);
      return res.status(500).json({
        success: false,
        message: "Server configuration error",
      });
    }

    // Hash the incoming token before Redis lookup — only the hash is stored
    const hashedResetToken = crypto.createHash("sha256").update(resetToken).digest("hex");
    const resetKey = `reset:${hashedResetToken}`;
    const resetEmailKey = `reset_email:${hashedResetToken}`;
    
    const stored = await redis.get(resetKey);
    const storedEmail = await redis.get(resetEmailKey);

    // Parse stored reset data
    let data;
    
    if (!stored) {
      return res.status(400).json({
        success: false,
        message: "Reset token is invalid or has expired.",
      });
    }

    if (typeof stored === 'object' && stored !== null) {
      data = stored;
    } else if (typeof stored === 'string') {
      try {
        if (stored.trim().startsWith('{') || stored.trim().startsWith('[')) {
          data = JSON.parse(stored);
        } else {
          data = { userId: stored };
        }
      } catch (parseError) {
        logger.error("Failed to parse reset data:", parseError.message);
        if (stored.match(/^[0-9a-fA-F]{24}$/)) {
          data = { userId: stored };
        } else {
          return res.status(500).json({
            success: false,
            message: "Invalid stored data format",
          });
        }
      }
    } else {
      logger.error("Unexpected stored data type:", typeof stored);
      return res.status(500).json({
        success: false,
        message: "Invalid stored data format",
      });
    }

    // Validate parsed data
    if (!data || typeof data !== 'object') {
      return res.status(500).json({
        success: false,
        message: "Invalid reset data structure",
      });
    }

    // Extract userId with fallbacks
    const userId = data.userId || data.id || data._id;
    if (!userId) {
      logger.error("Missing userId in reset data");
      return res.status(500).json({
        success: false,
        message: "Invalid reset data - missing user ID",
      });
    }

    // Determine the email to validate against
    const emailToValidate = data.email || storedEmail;
    if (!emailToValidate) {
      return res.status(500).json({
        success: false,
        message: "Invalid reset data - email not found",
      });
    }

    // Validate email
    if (emailToValidate.toLowerCase() !== email.toLowerCase()) {
      logger.warn("Email mismatch during password reset", { userId });
      return res.status(400).json({
        success: false,
        message: "Email does not match the reset token.",
      });
    }

    // Find the user
    const user = await User.findById(userId).select(
      "+password +passwordHistory"
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    // Validate password strength
    const passwordValidation = await passwordSecurity.validatePassword(
      password,
      user._id.toString(),
      true
    );

    if (!passwordValidation.isValid) {
      return res.status(400).json({
        success: false,
        message: passwordValidation.errors[0] || "Password does not meet security requirements",
        errors: passwordValidation.errors,
        strength: passwordValidation.strength,
      });
    }

    // Check password history
    const historyCheck = await user.isPasswordInHistory(password);
    if (historyCheck.inHistory) {
      return res.status(400).json({
        success: false,
        message: historyCheck.message,
      });
    }

    // Add current password to history only when a password already exists.
    if (user.password) {
      await user.addToPasswordHistory(user.password, {
        changedBy: "reset",
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      });
    }

    // Hash new password with Argon2id
    user.password = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });
    user.lastPasswordChange = new Date();
    await user.save();

    // Delete the reset token and email mapping from Redis
    await Promise.all([
      redis.del(resetKey),
      redis.del(resetEmailKey)
    ]);

    // Revoke all existing sessions
    await revokeAllUserTokens(user._id.toString());

    // Log the activity
    try {
      await user.addSecurityLog(
        "password_reset",
        req.ip,
        req.get("user-agent"),
        { method: "otp_reset" }
      );
    } catch (logErr) {
      logger.warn("Could not log password reset activity:", logErr.message);
    }

    // Send success email via queue (non-blocking)
    publishPasswordResetSuccessEmail({ email: user.email, username: user.name }).catch((emailErr) => {
      logger.warn("Could not queue reset success email:", emailErr.message);
    });

    publishAuditLog({
      action: 'password_reset_success',
      userId: user._id?.toString(),
      email: user.email,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    }).catch(() => {});

    logger.info("Password reset successfully", { userId: user._id });

    return res.status(200).json({
      success: true,
      message: "Password reset successfully. You can now login with your new password.",
    });
  } catch (error) {
    logger.error("Reset password error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error during password reset",
    });
  }
};


exports.resendOTP = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    const otpBlocked = await RedisService.checkOTPBlocked(email);
    if (otpBlocked.blocked) {
      return res.status(429).json({
        success: false,
        message: `Too many failed attempts. Please try again in ${otpBlocked.remainingSeconds} seconds.`,
        blocked: true,
        remainingSeconds: otpBlocked.remainingSeconds,
      });
    }

    const pendingData = await RedisService.getPendingRegistration(email);
    if (!pendingData) {
      return res.status(400).json({
        success: false,
        message: "No pending registration found for this email.",
      });
    }

    const lastResendTime = pendingData.lastResendTime;
    const now = new Date();

    if (lastResendTime) {
      const timeDiff = (now - new Date(lastResendTime)) / 1000;
      if (timeDiff < 60) {
        return res.status(429).json({
          success: false,
          message: "Please wait before requesting another OTP.",
          waitTime: Math.ceil(60 - timeDiff),
        });
      }
    }

    const otp = OTPGenerator.generateOTP();

    pendingData.lastResendTime = now.toISOString();
    pendingData.resendCount = (pendingData.resendCount || 0) + 1;

    await RedisService.storePendingRegistration(email, pendingData);
    await RedisService.storeOTP(email, otp);

    await RedisService.clearOTPAttempts(email);
    await RedisService.clearOTPBlock(email);

    logger.info(`📤 Resending registration OTP email to: ${email}`);
    void dispatchOtpEmail({
      email,
      username: pendingData.name,
      otp,
      type: "registration",
    });

    res.status(200).json({
      success: true,
      message: "New OTP sent to your email.",
      email: email,
    });
  } catch (error) {
    logger.error("Resend OTP error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

exports.checkRegistrationStatus = async (req, res) => {
  try {
    const { email } = req.params;

    const pendingData = await RedisService.getPendingRegistration(email);
    if (!pendingData) {
      // Return same shape regardless — prevents email enumeration
      return res.status(200).json({
        success: true,
        message: "If a registration is in progress, please check your email.",
      });
    }

    const createdAt = new Date(pendingData.createdAt);
    const expiresAt = new Date(createdAt.getTime() + 10 * 60 * 1000);
    const now = new Date();
    const expiresIn = Math.max(0, Math.floor((expiresAt - now) / 1000));

    res.status(200).json({
      success: true,
      message: "If a registration is in progress, please check your email.",
      data: {
        expiresIn,
      },
    });
  } catch (error) {
    logger.error("Check registration status error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

exports.checkPasswordExpiration = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const expirationStatus = user.passwordNeedsChange
      ? user.passwordNeedsChange()
      : {
          needsChange: false,
          daysRemaining: null,
        };

    res.status(200).json({
      success: true,
      expiration: expirationStatus,
    });
  } catch (error) {
    logger.error("❌ Check password expiration error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

exports.getPasswordRequirements = (req, res) => {
  const requirements = passwordSecurity.getPasswordRequirements();
  res.status(200).json({
    success: true,
    requirements,
  });
};

exports.setupPassword = async (req, res) => {
  try {
    const { email, password } = req.body;
    const authenticatedUserId = req.user?.id || req.user?._id;

    if (!authenticatedUserId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const user = await User.findById(authenticatedUserId).select("+password");
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });

    if (email && email.toLowerCase() !== user.email.toLowerCase()) {
      logger.warn("setupPassword ignored mismatched request email", {
        userId: user._id,
        requestedEmail: email,
      });
    }

    if (user.password) {
      return res.status(400).json({
        success: false,
        message: "Password already set. Use change password instead.",
      });
    }

    // Validate password strength
    const passwordValidation = await passwordSecurity.validatePassword(
      password,
      null,
      true,
    );

    if (!passwordValidation.isValid) {
      return res.status(400).json({
        success: false,
        message: "Password does not meet security requirements",
        errors: passwordValidation.errors,
      });
    }

    user.password = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });
    user.provider = "local";
    user.lastPasswordChange = new Date();
    await user.save();

    return res
      .status(200)
      .json({ success: true, message: "Password set up successfully." });
  } catch (error) {
    logger.error("Setup password error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.forgotPassword = async (req, res) => {
  // DEPRECATED: This legacy endpoint is superseded by initiateForgotPassword
  // which uses OTP-based reset.
  return res.status(410).json({
    success: false,
    message: "This endpoint is deprecated. Please use the OTP-based password reset flow.",
    code: "DEPRECATED",
  });
};

exports.resetPassword = async (req, res) => {
  try {
    const hashedToken = crypto
      .createHash("sha256")
      .update(req.params.resetToken)
      .digest("hex");

    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() },
    }).select("+password +passwordHistory");

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Reset token is invalid or has expired.",
      });
    }

    // SECURITY: validate password strength even on legacy route
    const passwordValidation = await passwordSecurity.validatePassword(
      req.body.password,
      user._id.toString(),
      true,
    );
    if (!passwordValidation.isValid) {
      return res.status(400).json({
        success: false,
        message: "Password does not meet security requirements",
        errors: passwordValidation.errors,
      });
    }

    // SECURITY: check password history
    const historyCheck = await user.isPasswordInHistory(req.body.password);
    if (historyCheck && historyCheck.inHistory) {
      return res.status(400).json({
        success: false,
        message: historyCheck.message || "You have used this password recently.",
      });
    }

    // Add current password to history
    if (user.password && user.addToPasswordHistory) {
      await user.addToPasswordHistory(user.password, {
        changedBy: "legacy_reset",
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      });
    }

    user.password = await argon2.hash(req.body.password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    user.lastPasswordChange = new Date();
    await user.save();

    // Revoke all sessions on password reset
    await revokeAllUserTokens(user._id.toString());

    return res.status(200).json({
      success: true,
      message: "Password reset successfully.",
    });
  } catch (error) {
    logger.error("Legacy reset password error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.register = async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    const emailRegex = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid email address",
      });
    }

    const passwordValidation = await passwordSecurity.validatePassword(
      password,
      null,
      true,
    );

    if (!passwordValidation.isValid) {
      return res.status(400).json({
        success: false,
        message: "Password does not meet security requirements",
        errors: passwordValidation.errors,
      });
    }

    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({
        success: false,
        message: "Registration failed. Please check your information and try again.",
      });
    }

    const normalizedPhone = phone ? TwilioService.normalizePhone(String(phone).trim()) : null;

    const user = await User.create({
      name,
      email,
      password,
      phone: normalizedPhone,
      provider: "local",
    });

    await sendTokenResponse(user, 201, res, "User registered successfully");
  } catch (error) {
    logger.error("Registration error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// ==================== LEGACY HELPERS ====================
// DEPRECATED: Legacy token generation uses a single shared secret.
// New code should use generateAccessToken/generateRefreshToken with
// dedicated JWT_ACCESS_SECRET / JWT_REFRESH_SECRET.
const generateToken = (id) => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is required for legacy token generation');
  }
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || "7d",
  });
};

const legacySendTokenResponse = (user, statusCode, res, message) => {
  const token = generateToken(user._id);

  const profileImageUrl = user.getProfileImage ? user.getProfileImage() : 
                         (user.profileImage || user.googleProfileImage || user.avatar || null);

  const userResponse = {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    provider: user.provider,
    avatar: user.avatar,
    profileImage: user.profileImage || null,
    profileImageKey: user.profileImageKey || null,
    googleProfileImage: user.googleProfileImage || null,
    isVerified: user.isVerified,
    profileImageUrl: profileImageUrl,
  };

  res.status(statusCode).json({
    success: true,
    message,
    user: userResponse,
  });
};

exports.generateToken = generateToken;
exports.sendTokenResponse = legacySendTokenResponse;

// ==================== FOLLOW / UNFOLLOW ====================
exports.toggleFollow = async (req, res) => {
  try {
    const targetUserId = req.params.userId;
    const currentUserId = String(req.user._id || req.user.id);

    if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
      return res.status(400).json({ success: false, message: "Invalid user ID" });
    }

    if (targetUserId === currentUserId) {
      return res.status(400).json({ success: false, message: "You cannot follow yourself" });
    }

    const currentOid = new mongoose.Types.ObjectId(currentUserId);
    const targetOid = new mongoose.Types.ObjectId(targetUserId);

    const targetUser = await User.findById(targetOid).select("_id name");
    if (!targetUser) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const unfollowResult = await User.updateOne(
      { _id: targetOid, followers: currentOid },
      { $pull: { followers: currentOid } },
    );

    let isFollowingNow;

    if (unfollowResult.modifiedCount > 0) {
      await User.updateOne({ _id: currentOid }, { $pull: { following: targetOid } });
      isFollowingNow = false;
    } else {
      await Promise.all([
        User.updateOne({ _id: targetOid }, { $addToSet: { followers: currentOid } }),
        User.updateOne({ _id: currentOid }, { $addToSet: { following: targetOid } }),
      ]);
      isFollowingNow = true;

      const currentUser = await User.findById(currentOid)
        .select("name firstName lastName profileImage googleProfileImage avatar")
        .lean();
      const followerName = currentUser?.firstName
        ? `${currentUser.firstName} ${currentUser.lastName || ""}`.trim()
        : currentUser?.name || "Someone";
      const followerAvatar =
        currentUser?.profileImage ||
        currentUser?.googleProfileImage ||
        currentUser?.avatar ||
        null;
      const followMessage = `${followerName} started following you`;

      const notification = await createNotification({
        recipient: targetUserId,
        sender: currentUserId,
        type: "follow",
        message: followMessage,
        title: "New follower",
        iconUrl: followerAvatar,
        senderName: followerName,
        metadata: { followerId: currentUserId, senderName: followerName },
      });

      // Real-time in-app delivery (FCM push is sent by createNotification).
      if (notification) {
        try {
          const io = getIO();
          if (io) {
            io.to(`user:${targetUserId}`).emit("notification:new", {
              _id: notification._id,
              type: "follow",
              message: followMessage,
              read: false,
              createdAt: notification.createdAt,
              metadata: { followerId: currentUserId, senderName: followerName },
              sender: {
                _id: currentUserId,
                name: followerName,
                profileImage: followerAvatar,
                profileImageUrl: followerAvatar,
              },
            });
          }
        } catch {
          /* socket optional */
        }
      }
    }

    const counts = await User.aggregate([
      {
        $facet: {
          target: [
            { $match: { _id: targetOid } },
            {
              $project: {
                followersCount: { $size: { $ifNull: ["$followers", []] } },
              },
            },
          ],
          current: [
            { $match: { _id: currentOid } },
            {
              $project: {
                followersCount: { $size: { $ifNull: ["$followers", []] } },
                followingCount: { $size: { $ifNull: ["$following", []] } },
              },
            },
          ],
        },
      },
    ]);

    const targetCounts = counts[0]?.target?.[0] || {};
    const currentCounts = counts[0]?.current?.[0] || {};

    // Bust both users' profile + counts caches so follower/following counts reflect immediately
    await Promise.allSettled([
      redis.del(`profile:${currentUserId}`),
      redis.del(`profile:${targetUserId}`),
      redis.del(`counts:${currentUserId}`),
      redis.del(`counts:${targetUserId}`),
    ]);

    res.status(200).json({
      success: true,
      isFollowing: isFollowingNow,
      followersCount: targetCounts.followersCount || 0,
      followingCount: currentCounts.followingCount || 0,
      myFollowersCount: currentCounts.followersCount || 0,
    });
  } catch (error) {
    logger.error("Toggle follow error:", error);
    res.status(500).json({ success: false, message: "Failed to toggle follow" });
  }
};

// ==================== GET MY FOLLOWERS / FOLLOWING LIST ====================
exports.getMyFollowers = async (req, res) => {
  try {
    const userId = req.user.id;
    const type = req.query.type || "followers"; // "followers" or "following"

    const user = await User.findById(userId).select("followers following");
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const ids = (type === "following" ? user.following : user.followers) || [];

    const followCounts = await User.aggregate([
      { $match: { _id: new mongoose.Types.ObjectId(userId) } },
      {
        $project: {
          followersCount: { $size: { $ifNull: ["$followers", []] } },
          followingCount: { $size: { $ifNull: ["$following", []] } },
        },
      },
    ]);
    const followersCount = followCounts[0]?.followersCount || 0;
    const followingCount = followCounts[0]?.followingCount || 0;

    const users = await User.find({ _id: { $in: ids } }).select(
      "name profileImage googleProfileImage avatar provider createdAt"
    );

    const list = users.map((u) => {
      const profileImageUrl = u.getProfileImage
        ? u.getProfileImage()
        : u.profileImage || u.googleProfileImage || u.avatar || null;
      return {
        id: u._id.toString(),
        name: u.name || "User",
        profileImageUrl,
        provider: u.provider,
        createdAt: u.createdAt,
      };
    });

    res.status(200).json({
      success: true,
      type,
      users: list,
      followersCount,
      followingCount,
    });
  } catch (error) {
    logger.error("Get my followers error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch followers" });
  }
};

// ==================== PUBLIC SELLER PROFILE ====================
exports.getSellerProfile = async (req, res) => {
  try {
    const sellerId = req.params.userId;
    const currentUserId = String(req.user?._id || req.user?.id || "");

    if (!mongoose.Types.ObjectId.isValid(sellerId)) {
      return res.status(400).json({ success: false, message: "Invalid user ID" });
    }

    const seller = await User.findById(sellerId).select(
      "name email profileImage googleProfileImage avatar provider createdAt"
    );

    if (!seller) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Get follower/following counts without loading the arrays
    const followCounts = await User.aggregate([
      { $match: { _id: new mongoose.Types.ObjectId(sellerId) } },
      { $project: {
        followersCount: { $size: { $ifNull: ['$followers', []] } },
        followingCount: { $size: { $ifNull: ['$following', []] } },
      }},
    ]);
    const followersCount = followCounts[0]?.followersCount || 0;
    const followingCount = followCounts[0]?.followingCount || 0;

    const isFollowedByCurrentUser = Boolean(
      currentUserId &&
        mongoose.Types.ObjectId.isValid(currentUserId) &&
        (await User.exists({
          _id: sellerId,
          followers: new mongoose.Types.ObjectId(currentUserId),
        })),
    );

    // Count seller's listings across ALL categories
    const totalListings = await countUserListings(sellerId);

    const reviewStats = await SellerReview.aggregate([
      { $match: { seller: new mongoose.Types.ObjectId(sellerId), status: "published" } },
      {
        $group: {
          _id: null,
          averageRating: { $avg: "$rating" },
          reviewsCount: { $sum: 1 },
        },
      },
    ]);
    const averageRating = reviewStats[0]?.averageRating
      ? Math.round(reviewStats[0].averageRating * 10) / 10
      : 0;
    const reviewsCount = reviewStats[0]?.reviewsCount || 0;

    const profileImageUrl = seller.getProfileImage ? seller.getProfileImage() : 
      (seller.profileImage || seller.googleProfileImage || seller.avatar || null);

    res.status(200).json({
      success: true,
      seller: {
        id: seller._id,
        _id: seller._id,
        name: seller.name,
        email: seller.email,
        provider: seller.provider,
        profileImageUrl,
        createdAt: seller.createdAt,
        isFollowedByCurrentUser,
        followers: isFollowedByCurrentUser ? [currentUserId] : [],
        followersCount,
        followingCount,
        listingsCount: totalListings,
        averageRating,
        reviewsCount,
      },
    });
  } catch (error) {
    logger.error("Get seller profile error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch seller profile" });
  }
};

// ==================== SELLER REVIEWS ====================

exports.getSellerReviews = async (req, res) => {
  try {
    const sellerId = req.params.userId;
    if (!mongoose.Types.ObjectId.isValid(sellerId)) {
      return res.status(400).json({ success: false, message: "Invalid user ID" });
    }

    const reviews = await SellerReview.find({ seller: sellerId, status: "published" })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate("reviewer", "name profileImage googleProfileImage avatar")
      .lean();

    const reviewStats = await SellerReview.aggregate([
      { $match: { seller: new mongoose.Types.ObjectId(sellerId), status: "published" } },
      {
        $group: {
          _id: null,
          averageRating: { $avg: "$rating" },
          reviewsCount: { $sum: 1 },
        },
      },
    ]);

    res.status(200).json({
      success: true,
      averageRating: reviewStats[0]?.averageRating
        ? Math.round(reviewStats[0].averageRating * 10) / 10
        : 0,
      reviewsCount: reviewStats[0]?.reviewsCount || 0,
      reviews: reviews.map((review) => ({
        id: review._id,
        rating: review.rating,
        comment: review.comment,
        createdAt: review.createdAt,
        reviewer: {
          id: review.reviewer?._id,
          name: review.reviewer?.name || "Member",
          profileImageUrl: review.reviewer
            ? getResolvedProfileImage(review.reviewer)
            : null,
        },
      })),
    });
  } catch (error) {
    logger.error("Get seller reviews error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch seller reviews" });
  }
};

exports.createSellerReview = async (req, res) => {
  try {
    const sellerId = req.params.userId;
    const reviewerId = req.user._id || req.user.id;

    if (!mongoose.Types.ObjectId.isValid(sellerId)) {
      return res.status(400).json({ success: false, message: "Invalid user ID" });
    }
    if (String(sellerId) === String(reviewerId)) {
      return res.status(400).json({ success: false, message: "You cannot review yourself" });
    }

    const rating = Number(req.body.rating);
    const comment = String(req.body.comment || "").trim();

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: "Rating must be between 1 and 5" });
    }
    if (comment.length < 10) {
      return res.status(400).json({ success: false, message: "Review must be at least 10 characters" });
    }

    const sellerExists = await User.exists({ _id: sellerId });
    if (!sellerExists) {
      return res.status(404).json({ success: false, message: "Seller not found" });
    }

    const review = await SellerReview.findOneAndUpdate(
      { seller: sellerId, reviewer: reviewerId },
      { rating, comment, status: "published" },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    ).populate("reviewer", "name profileImage googleProfileImage avatar");

    const reviewStats = await SellerReview.aggregate([
      { $match: { seller: new mongoose.Types.ObjectId(sellerId), status: "published" } },
      {
        $group: {
          _id: null,
          averageRating: { $avg: "$rating" },
          reviewsCount: { $sum: 1 },
        },
      },
    ]);

    res.status(201).json({
      success: true,
      averageRating: reviewStats[0]?.averageRating
        ? Math.round(reviewStats[0].averageRating * 10) / 10
        : 0,
      reviewsCount: reviewStats[0]?.reviewsCount || 0,
      review: {
        id: review._id,
        rating: review.rating,
        comment: review.comment,
        createdAt: review.createdAt,
        reviewer: {
          id: review.reviewer?._id,
          name: review.reviewer?.name || "Member",
          profileImageUrl: review.reviewer
            ? getResolvedProfileImage(review.reviewer)
            : null,
        },
      },
    });
  } catch (error) {
    logger.error("Create seller review error:", error);
    res.status(500).json({ success: false, message: "Failed to submit review" });
  }
};

exports.deleteSellerReview = async (req, res) => {
  try {
    const sellerId = req.params.userId;
    const reviewerId = req.user._id || req.user.id;

    if (!mongoose.Types.ObjectId.isValid(sellerId)) {
      return res.status(400).json({ success: false, message: "Invalid user ID" });
    }

    const deleted = await SellerReview.findOneAndDelete({
      seller: sellerId,
      reviewer: reviewerId,
    });

    if (!deleted) {
      return res.status(404).json({ success: false, message: "Review not found" });
    }

    const reviewStats = await SellerReview.aggregate([
      { $match: { seller: new mongoose.Types.ObjectId(sellerId), status: "published" } },
      {
        $group: {
          _id: null,
          averageRating: { $avg: "$rating" },
          reviewsCount: { $sum: 1 },
        },
      },
    ]);

    res.status(200).json({
      success: true,
      averageRating: reviewStats[0]?.averageRating
        ? Math.round(reviewStats[0].averageRating * 10) / 10
        : 0,
      reviewsCount: reviewStats[0]?.reviewsCount || 0,
    });
  } catch (error) {
    logger.error("Delete seller review error:", error);
    res.status(500).json({ success: false, message: "Failed to delete review" });
  }
};

// ==================== SELLER LISTINGS (public, auth-required) ====================
/**
 * GET /api/auth/seller/:userId/listings
 * Returns all active listings across every category for a given seller.
 */
exports.getSellerListings = async (req, res) => {
  try {
    const sellerId = req.params.userId;
    if (!mongoose.Types.ObjectId.isValid(sellerId)) {
      return res.status(400).json({ success: false, message: "Invalid user ID" });
    }

    const categoryModels = [
      { model: require("../models/electronics.model"), type: "electronics" },
      { model: require("../models/vehicle.model"), type: "vehicles" },
      { model: require("../models/mobile.model"), type: "mobiles" },
      { model: require("../models/job.model"), type: "jobs" },
      { model: require("../models/furniture.model"), type: "furniture" },
      { model: require("../models/toy.model"), type: "toys" },
      { model: require("../models/fashion.model"), type: "fashion" },
      { model: require("../models/sports.model"), type: "sports" },
      { model: require("../models/collectible.model"), type: "collectibles" },
      { model: require("../models/pet.model"), type: "pets" },
      { model: require("../models/book.model"), type: "books" },
      { model: require("../models/beauty.model"), type: "beauty" },
      { model: require("../models/other.model"), type: "others" },
      { model: require("../models/forsale.model"), type: "forsale" },
      { model: require("../models/event.model"), type: "events" },
      { model: require("../models/property.model"), type: "properties" },
      { model: require("../models/takecare.model"), type: "takecare" },
    ];

    const results = await Promise.all(
      categoryModels.map(async ({ model: Model, type }) => {
        const docs = await Model.find({ seller: sellerId, status: "active" })
          .sort({ createdAt: -1 })
          .limit(50)
          .select("title price currency countryCode images location condition subcategory category createdAt")
          .lean();
        return docs.map((d) => ({
          ...d,
          _listingType: type,
          images: (d.images || []).map((img) =>
            s3Service.toProxyUrl ? s3Service.toProxyUrl(img) : img
          ),
        }));
      })
    );

    const listings = results
      .flat()
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.status(200).json({ success: true, listings });
  } catch (error) {
    logger.error("Get seller listings error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch seller listings" });
  }
};

// ==================== EMAIL CHANGE (OTP-based verification) ====================

/**
 * POST /api/auth/request-email-change
 * Body: { newEmail }
 * Sends OTP to the NEW email. Requires auth.
 */
exports.requestEmailChange = async (req, res) => {
  try {
    const userId = req.user.id;
    const { newEmail } = req.body;

    if (!newEmail || typeof newEmail !== 'string') {
      return res.status(400).json({ success: false, message: "New email is required." });
    }

    const trimmedEmail = newEmail.trim().toLowerCase();

    // Basic email format check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      return res.status(400).json({ success: false, message: "Invalid email format." });
    }

    // Can't change to the same email
    const currentUser = await User.findById(userId).select('email');
    if (!currentUser) {
      return res.status(404).json({ success: false, message: "User not found." });
    }
    if (currentUser.email === trimmedEmail) {
      return res.status(400).json({ success: false, message: "This is already your current email." });
    }

    // Check if new email is already taken
    const emailExists = await User.findOne({ email: trimmedEmail, _id: { $ne: userId } });
    if (emailExists) {
      // Return generic message to prevent email enumeration
      return res.status(200).json({
        success: true,
        message: "Verification code sent to your new email address.",
      });
    }

    // Rate limit: max 3 email change requests per hour
    const rateLimitKey = `email_change_rate:${userId}`;
    const redis = require('../config/redis');
    const attempts = await redis.incr(rateLimitKey);
    if (attempts === 1) await redis.expire(rateLimitKey, 3600);
    if (attempts > 3) {
      return res.status(429).json({
        success: false,
        message: "Too many email change requests. Please try again later.",
      });
    }

    // Generate and store OTP — HMAC-SHA-256 so a Redis dump can't be brute-forced
    const otp = OTPGenerator.generateOTP();
    const _ecSecret =
      process.env.OTP_HMAC_SECRET ||
      process.env.JWT_ACCESS_SECRET ||
      process.env.JWT_SECRET;
    const pendingKey = `email_change:${userId}`;
    await redis.setex(pendingKey, 600, JSON.stringify({
      newEmail: trimmedEmail,
      otpHash: crypto.createHmac('sha256', _ecSecret).update(String(otp)).digest('hex'),
      createdAt: new Date().toISOString(),
    }));

    // Send OTP to the NEW email
    await EmailService.sendOTPEmail(trimmedEmail, currentUser.email.split('@')[0], otp);

    logger.info('Email change OTP sent', { userId, newEmail: trimmedEmail });

    res.status(200).json({
      success: true,
      message: "Verification code sent to your new email address.",
    });
  } catch (error) {
    logger.error("Request email change error:", error);
    res.status(500).json({ success: false, message: "Failed to send verification code." });
  }
};

/**
 * POST /api/auth/verify-email-change
 * Body: { otp }
 * Verifies OTP and updates the email. Requires auth.
 */
exports.verifyEmailChange = async (req, res) => {
  try {
    const userId = req.user.id;
    const { otp } = req.body;

    if (!otp || typeof otp !== 'string') {
      return res.status(400).json({ success: false, message: "Verification code is required." });
    }

    const redis = require('../config/redis');
    const pendingKey = `email_change:${userId}`;
    const pendingRaw = await redis.get(pendingKey);

    if (!pendingRaw) {
      return res.status(400).json({
        success: false,
        message: "No pending email change found. Please request a new verification code.",
      });
    }

    const pending = typeof pendingRaw === 'string' ? JSON.parse(pendingRaw) : pendingRaw;
    const _ecSecret =
      process.env.OTP_HMAC_SECRET ||
      process.env.JWT_ACCESS_SECRET ||
      process.env.JWT_SECRET;
    const otpHash = crypto.createHmac('sha256', _ecSecret).update(String(otp).trim()).digest('hex');

    if (!crypto.timingSafeEqual(Buffer.from(otpHash), Buffer.from(pending.otpHash))) {
      return res.status(400).json({ success: false, message: "Invalid verification code." });
    }

    // Double-check email uniqueness at write time (TOCTOU safety)
    const emailTaken = await User.findOne({ email: pending.newEmail, _id: { $ne: userId } });
    if (emailTaken) {
      await redis.del(pendingKey);
      return res.status(400).json({ success: false, message: "This email is no longer available." });
    }

    // Update the email
    const user = await User.findByIdAndUpdate(
      userId,
      { email: pending.newEmail, lastEmailChange: new Date() },
      { new: true, runValidators: true },
    );

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    // Clean up
    await redis.del(pendingKey);

    // Log the change
    try {
      await user.addSecurityLog('email_changed', req.ip, req.get('user-agent'), {
        oldEmail: req.user.email,
        newEmail: pending.newEmail,
      });
    } catch (_) {}

    logger.info('Email changed successfully', { userId, newEmail: pending.newEmail });

    res.status(200).json({
      success: true,
      message: "Email updated successfully.",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    logger.error("Verify email change error:", error);
    res.status(500).json({ success: false, message: "Failed to verify email change." });
  }
};

// ==================== PHONE AUTH: SEND OTP (Twilio Verify) ====================
/**
 * POST /api/auth/phone/send-otp
 * Body: { phone: "+919876543210", channel?: "sms" | "whatsapp" }
 *
 * Uses Twilio Verify API. Twilio stores the OTP server-side — no Redis needed.
 * Requires TWILIO_VERIFY_SERVICE_SID in .env.
 */
exports.phoneSendOTP = async (req, res) => {
  try {
    const { phone, channel = "sms" } = req.body;

    if (!phone) {
      return res.status(400).json({ success: false, message: "Phone number is required" });
    }

    if (!["sms", "whatsapp"].includes(channel)) {
      return res.status(400).json({ success: false, message: "Channel must be 'sms' or 'whatsapp'" });
    }

    // Require E.164 format: the client must send the full "+CC number" string.
    // The mobile-auth-screen uses PhoneInputWithCountry which provides E.164 directly.
    if (!TwilioVerify.isValidE164(phone)) {
      return res.status(400).json({
        success: false,
        message: "Invalid phone number. Please include the country code (e.g. +919876543210).",
      });
    }

    // Coarse rate limit: check if phone is in hard-blocked state (flood protection)
    const phoneKey = phone.replace("+", "");
    const blocked = await RedisService.checkEmailBlocked(phoneKey);
    if (blocked) {
      return res.status(429).json({
        success: false,
        message: "Too many OTP requests. Please try again in 1 hour.",
      });
    }

    // Send via Twilio Verify (Twilio generates and stores the OTP)
    const result = await TwilioVerify.sendVerification(phone, channel);

    if (!result.success) {
      logger.error("phoneSendOTP: Twilio Verify failed", { error: result.error, code: result.code });
      // Map Twilio rate-limit codes to user-friendly 429
      if (result.code === 60212 || result.code === 60202) {
        return res.status(429).json({
          success: false,
          message: result.error,
        });
      }
      return res.status(502).json({
        success: false,
        message: result.error || "Failed to send OTP. Please try again.",
      });
    }

    await RedisService.incrementRegistrationAttempts(phoneKey);

    res.status(200).json({
      success: true,
      message: "OTP sent to your phone number via SMS.",
      phone: TwilioVerify.maskPhone(phone),
      expiresIn: 600,
    });
  } catch (error) {
    logger.error("Phone send OTP error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ==================== PHONE AUTH: VERIFY OTP & LOGIN/REGISTER (Twilio Verify) ==
/**
 * POST /api/auth/phone/verify-otp
 * Body: { phone: "+919876543210", otp: "123456", name?: "John" }
 *
 * Verifies OTP via Twilio Verify API.
 * If user exists with this phone → login.
 * If user does NOT exist → register new account with phone provider.
 */
exports.phoneVerifyOTP = async (req, res) => {
  try {
    const { phone, otp, name } = req.body;

    if (!phone || !otp) {
      return res.status(400).json({
        success: false,
        message: "Phone number and OTP are required",
      });
    }

    if (!/^\d{4,10}$/.test(String(otp).trim())) {
      return res.status(400).json({
        success: false,
        message: "OTP must be 4–10 digits",
      });
    }

    if (!TwilioVerify.isValidE164(phone)) {
      return res.status(400).json({
        success: false,
        message: "Invalid phone number. Please include the country code.",
      });
    }

    // Verify OTP via Twilio Verify API
    const verifyResult = await TwilioVerify.checkVerification(phone, String(otp).trim());

    if (!verifyResult.success || !verifyResult.valid) {
      return res.status(400).json({
        success: false,
        message: verifyResult.error || "Invalid or expired OTP",
      });
    }

    const normalizedPhone = phone; // Already E.164 from the client

    // Find existing user by phone
    let user = await User.findOne({ phone: normalizedPhone }).select(
      "+password +devices +loginHistory"
    );
    let isNew = false;

    if (!user) {
      // Register new user with phone
      isNew = true;
      user = new User({
        name: name || "",
        phone: normalizedPhone,
        phoneVerified: true,
        provider: "phone",
        isVerified: true,
        status: "active",
      });
      await user.save();

      logger.info("New phone user registered", { userId: user._id, phone: normalizedPhone.slice(0, 5) + "****" });

      // Reload with selected fields
      user = await User.findById(user._id).select("+devices +loginHistory");
    } else {
      // Existing user — mark phone as verified
      if (!user.phoneVerified) {
        user.phoneVerified = true;
        await user.save();
      }
    }

    // Generate tokens
    const accessToken = generateAccessToken(user._id, req);
    const refreshToken = generateRefreshToken(user._id);
    const decoded = jwt.decode(refreshToken);

    // Create device session
    const deviceSession = await deviceService.createDeviceSession(req, decoded.jti);
    await user.updateDeviceSession(deviceSession, decoded.jti);

    // Add login history
    await user.addLoginHistory({
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
      deviceId: deviceSession.deviceId,
      deviceName: deviceSession.deviceName,
      location: deviceSession.location,
      loginType: "phone",
      success: true,
    });

    // Store refresh token in Redis
    const stored = await storeRefreshToken(user._id.toString(), refreshToken, req);
    if (!stored) {
      logger.error("Failed to store refresh token in Redis", { userId: user._id });
      clearTokenCookies(res);
      return res.status(503).json({
        success: false,
        message: "Authentication service temporarily unavailable.",
      });
    }

    setTokenCookies(res, accessToken, refreshToken);

    const profileImageUrl = s3Service.toProxyUrl(
      user.getProfileImage ? user.getProfileImage() :
      (user.profileImage || user.googleProfileImage || user.avatar || null)
    );

    const userResponse = {
      id: user._id,
      name: user.name,
      email: user.email || null,
      phone: user.phone,
      role: user.role,
      provider: user.provider,
      hasPassword: !!user.password,
      avatar: user.avatar,
      profileImage: s3Service.toProxyUrl(user.profileImage) || null,
      profileImageKey: user.profileImageKey || null,
      googleProfileImage: user.googleProfileImage || null,
      isVerified: user.isVerified,
      phoneVerified: user.phoneVerified,
      profileImageUrl,
      devices: user.devices
        ? user.devices.map((d) => deviceService.formatDeviceForDisplay(d))
        : [],
      currentDevice: deviceService.formatDeviceForDisplay(deviceSession),
    };

    const message = isNew
      ? "Account created with phone number"
      : "Phone login successful";
    const statusCode = isNew ? 201 : 200;

    logger.info(`Phone auth successful: ${normalizedPhone.slice(0, 5)}****`, {
      device: deviceSession.deviceName,
      isNew,
    });

    logger.userLog("login", {
      userId: user._id.toString(),
      phone: normalizedPhone,
      ip: req.ip,
      userAgent: req.get("user-agent"),
      provider: "phone",
      success: true,
      extra: { device: deviceSession.deviceName, location: deviceSession.location, isNew },
    });

    res.status(statusCode).json({
      success: true,
      message,
      user: userResponse,
      isNew,
    });

    // Non-blocking audit log
    publishAuditLog({
      userId: user._id.toString(),
      action: isNew ? "phone_register" : "phone_login",
      phone: normalizedPhone,
      ip: req.ip,
      userAgent: req.get("user-agent"),
      metadata: {
        device: deviceSession.deviceName,
        provider: "phone",
        location: deviceSession.location,
      },
    }).catch(() => {});
  } catch (error) {
    logger.error("Phone verify OTP error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ==================== RECOVERY PHONE: SEND OTP (authenticated) ====================
/**
 * POST /api/auth/phone/update-send-otp  [protected]
 * Body: { phone: "+919876543210", channel?: "sms" | "whatsapp" }
 * Sends an OTP to the new phone number the user wants to set as recovery phone.
 */
exports.recoveryPhoneSendOTP = async (req, res) => {
  try {
    const { phone, channel = "sms" } = req.body;
    if (!phone) return res.status(400).json({ success: false, message: "Phone number is required" });
    if (!["sms", "whatsapp"].includes(channel)) return res.status(400).json({ success: false, message: "Channel must be 'sms' or 'whatsapp'" });
    if (!TwilioVerify.isValidE164(phone)) {
      return res.status(400).json({ success: false, message: "Invalid phone number. Please include the country code (e.g. +919876543210)." });
    }

    const phoneKey = phone.replace("+", "");
    const blocked = await RedisService.checkEmailBlocked(phoneKey);
    if (blocked) return res.status(429).json({ success: false, message: "Too many OTP requests. Please try again in 1 hour." });

    const result = await TwilioVerify.sendVerification(phone, channel);
    if (!result.success) {
      if (result.code === 60212 || result.code === 60202) return res.status(429).json({ success: false, message: result.error });
      return res.status(502).json({ success: false, message: result.error || "Failed to send OTP. Please try again." });
    }

    await RedisService.incrementRegistrationAttempts(phoneKey);
    res.status(200).json({
      success: true,
      message: "OTP sent to your phone number via SMS.",
      phone: TwilioVerify.maskPhone(phone),
      expiresIn: 600,
    });
  } catch (error) {
    logger.error("Recovery phone send OTP error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ==================== RECOVERY PHONE: VERIFY OTP & UPDATE (authenticated) ====================
/**
 * POST /api/auth/phone/update-verify-otp  [protected]
 * Body: { phone: "+919876543210", otp: "123456" }
 * Verifies OTP then updates the authenticated user's phone + marks phoneVerified.
 */
exports.recoveryPhoneVerifyOTP = async (req, res) => {
  try {
    const { phone, otp } = req.body;
    if (!phone || !otp) return res.status(400).json({ success: false, message: "Phone number and OTP are required" });
    if (!/^\d{4,10}$/.test(String(otp).trim())) return res.status(400).json({ success: false, message: "OTP must be 4–10 digits" });
    if (!TwilioVerify.isValidE164(phone)) return res.status(400).json({ success: false, message: "Invalid phone number. Please include the country code." });

    const verifyResult = await TwilioVerify.checkVerification(phone, String(otp).trim());
    if (!verifyResult.success || !verifyResult.valid) {
      return res.status(400).json({ success: false, message: verifyResult.error || "Invalid or expired OTP" });
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { phone, phoneVerified: true, updatedAt: new Date() },
      { new: true },
    );
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    await invalidateAccountCaches(user._id);

    try {
      await user.addSecurityLog("phone_updated", req.ip, req.get("user-agent"), { phone: TwilioVerify.maskPhone(phone) });
    } catch (_) {}

    res.status(200).json({
      success: true,
      message: "Recovery phone updated and verified.",
      phone: user.phone,
      phoneVerified: user.phoneVerified,
    });
  } catch (error) {
    logger.error("Recovery phone verify OTP error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
/**
 * GET /api/auth/google/client-ids
 * Returns all configured Google OAuth client IDs (web + iOS + Android)
 * so mobile apps can pick the right one for their platform.
 */
exports.getGoogleClientIds = (req, res) => {
  try {
    const clientIds = {
      web: process.env.GOOGLE_CLIENT_ID || null,
      ios: process.env.GOOGLE_IOS_CLIENT_ID || null,
      android: process.env.GOOGLE_ANDROID_CLIENT_ID || null,
    };

    if (!clientIds.web && !clientIds.ios && !clientIds.android) {
      return res.status(500).json({
        success: false,
        message: "Google authentication is not configured on the server",
      });
    }

    res.status(200).json({
      success: true,
      clientIds,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ============================================================
//  EMAIL CHANGE  (authenticated, OTP-verified)
// ============================================================

/**
 * POST /api/auth/email/change-request  [protected]
 * Body: { email }
 */
exports.requestEmailChange = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: "New email is required." });
    const normalised = email.toLowerCase().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalised)) {
      return res.status(400).json({ success: false, message: "Invalid email address." });
    }

    const userId = req.user.id;
    const user = await User.findById(userId).select("+pendingEmailChange");
    if (!user) return res.status(404).json({ success: false, message: "User not found." });

    if (user.email && normalised === user.email.toLowerCase()) {
      return res.status(400).json({ success: false, message: "This is already your current email address." });
    }

    const conflict = await User.findOne({ email: normalised, _id: { $ne: userId } });
    if (conflict) {
      return res.status(409).json({ success: false, message: "This email address is already in use. Please use a different email." });
    }

    // Rate-gate: 3 OTPs per 10 min per user
    const rateLimitKey = `email_change_otp:${userId}`;
    try {
      const hits = await redis.incr(rateLimitKey);
      if (hits === 1) await redis.expire(rateLimitKey, 600);
      if (hits > 3) {
        const ttl = await redis.ttl(rateLimitKey);
        return res.status(429).json({ success: false, message: "Too many OTP requests. Please wait before trying again.", retryAfter: ttl > 0 ? ttl : 600, code: "RATE_LIMITED" });
      }
    } catch (rateErr) {
      logger.warn("requestEmailChange rate-limit skipped", { error: rateErr.message });
    }

    const otp = OTPGenerator.generateOTP();
    // HMAC-SHA-256 with server secret: an offline attacker who reads the DB
    // cannot brute-force the 6-digit OTP without knowing the secret key.
    const _otpSecret =
      process.env.OTP_HMAC_SECRET ||
      process.env.JWT_ACCESS_SECRET ||
      process.env.JWT_SECRET;
    const otpHash = crypto.createHmac("sha256", _otpSecret).update(otp).digest("hex");
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await User.findByIdAndUpdate(userId, {
      pendingEmailChange: { email: normalised, otpHash, expiresAt, attempts: 0, requestedAt: new Date() },
    });

    const { isDevOtpExposed } = require("../utils/devOtp");

    // Send email in background — don't block the HTTP response on SMTP timeouts.
    void EmailService.sendEmailChangeOTP(normalised, user.name || "there", otp).catch((emailErr) => {
      logger.error("requestEmailChange email delivery failed", {
        error: emailErr.message,
        newEmail: normalised,
      });
      if (isDevOtpExposed()) {
        logger.info("[email_change] DEV OTP (email delivery failed)", { email: normalised, otp });
      }
    });

    if (user.email) {
      void EmailService.sendEmailChangeAlert(
        user.email,
        user.name || "there",
        normalised,
        req.ip,
        Date.now(),
      ).catch((alertErr) => {
        logger.warn("Email-change alert failed (non-fatal)", { error: alertErr.message });
      });
    }

    logger.info("[email_change] OTP sent", { userId, newEmail: normalised });

    const payload = {
      success: true,
      message: "A 6-digit verification code has been sent to your new email address.",
      maskedEmail: normalised.replace(/^(.{2}).+(@.+)$/, "$1****$2"),
      expiresIn: 300,
    };
    if (isDevOtpExposed()) {
      payload.devOtp = otp;
    }
    res.status(200).json(payload);
  } catch (error) {
    logger.error("requestEmailChange error:", error);
    res.status(500).json({ success: false, message: "Server error." });
  }
};

/**
 * POST /api/auth/email/change-verify  [protected]
 * Body: { email, otp }
 */
exports.verifyEmailChange = async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ success: false, message: "Email and OTP are required." });
    if (!/^\d{6}$/.test(String(otp).trim())) return res.status(400).json({ success: false, message: "OTP must be 6 digits." });
    const normalised = email.toLowerCase().trim();

    const userId = req.user.id;
    const user = await User.findById(userId).select("+pendingEmailChange.otpHash +pendingEmailChange");
    if (!user) return res.status(404).json({ success: false, message: "User not found." });

    const pending = user.pendingEmailChange;
    if (!pending || !pending.email || !pending.otpHash) {
      return res.status(400).json({ success: false, message: "No pending email change found. Please request a new OTP." });
    }
    if (pending.email.toLowerCase() !== normalised) {
      return res.status(400).json({ success: false, message: "Email mismatch. Please request a new OTP." });
    }
    if (new Date() > new Date(pending.expiresAt)) {
      return res.status(400).json({ success: false, message: "OTP has expired. Please request a new one.", code: "OTP_EXPIRED" });
    }
    if ((pending.attempts || 0) >= 5) {
      return res.status(429).json({ success: false, message: "Maximum OTP attempts exceeded. Please request a new OTP.", code: "MAX_ATTEMPTS" });
    }

    const _otpSecret =
      process.env.OTP_HMAC_SECRET ||
      process.env.JWT_ACCESS_SECRET ||
      process.env.JWT_SECRET;
    const otpHash = crypto.createHmac("sha256", _otpSecret).update(String(otp).trim()).digest("hex");
    if (otpHash !== pending.otpHash) {
      await User.findByIdAndUpdate(userId, { $inc: { "pendingEmailChange.attempts": 1 } });
      const remaining = 4 - (pending.attempts || 0);
      return res.status(400).json({
        success: false,
        message: `Incorrect OTP. ${remaining > 0 ? remaining + " attempt(s) remaining." : "Please request a new OTP."}`,
        attemptsRemaining: Math.max(0, remaining),
      });
    }

    const oldEmail = user.email;
    await User.findByIdAndUpdate(userId, {
      email: normalised,
      isVerified: true,
      lastEmailChange: new Date(),
      $unset: { pendingEmailChange: 1 },
    });

    await invalidateAccountCaches(userId);

    try {
      await User.findByIdAndUpdate(userId, {
        $push: {
          securityLogs: {
            action: "email_changed",
            timestamp: new Date(),
            ip: req.ip,
            userAgent: req.get("user-agent"),
            details: { oldEmail, newEmail: normalised },
          },
        },
      });
    } catch (_) {}

    logger.info("[email_change] email updated", { userId, oldEmail, newEmail: normalised });

    res.status(200).json({
      success: true,
      message: "Email address updated successfully.",
      email: normalised,
    });
  } catch (error) {
    logger.error("verifyEmailChange error:", error);
    res.status(500).json({ success: false, message: "Server error." });
  }
};

// ============================================================
//  PRIMARY PHONE CHANGE  (authenticated, OTP-verified via Twilio)
// ============================================================

/**
 * POST /api/auth/phone/change-request  [protected]
 * Body: { phone, channel? }
 */
exports.requestPhoneChange = async (req, res) => {
  try {
    const { phone, channel = "sms" } = req.body;
    if (!phone) return res.status(400).json({ success: false, message: "Phone number is required." });
    if (!["sms", "whatsapp"].includes(channel)) return res.status(400).json({ success: false, message: "Channel must be 'sms' or 'whatsapp'." });
    if (!TwilioVerify.isValidE164(phone)) {
      return res.status(400).json({ success: false, message: "Invalid phone number. Please include the country code (e.g. +919876543210)." });
    }

    const userId = req.user.id;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: "User not found." });

    if (user.phone && user.phone === phone) {
      return res.status(400).json({ success: false, message: "This is already your current phone number." });
    }

    const conflict = await User.findOne({ phone, _id: { $ne: userId } });
    if (conflict) {
      return res.status(409).json({ success: false, message: "This phone number is already registered to another account." });
    }

    const phoneKey = phone.replace("+", "");
    const blocked = await RedisService.checkEmailBlocked(phoneKey);
    if (blocked) return res.status(429).json({ success: false, message: "Too many OTP requests. Please try again in 1 hour." });

    const result = await TwilioVerify.sendVerification(phone, channel);
    if (!result.success) {
      if (result.code === 60212 || result.code === 60202) return res.status(429).json({ success: false, message: result.error });
      return res.status(502).json({ success: false, message: result.error || "Failed to send OTP. Please try again." });
    }

    await RedisService.incrementRegistrationAttempts(phoneKey);

    await User.findByIdAndUpdate(userId, {
      pendingPhoneChange: { phone, requestedAt: new Date() },
    });

    // Best-effort SMS alert to old number
    if (user.phone) {
      try {
        await TwilioService.sendSMS(
          user.phone,
          "Listifys security alert: A request was made to change your phone number. If this wasn't you, please secure your account immediately.",
        );
      } catch (_) {}
    }

    logger.info("[phone_change] OTP sent", { userId, newPhone: TwilioVerify.maskPhone(phone) });

    res.status(200).json({
      success: true,
      message: `A verification code has been sent via ${channel === "whatsapp" ? "WhatsApp" : "SMS"}.`,
      phone: TwilioVerify.maskPhone(phone),
      expiresIn: 300,
    });
  } catch (error) {
    logger.error("requestPhoneChange error:", error);
    res.status(500).json({ success: false, message: "Server error." });
  }
};

/**
 * POST /api/auth/phone/change-verify  [protected]
 * Body: { phone, otp }
 */
exports.verifyPhoneChange = async (req, res) => {
  try {
    const { phone, otp } = req.body;
    if (!phone || !otp) return res.status(400).json({ success: false, message: "Phone number and OTP are required." });
    if (!/^\d{4,10}$/.test(String(otp).trim())) return res.status(400).json({ success: false, message: "OTP must be 4–10 digits." });
    if (!TwilioVerify.isValidE164(phone)) return res.status(400).json({ success: false, message: "Invalid phone number. Please include the country code." });

    const userId = req.user.id;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: "User not found." });

    if (!user.pendingPhoneChange || user.pendingPhoneChange.phone !== phone) {
      return res.status(400).json({ success: false, message: "No pending phone change found for this number. Please request a new OTP." });
    }

    const verifyResult = await TwilioVerify.checkVerification(phone, String(otp).trim());
    if (!verifyResult.success || !verifyResult.valid) {
      return res.status(400).json({ success: false, message: verifyResult.error || "Invalid or expired OTP." });
    }

    const oldPhone = user.phone;
    await User.findByIdAndUpdate(userId, {
      phone,
      phoneVerified: true,
      lastPhoneChange: new Date(),
      $unset: { pendingPhoneChange: 1 },
    });

    await invalidateAccountCaches(userId);

    try {
      await User.findByIdAndUpdate(userId, {
        $push: {
          securityLogs: {
            action: "phone_changed",
            timestamp: new Date(),
            ip: req.ip,
            userAgent: req.get("user-agent"),
            details: {
              oldPhone: oldPhone ? TwilioVerify.maskPhone(oldPhone) : null,
              newPhone: TwilioVerify.maskPhone(phone),
            },
          },
        },
      });
    } catch (_) {}

    logger.info("[phone_change] phone updated", { userId, newPhone: TwilioVerify.maskPhone(phone) });

    res.status(200).json({
      success: true,
      message: "Phone number updated and verified.",
      phone,
      phoneVerified: true,
    });
  } catch (error) {
    logger.error("verifyPhoneChange error:", error);
    res.status(500).json({ success: false, message: "Server error." });
  }
};
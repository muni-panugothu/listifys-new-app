const { 
  PutObjectCommand, 
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command
} = require('@aws-sdk/client-s3');
const crypto = require('crypto');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { s3Client } = require('../config/aws');
const { logger } = require('../utils/logger');

const ensureS3 = () => {
  if (!s3Client) throw new Error('AWS S3 is not configured. Set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_REGION.');
};

const IMAGE_EXT_REGEX = /\.(?:jpeg|jpg|png|webp|gif|avif|heic|heif|bmp|tiff)$/i;
const LEGACY_IMAGE_PREFIX = process.env.LEGACY_IMAGE_PREFIX || 'listings';
const S3_KEY_PREFIXES = [
  'profiles/',
  'electronics/',
  'vehicles/',
  'mobiles/',
  'furniture/',
  'fashion/',
  'sports/',
  'collectibles/',
  'pets/',
  'toys/',
  'books/',
  'beauty/',
  'others/',
  'takecare/',
  'events/',
  'forsale/',
  'listings/',
  'services/',
  'properties/',
  'jobs/',
  'chats/',
];

const toOrigin = (value) => {
  if (!value || typeof value !== 'string') return null;
  try {
    const parsed = new URL(value.trim());
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return null;
  }
};

class S3Service {
  constructor() {
    this.bucketName = process.env.AWS_S3_BUCKET_NAME;
    const region = process.env.AWS_REGION || 'us-east-1';
    const canonicalUrl = `https://${this.bucketName}.s3.${region}.amazonaws.com`;

    const envBucketUrl = process.env.AWS_S3_BUCKET_URL;

    this.bucketUrl = (envBucketUrl && !envBucketUrl.includes('your-') && !envBucketUrl.includes('optional'))
      ? envBucketUrl
      : canonicalUrl;

    const envCloudfrontUrl = process.env.AWS_CLOUDFRONT_URL;
    this.cloudfrontUrl = (envCloudfrontUrl && !envCloudfrontUrl.includes('your-') && !envCloudfrontUrl.includes('optional'))
      ? envCloudfrontUrl
      : null;
    this.forceImageProxy = process.env.AWS_S3_FORCE_PROXY === 'true';

    // Use PUBLIC_API_BASE_URL only. Do NOT infer from GOOGLE_CALLBACK_URL —
    // it's often "http://localhost" which bakes broken absolute URLs into MongoDB.
    // When empty, getImageUrl() returns relative "/api/images/..." paths that
    // work correctly behind Nginx reverse proxy in Docker/AWS.
    const envApiBase = (process.env.PUBLIC_API_BASE_URL || '').trim();
    this.publicApiBase = envApiBase ? envApiBase.replace(/\/$/, '') : '';

    this.clientOrigins = (process.env.CLIENT_URL || '')
      .split(',')
      .map((origin) => toOrigin(origin))
      .filter(Boolean);

    logger.info(`📦 S3 Image URL base: ${this.cloudfrontUrl || (this.forceImageProxy ? 'API proxy' : this.bucketUrl)}`);
  }

  buildAbsoluteApiUrl(pathname) {
    const path = pathname.startsWith('/') ? pathname : `/${pathname}`;
    return this.publicApiBase ? `${this.publicApiBase}${path}` : path;
  }

  sanitizePathPart(value, fallback = 'unknown') {
    const cleaned = String(value || fallback)
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '');
    return cleaned || fallback;
  }

  createUniqueKey(prefix, baseName, ext) {
    const safePrefix = prefix.endsWith('/') ? prefix : `${prefix}/`;
    const safeBaseName = this.sanitizePathPart(baseName, 'image');
    const safeExt = this.sanitizePathPart(ext, 'jpg');
    const randomSuffix = crypto.randomBytes(6).toString('hex');
    return `${safePrefix}${safeBaseName}-${Date.now()}-${randomSuffix}.${safeExt}`;
  }

  /**
   * Get the next sequential image number for a given S3 prefix.
   * Lists existing objects and returns max(number) + 1.
   *
   * @param {string} prefix - S3 key prefix (e.g. 'profiles/userId/')
   * @returns {Promise<number>} Next number (starts at 1)
   */
  async getNextSequentialNumber(prefix) {
    try {
      ensureS3();
      const command = new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: prefix,
      });
      const response = await s3Client.send(command);
      const contents = response.Contents || [];

      let maxNum = 0;
      for (const item of contents) {
        // Extract number from keys like "profiles/userId/image3.jpeg"
        const match = item.Key.match(/image(\d+)\./);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNum) maxNum = num;
        }
      }
      return maxNum + 1;
    } catch (error) {
      logger.warn('Failed to list objects for sequential numbering, defaulting to 1:', error.message);
      return 1;
    }
  }


  async getPresignedUploadUrl(prefix, mimeType) {
    const ext = mimeType.split('/')[1] || 'jpg';
    const key = this.createUniqueKey(prefix, 'image', ext);
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      ContentType: mimeType,
      CacheControl: 'max-age=31536000',
    });
    const url = await getSignedUrl(s3Client, command, { expiresIn: 300 });
    return { url, key, publicUrl: this.getImageUrl(key) };
  }

  extractKeyFromUrl(imageUrl) {
    if (!imageUrl) return null;
    try {
      const base = (this.cloudfrontUrl || this.bucketUrl).replace(/\/$/, '');
      if (imageUrl.startsWith(base)) return imageUrl.slice(base.length + 1).split('?')[0];
      if (imageUrl.includes('.amazonaws.com/')) return imageUrl.split('.amazonaws.com/')[1].split('?')[0];
      return null;
    } catch { return null; }
  }

  /**
   * Upload profile image to S3 with optimization.
   * Images are stored sequentially: profiles/{userId}/image1.jpeg, image2.jpeg, ...
   * Old images are kept for history.
   *
   * @param {Buffer} fileBuffer - Image buffer
   * @param {string} userId - User ID
   * @param {string} mimeType - MIME type
   * @returns {Promise<Object>} Upload result
   */
  async uploadProfileImage(fileBuffer, userId, mimeType) {
    try {
      ensureS3();
      const ext = mimeType === 'image/webp' ? 'webp' : mimeType.split('/')[1] || 'jpeg';
      
      const prefix = `profiles/${userId}/`;
      const fileName = this.createUniqueKey(prefix, 'image', ext);
      
      // Upload to S3
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: fileName,
        Body: fileBuffer,
        ContentType: mimeType,
        CacheControl: 'max-age=31536000', // 1 year cache
        Metadata: {
          userId: userId,
          uploadedAt: new Date().toISOString(),
        },
      });

      await s3Client.send(command);

      // Generate public URL
      const imageUrl = this.getImageUrl(fileName);

      logger.info('✅ Profile image uploaded to S3', {
        userId,
        fileName,
        size: fileBuffer.length,
      });

      return {
        success: true,
        imageUrl,
        fileName,
        key: fileName,
      };
    } catch (error) {
      logger.error('❌ Failed to upload image to S3:', error);
      if (error.name === 'AccessDenied' || error.Code === 'AccessDenied' || (error.message && error.message.includes('Access Denied'))) {
        logger.error('💡 S3 Access Denied — check IAM policy has s3:PutObject, s3:ListBucket on bucket:', this.bucketName);
        throw new Error('Image upload failed: S3 access denied. Check IAM policy for profiles/* and bucket permissions.');
      }
      if (String(error.message || '').includes('AWS S3 is not configured')) {
        throw new Error('Image upload failed: AWS S3 is not configured.');
      }
      throw new Error(`Image upload failed: ${error.message}`);
    }
  }

  async optimizeImage(buffer, originalMimeType = 'image/jpeg') {
    try {
      const { compressImage } = require('./imagecompressor.service');
      const result = await compressImage(buffer, 'profile');
      return { buffer: result.buffer, contentType: result.contentType, extension: result.extension };
    } catch (error) {
      logger.warn('Image optimization failed, using original:', error);
      const ext = originalMimeType.split('/')[1] || 'jpeg';
      return { buffer, contentType: originalMimeType, extension: ext };
    }
  }

  /**
   * Download a remote image URL and upload it to S3 as a user's profile image.
   * Used when a user logs in with Google to persist their Google profile picture.
   *
   * @param {string} imageUrl - Remote image URL (e.g. Google profile picture)
   * @param {string} userId - User ID
   * @returns {Promise<Object|null>} Upload result or null on failure
   */
  async uploadRemoteProfileImage(imageUrl, userId) {
    if (!imageUrl || !userId) return null;
    try {
      ensureS3();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(imageUrl, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Listify-Server/1.0' },
      });
      clearTimeout(timeout);

      if (!response.ok) {
        logger.warn('Failed to download remote profile image', { status: response.status, imageUrl });
        return null;
      }

      const contentType = response.headers.get('content-type') || 'image/jpeg';
      const buffer = Buffer.from(await response.arrayBuffer());

      if (buffer.length < 100 || buffer.length > 10 * 1024 * 1024) {
        logger.warn('Remote profile image invalid size', { size: buffer.length });
        return null;
      }

      // Optimize before uploading
      const optimized = await this.optimizeImage(buffer, contentType);

      return await this.uploadProfileImage(optimized.buffer, userId, optimized.contentType);
    } catch (error) {
      logger.warn('Failed to upload remote profile image to S3:', error.message);
      return null;
    }
  }

  /**
   * Delete image from S3
   * @param {string} key - S3 object key
   * @returns {Promise<boolean>} Success status
   */
  async deleteImage(key) {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      await s3Client.send(command);

      logger.info('✅ Image deleted from S3', { key });
      return true;
    } catch (error) {
      logger.error('❌ Failed to delete image from S3:', error);
      return false;
    }
  }

  /**
   * Get user's profile images
   * @param {string} userId - User ID
   * @returns {Promise<Array>} List of images
   */
  async getUserImages(userId) {
    try {
      const command = new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: `profiles/${userId}/`,
      });

      const response = await s3Client.send(command);
      
      return (response.Contents || []).map(item => ({
        key: item.Key,
        url: this.getImageUrl(item.Key),
        size: item.Size,
        lastModified: item.LastModified,
      }));
    } catch (error) {
      logger.error('❌ Failed to list user images:', error);
      return [];
    }
  }

  /**
   * Generate pre-signed URL for temporary access
   * @param {string} key - S3 object key
   * @param {number} expiresIn - Expiry time in seconds
   * @returns {Promise<string>} Pre-signed URL
   */
  async getSignedUrl(key, expiresIn = 3600) {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const url = await getSignedUrl(s3Client, command, { expiresIn });
      return url;
    } catch (error) {
      logger.error('❌ Failed to generate signed URL:', error);
      throw error;
    }
  }

  getImageUrl(key) {
    const safeKey = String(key || '').replace(/^\/+/, '');
    if (this.cloudfrontUrl) {
      return `${this.cloudfrontUrl.replace(/\/$/, '')}/${safeKey}`;
    }
    if (!this.forceImageProxy && this.bucketUrl) {
      return `${this.bucketUrl.replace(/\/$/, '')}/${safeKey}`;
    }
    return this.buildAbsoluteApiUrl(`/api/images/${safeKey}`);
  }

  toProxyUrl(url) {
    if (!url || typeof url !== 'string') return url;

    const trimmed = url.trim();
    if (!trimmed) return trimmed;

    if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
      return trimmed;
    }

    const normalizeProxyKey = (value) => {
      const raw = String(value || '').replace(/^\/api\/images\//, '').replace(/^\/+/, '');
      if (!raw) return raw;

      if (/^https?:\/\//i.test(raw)) {
        try {
          const nested = new URL(raw);
          if (nested.pathname.startsWith('/api/images/')) {
            return nested.pathname.slice('/api/images/'.length).replace(/^\/+/, '');
          }
          return nested.pathname.replace(/^\/+/, '');
        } catch {
          return raw;
        }
      }

      return raw;
    };

    // Already a proxy URL
    if (trimmed.startsWith('/api/images/')) {
      const key = normalizeProxyKey(trimmed);
      return this.getImageUrl(key);
    }

    // Legacy relative/static paths should point to backend origin in production
    if (trimmed.startsWith('/uploads/') || trimmed.startsWith('/images/') || trimmed.startsWith('/storage/')) {
      return this.buildAbsoluteApiUrl(trimmed);
    }

    // Extract S3 key from any recognized URL format
    let key = null;

    if (this.bucketUrl && trimmed.startsWith(this.bucketUrl)) {
      key = trimmed.slice(this.bucketUrl.length + 1);
    } else if (this.cloudfrontUrl && trimmed.startsWith(this.cloudfrontUrl)) {
      key = trimmed.slice(this.cloudfrontUrl.length + 1);
    } else {
      const s3Match = trimmed.match(/^https?:\/\/[^/]+\.s3\.[^/]+\.amazonaws\.com\/(.+)$/);
      if (s3Match) key = s3Match[1];
    }

    if (!key) {
      try {
        const parsed = new URL(trimmed);
        // Prevent proxy URLs from being wrapped again (e.g. /api/images/http://...)
        if (parsed.pathname.startsWith('/api/images/')) {
          const proxiedKey = normalizeProxyKey(parsed.pathname);
          if (!proxiedKey) return this.buildAbsoluteApiUrl('/api/images/');
          return this.getImageUrl(proxiedKey);
        }

        const origin = `${parsed.protocol}//${parsed.host}`;

        if (this.clientOrigins.includes(origin) && IMAGE_EXT_REGEX.test(parsed.pathname)) {
          const pathnameKey = parsed.pathname.replace(/^\/+/, '');
          key = pathnameKey.includes('/') ? pathnameKey : `${LEGACY_IMAGE_PREFIX}/${pathnameKey}`;
        }
      } catch {
        // Not an absolute URL. Continue with relative key checks.
      }
    }

    if (!key) {
      const normalized = trimmed.replace(/^\/+/, '');
      const hasKnownPrefix = S3_KEY_PREFIXES.some((prefix) => normalized.startsWith(prefix));

      if (hasKnownPrefix) {
        key = normalized;
      } else if (IMAGE_EXT_REGEX.test(normalized) && normalized.includes('/') && !normalized.includes('://')) {
        key = normalized;
      } else if (IMAGE_EXT_REGEX.test(normalized)) {
        key = `${LEGACY_IMAGE_PREFIX}/${normalized}`;
      }
    }

    if (!key) {
      if (trimmed.startsWith('/')) {
        return this.buildAbsoluteApiUrl(trimmed);
      }
      return trimmed;
    }

    // Prefer CDN delivery; fall back to proxy
    if (this.cloudfrontUrl) {
      return `${this.cloudfrontUrl.replace(/\/$/, '')}/${key}`;
    }
    return this.getImageUrl(key);
  }

  /**
   * Generate upload URL for client-side upload
   * @param {string} userId - User ID
   * @param {string} fileType - MIME type
   * @returns {Promise<Object>} Upload URL and fields
   */
  async generateUploadUrl(userId, fileType) {
    try {
      const prefix = `profiles/${userId}/`;
      const ext = fileType.split('/')[1] || 'jpeg';
      const fileName = this.createUniqueKey(prefix, 'image', ext);
      
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: fileName,
        ContentType: fileType,
        CacheControl: 'max-age=31536000',
        Metadata: {
          userId: userId,
          uploadedAt: new Date().toISOString(),
        },
      });

      const uploadUrl = await getSignedUrl(s3Client, command, { 
        expiresIn: 300, // 5 minutes
      });

      return {
        uploadUrl,
        fileKey: fileName,
        imageUrl: this.getImageUrl(fileName),
      };
    } catch (error) {
      logger.error('❌ Failed to generate upload URL:', error);
      throw error;
    }
  }

  async uploadListingImage(fileBuffer, userId, mimeType, category = 'listings') {
    const ext = mimeType === 'image/webp' ? 'webp' : mimeType.split('/')[1] || 'webp';
    const normalizedCategory = this.sanitizePathPart(category, 'listings');
    const candidateFolders = Array.from(new Set([
      normalizedCategory,
      'listings',
      'profiles',
    ]));

    try {
      ensureS3();

      let lastError = null;
      for (const folder of candidateFolders) {
        try {
          const folderPrefix = `${folder}/${userId}/`;
          const namePrefix = folder === 'profiles' ? 'listing-image' : 'image';
          const fileName = this.createUniqueKey(folderPrefix, namePrefix, ext);

          const command = new PutObjectCommand({
            Bucket: this.bucketName,
            Key: fileName,
            Body: fileBuffer,
            ContentType: mimeType,
            CacheControl: 'max-age=31536000, public',
            Metadata: {
              userId: userId,
              category: folder,
              uploadedAt: new Date().toISOString(),
              type: 'listing',
            },
          });

          await s3Client.send(command);

          const imageUrl = this.getImageUrl(fileName);
          logger.info('✅ Listing image uploaded to S3', {
            userId,
            fileName,
            size: fileBuffer.length,
          });

          return {
            success: true,
            imageUrl,
            fileName,
            key: fileName,
          };
        } catch (attemptError) {
          lastError = attemptError;
          const denied = attemptError.name === 'AccessDenied' || attemptError.Code === 'AccessDenied' || String(attemptError.message || '').includes('Access Denied');
          if (!denied) break;
          logger.warn(`Listing upload denied for folder "${folder}", trying next fallback folder`);
        }
      }

      throw lastError || new Error('Unknown S3 upload error');
    } catch (error) {
      logger.error('❌ Failed to upload listing image to S3:', error);
      if (error.name === 'AccessDenied' || error.Code === 'AccessDenied' || (error.message && error.message.includes('Access Denied'))) {
        logger.error('💡 S3 Access Denied — check IAM policy has s3:PutObject, s3:ListBucket on bucket and listing prefixes');
        throw new Error('Listing image upload failed: S3 access denied. Allow prefixes for services/, properties/, listings/, or profiles/.');
      }
      if (String(error.message || '').includes('AWS S3 is not configured')) {
        throw new Error('Listing image upload failed: AWS S3 is not configured.');
      }
      throw new Error(`Listing image upload failed: ${error.message}`);
    }
  }

  async uploadListingVideo(fileBuffer, userId, mimeType, category = 'listings', originalName = 'video.mp4') {
    try {
      ensureS3();

      const safeName = String(originalName || 'video.mp4').replace(/[^a-zA-Z0-9._-]/g, '_');
      const extFromName = safeName.includes('.') ? safeName.split('.').pop() : '';
      const extFromMime = String(mimeType || '').split('/')[1] || 'mp4';
      const ext = (extFromName || extFromMime || 'mp4').toLowerCase();
      const normalizedCategory = this.sanitizePathPart(category, 'listings');
      const prefix = `${normalizedCategory}/${userId}/`;
      const base = safeName.replace(/\.[^.]+$/, '') || 'video';
      const key = this.createUniqueKey(prefix, base, ext);

      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: fileBuffer,
        ContentType: mimeType || 'video/mp4',
        CacheControl: 'public, max-age=31536000, immutable',
        Metadata: {
          userId: String(userId),
          category: normalizedCategory,
          uploadedAt: new Date().toISOString(),
          type: 'listing_video',
        },
      });

      await s3Client.send(command);

      const videoUrl = this.getImageUrl(key);
      logger.info('Listing video uploaded to S3', {
        userId,
        key,
        size: fileBuffer.length,
      });

      return {
        success: true,
        videoUrl,
        key,
        fileName: key,
      };
    } catch (error) {
      logger.error('Failed to upload listing video to S3:', error);
      throw new Error(`Listing video upload failed: ${error.message}`);
    }
  }

  async uploadChatAttachment(fileBuffer, userId, mimeType, originalName = 'file') {
    try {
      ensureS3();

      const safeName = String(originalName || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
      const extFromName = safeName.includes('.') ? safeName.split('.').pop() : '';
      const extFromMime = String(mimeType || '').split('/')[1] || 'bin';
      const ext = (extFromName || extFromMime || 'bin').toLowerCase();

      const prefix = `chats/${userId}/`;
      const base = safeName.replace(/\.[^.]+$/, '') || 'file';
      const key = this.createUniqueKey(prefix, base, ext);

      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: fileBuffer,
        ContentType: mimeType || 'application/octet-stream',
        CacheControl: 'public, max-age=31536000, immutable',
        Metadata: {
          userId: String(userId),
          uploadedAt: new Date().toISOString(),
          type: 'chat_attachment',
        },
      });

      await s3Client.send(command);

      return {
        success: true,
        key,
        url: this.getImageUrl(key),
      };
    } catch (error) {
      logger.error('Failed to upload chat attachment to S3:', error);
      throw new Error(`Chat attachment upload failed: ${error.message}`);
    }
  }

  /**
   * Validate image file
   * @param {Object} file - File object
   * @returns {Object} Validation result
   */
  validateImage(file) {
    const allowedTypes = [
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
      'image/avif', 'image/heic', 'image/heif', 'image/bmp', 'image/tiff',
    ];
    const maxSize = 50 * 1024 * 1024; // 50MB

    if (!allowedTypes.includes(file.mimetype)) {
      return {
        valid: false,
        error: 'Invalid file type. Please upload JPEG, PNG, GIF, WebP, HEIC, AVIF, BMP, or TIFF.',
      };
    }

    if (file.size > maxSize) {
      return {
        valid: false,
        error: 'File too large. Maximum size is 50MB.',
      };
    }

    return { valid: true };
  }

  /**
   * Extract S3 object key from a stored image URL.
   * Supports proxy URLs (/api/images/<key>) and full S3/CloudFront URLs.
   *
   * @param {string} imageUrl
   * @returns {string|null}
   */
  extractKeyFromImageUrl(imageUrl) {
    if (!imageUrl || typeof imageUrl !== 'string') return null;

    // Proxy URL format
    if (imageUrl.startsWith('/api/images/')) {
      return imageUrl.replace('/api/images/', '');
    }

    const directKey = this.extractKeyFromUrl(imageUrl);
    if (directKey) return directKey;

    // Convert full URLs to proxy URL first, then extract key
    const proxyUrl = this.toProxyUrl(imageUrl);
    if (proxyUrl && proxyUrl.startsWith('/api/images/')) {
      return proxyUrl.replace('/api/images/', '');
    }

    return null;
  }

  /**
   * Delete multiple listing images by URL.
   * Non-image/non-S3 URLs are ignored safely.
   *
   * @param {string[]} imageUrls
   * @returns {Promise<{requested: number, deleted: number}>}
   */
  async deleteImagesByUrls(imageUrls = []) {
    const keys = (imageUrls || [])
      .map((url) => this.extractKeyFromImageUrl(url))
      .filter(Boolean);

    if (keys.length === 0) {
      return { requested: 0, deleted: 0 };
    }

    let deleted = 0;
    await Promise.all(
      keys.map(async (key) => {
        const ok = await this.deleteImage(key);
        if (ok) deleted += 1;
      })
    );

    return { requested: keys.length, deleted };
  }
}

module.exports = new S3Service();

const multer = require('multer');
const { logger } = require('../utils/logger');

const storage = multer.memoryStorage();

const ALLOWED_VIDEO_MIMES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-m4v',
  'video/3gpp',
]);

const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // 100 MB
const MAX_VIDEOS_PER_REQUEST = 3;

/**
 * Validate video container magic bytes (MP4/MOV/WebM).
 */
const validateVideoMagicBytes = (buffer) => {
  if (!buffer || buffer.length < 12) return false;

  // WebM / Matroska
  const webmMagic = buffer.slice(0, 4).toString('hex').toLowerCase();
  if (webmMagic === '1a45dfa3') return true;

  // MP4 / MOV (ISO BMFF): ....ftyp
  const ftypMarker = buffer.slice(4, 8).toString('ascii');
  if (ftypMarker === 'ftyp') return true;

  return false;
};

const fileFilter = (req, file, cb) => {
  if (ALLOWED_VIDEO_MIMES.has(file.mimetype)) {
    cb(null, true);
    return;
  }
  cb(
    new Error(
      'Invalid file type. Only MP4, MOV, WebM, and M4V videos are allowed.',
    ),
    false,
  );
};

const videoUpload = multer({
  storage,
  limits: {
    fileSize: MAX_VIDEO_BYTES,
    files: MAX_VIDEOS_PER_REQUEST,
    fieldSize: 512 * 1024,
  },
  fileFilter,
});

const validateUploadedVideos = (req, res, next) => {
  const files = req.files || (req.file ? [req.file] : []);

  for (const file of files) {
    if (!validateVideoMagicBytes(file.buffer)) {
      logger.securityLog('upload_video_magic_byte_mismatch', {
        ip: req.ip,
        originalname: file.originalname,
        claimedMime: file.mimetype,
      });
      return res.status(400).json({
        success: false,
        message: `File "${file.originalname}" is not a supported video format.`,
        code: 'INVALID_FILE_CONTENT',
      });
    }
  }

  next();
};

const _origArray = videoUpload.array.bind(videoUpload);
const _origSingle = videoUpload.single.bind(videoUpload);

videoUpload.array = (...args) => {
  const multerMiddleware = _origArray(...args);
  return (req, res, next) => {
    multerMiddleware(req, res, (err) => {
      if (err) return next(err);
      validateUploadedVideos(req, res, next);
    });
  };
};

videoUpload.single = (...args) => {
  const multerMiddleware = _origSingle(...args);
  return (req, res, next) => {
    multerMiddleware(req, res, (err) => {
      if (err) return next(err);
      validateUploadedVideos(req, res, next);
    });
  };
};

module.exports = videoUpload;
module.exports.validateUploadedVideos = validateUploadedVideos;
module.exports.MAX_VIDEO_BYTES = MAX_VIDEO_BYTES;
module.exports.MAX_VIDEOS_PER_REQUEST = MAX_VIDEOS_PER_REQUEST;

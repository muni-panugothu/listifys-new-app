const fs = require("fs");
const path = require("path");

const requestedEnvFile = process.env.ENV_FILE;
const envFileCandidates = [
  requestedEnvFile,
  process.env.NODE_ENV === "production" ? ".env.production" : null,
  ".env",
  // Always try .env.production as last resort — covers the case where
  // NODE_ENV is defined INSIDE .env.production (chicken-and-egg).
  ".env.production",
].filter(Boolean);

const resolvedEnvPath = envFileCandidates
  .map((fileName) =>
    path.isAbsolute(fileName) ? fileName : path.join(__dirname, fileName),
  )
  .find((candidatePath) => fs.existsSync(candidatePath));

require("dotenv").config(
  resolvedEnvPath ? { path: resolvedEnvPath } : undefined,
);
const { logger, flushLogs } = require('./utils/logger');

// Warn when Windows/shell env vars override .env (causes mixed email senders).
if (resolvedEnvPath && fs.existsSync(resolvedEnvPath)) {
  const parsed = require("dotenv").parse(fs.readFileSync(resolvedEnvPath));
  for (const key of ["EMAIL_USER", "EMAIL_FROM", "EMAIL_PASSWORD", "BREVO_API_KEY"]) {
    const fileValue = parsed[key]?.trim();
    const activeValue = process.env[key]?.trim();
    if (fileValue && activeValue && fileValue !== activeValue) {
      const mask = (v) =>
        key.includes("PASSWORD") || key.includes("API_KEY")
          ? "(hidden)"
          : v.replace(/(.{2}).*(@.*)/, "$1***$2");
      logger.warn(`Shell environment overrides server/.env for ${key}`, {
        envFile: mask(fileValue),
        active: mask(activeValue),
        hint: "Remove duplicate from Windows Environment Variables, then restart the server",
      });
    }
  }
}

logger.info('Environment loaded', {
  envFile: resolvedEnvPath || '(none found — using process env)',
  NODE_ENV: process.env.NODE_ENV,
  AWS_REGION: process.env.AWS_REGION || '(not set)',
  S3_BUCKET: process.env.AWS_S3_BUCKET_NAME || '(not set)',
  CLIENT_URL: process.env.CLIENT_URL || '(not set)',
});

const { isFirebaseConfigured } = require('./services/fcm.service');
if (!isFirebaseConfigured()) {
  logger.warn(
    '[FCM] Firebase Admin is not configured — push notifications will not work. ' +
    'Set FIREBASE_SERVICE_ACCOUNT_JSON, FIREBASE_SERVICE_ACCOUNT_PATH (file path), or FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY',
  );
} else {
  logger.info('[FCM] Firebase credentials detected');
}

// ============== REQUIRED ENV VAR VALIDATION ==============
const REQUIRED_ENV = [
  'MONGODB_URI',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'JWT_SECRET',
];

const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missing.length > 0) {
  logger.error(`FATAL: Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

// Core dependencies
const express = require("express");
const http = require("http");
const crypto = require('crypto');
const mongoose = require("mongoose");

// Security middleware
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const mongoSanitize = require("express-mongo-sanitize");
const hpp = require("hpp");
const compression = require("compression");
const cookieParser = require("cookie-parser");

// Custom modules
const connectDB = require("./config/database");
const redis = require("./config/redis");
const securityMiddleware = require("./middleware/security.middleware");
const { notFoundHandler, errorHandler } = require('./middleware/errorhandler.middleware');
const { metricsMiddleware, metricsHandler } = require('./middleware/metrics.middleware');
const { recordRequest } = require('./services/cloudwatch-metrics.service');
const { parseAllowedOrigins, isOriginAllowed } = require('./utils/originUtils');
const { startWorkers, stopWorkers } = require('./queues/worker');
const { backpressureMiddleware } = require('./middleware/backpressure.middleware');
const { requestCoalescing } = require('./middleware/coalescing.middleware');

// ============== INITIALIZE APP ==============
const app = express();
app.set('trust proxy', 1);

// ============== PRODUCTION HARDENING â€” 10k+ CONCURRENT USERS ==============
// Increase default event listener limit (Socket.IO + many routes)
process.setMaxListeners(50);
// Ensure garbage collection is aggressive under high load
if (global.gc) {
  setInterval(() => {
    const mem = process.memoryUsage();
    // Force GC when heap exceeds 512MB
    if (mem.heapUsed > 512 * 1024 * 1024) {
      global.gc();
      logger.debug('[GC] Forced garbage collection', { heapMB: Math.round(mem.heapUsed / 1024 / 1024) });
    }
  }, 30_000).unref();
}

// ============== SECURITY MIDDLEWARE ==============

// Request tracing (must be first â€” adds X-Request-Id + logs slow requests)
app.use(require('./middleware/tracing.middleware'));

// Helmet
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "data:", "blob:", "*.amazonaws.com", "*.cloudfront.net", "*.googleusercontent.com", "https://*.tile.openstreetmap.org"],
      connectSrc: ["'self'", "wss:", "ws:", ...(process.env.CLIENT_URL ? process.env.CLIENT_URL.split(",").map(u => u.trim()) : ["http://localhost:5173"])],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      objectSrc: ["'none'"],
      frameSrc: ["https://www.google.com", "https://accounts.google.com"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      // Only upgrade insecure requests when truly behind HTTPS (not Docker localhost)
      upgradeInsecureRequests: (process.env.CLIENT_URL || '').startsWith('https://') ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false,
  // Only send HSTS when behind real HTTPS â€” on localhost HTTP it causes redirect loops
  hsts: (process.env.CLIENT_URL || '').startsWith('https://') ? {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  } : false,
}));

// Custom security headers
app.use(securityMiddleware);

// ── Backpressure / Load Shedding – protect under extreme load ──
app.use(backpressureMiddleware);

// ── Request coalescing: thundering herd protection for public GET endpoints ──
app.use(requestCoalescing({
  excludePaths: ['/health', '/metrics', '/api/auth', '/api/chat', '/api/notifications', '/api/admin'],
}));

// ── Prometheus-compatible metrics collection ──
app.use(metricsMiddleware);
// â”€â”€ CloudWatch metrics recording (hooks into every request) â”€â”€
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => recordRequest(res.statusCode, Date.now() - start));
  next();
});
app.get('/metrics', (req, res, next) => {
  // Protect metrics endpoint: require admin API key or authenticated admin
  const apiKey = req.headers['x-admin-api-key'];
  const expected = process.env.ADMIN_API_KEY;
  if (apiKey && expected && apiKey.length === expected.length) {
    const crypto = require('crypto');
    if (crypto.timingSafeEqual(Buffer.from(apiKey), Buffer.from(expected))) return next();
  }
  return res.status(403).json({ success: false, message: 'Forbidden' });
}, metricsHandler);

// Compression â€” only compress responses > 1KB (small responses don't benefit)
app.use(compression({
  level: 6,          // balanced speed vs ratio (1=fastest, 9=best ratio)
  threshold: 1024,   // don't compress < 1KB
  filter: (req, res) => {
    // Don't compress if client doesn't accept it
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  },
}));

// ============== CORS CONFIGURATION ==============
const allowedOrigins = parseAllowedOrigins(process.env.CLIENT_URL);

const corsOptions = {
  origin: function (origin, callback) {
    // No Origin header — server-to-server, API tools, or React Native without origin → allow.
    if (!origin) return callback(null, true);

    // React Native sandboxed native fetch sends Origin: null — allow it.
    // Mobile apps are authenticated via JWT Bearer, not cookies, so CORS is moot.
    if (origin === 'null') return callback(null, true);

    // Allow explicitly configured browser origins (website)
    if (isOriginAllowed(origin, allowedOrigins)) return callback(null, true);

    // In development, allow all LAN origins (mobile dev builds hitting local server)
    if (process.env.NODE_ENV !== 'production') {
      try {
        const { hostname } = new URL(origin);
        if (hostname === 'localhost' || hostname === '127.0.0.1' ||
            /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(hostname)) {
          return callback(null, true);
        }
      } catch (_) {}
    }

    // Allow Expo web dev server ports when testing in browser
    try {
      const { hostname, port } = new URL(origin);
      if (
        (hostname === 'localhost' || hostname === '127.0.0.1') &&
        ['8081', '19006', '19000'].includes(port)
      ) {
        return callback(null, true);
      }
    } catch (_) {}

    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'Accept',
    'User-Agent',
    'X-Listify-Client',
    'X-Requested-With',
  ],
  maxAge: 86400,
  optionsSuccessStatus: 200,
};
app.use(cors(corsOptions));

// ============== REQUEST ID FOR TRACING ==============
// tracing.middleware already adds X-Request-Id — reuse it
app.use((req, res, next) => {
  req.requestId = req.requestId || res.getHeader('X-Request-Id') || crypto.randomUUID();
  if (!res.getHeader('X-Request-Id')) {
    res.setHeader('X-Request-Id', req.requestId);
  }
  next();
});

// Trigger server reload after payment gateway changes.
// PayU + Razorpay ticketing webhooks registered below (before JSON body parser).
// Razorpay webhook needs raw body for signature verification
app.post(
  "/api/event-tickets/webhooks/razorpay",
  express.raw({ type: "application/json" }),
  (req, _res, next) => {
    req.rawBody = req.body;
    try {
      req.body = JSON.parse(req.body.toString("utf8"));
    } catch {
      req.body = {};
    }
    next();
  },
  require("./controllers/eventticketing.controller").razorpayWebhook,
);

// ============== BODY PARSERS ==============
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

// ============== DATA SANITIZATION ==============
app.use(mongoSanitize({
  replaceWith: '_',
  onSanitize: ({ req, key }) => {
    logger.securityLog('nosql_injection_attempt', { key, ip: req.ip, path: req.path });
  },
}));

app.use(hpp());

// ============== RATE LIMITERS (Redis-backed for cluster safety) ==============
const RedisRateLimitStore = require('./middleware/redisRateLimitStore');
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Global rate limiter â€” generous for normal browsing, tight enough to stop abuse
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1500,
  store: new RedisRateLimitStore(15 * 60 * 1000, 'erl:global:'),
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again after 15 minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Public media is immutable and validated by image.routes. Avoid multiple
  // remote Redis round trips before every S3 image stream.
  skip: (req) =>
    req.path === '/health' ||
    req.path.startsWith('/api/images/'),
  // Under extreme load, fail open (allow request) rather than crashing
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: 'Too many requests from this IP, please try again after 15 minutes.',
      code: 'RATE_LIMITED',
    });
  },
});
// Media requests use an in-process limiter so image delivery never waits on
// Upstash. The generous cap still protects the S3 proxy from obvious abuse.
const imageLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5000,
  standardHeaders: false,
  legacyHeaders: false,
});
app.use('/api/images', imageLimiter);
app.use(globalLimiter);

// Auth rate limiter â€” per IP, tight for brute-force protection
const AUTH_WINDOW_MS = IS_PRODUCTION ? 15 * 60 * 1000 : 60 * 1000;
const AUTH_MAX_ATTEMPTS = IS_PRODUCTION ? 15 : 120;
const AUTH_WAIT_LABEL = IS_PRODUCTION ? '15 minutes' : '1 minute';

const authLimiter = rateLimit({
  windowMs: AUTH_WINDOW_MS,
  max: AUTH_MAX_ATTEMPTS,
  store: new RedisRateLimitStore(AUTH_WINDOW_MS, 'erl:auth:', { failClosed: true }),
  message: {
    success: false,
    message: `Too many authentication attempts. Please try again after ${AUTH_WAIT_LABEL}.`,
    code: 'RATE_LIMITED',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// OTP rate limiter
const OTP_WINDOW_MS = IS_PRODUCTION ? 5 * 60 * 1000 : 60 * 1000;
const OTP_MAX_ATTEMPTS = IS_PRODUCTION ? 5 : 25;
const OTP_WAIT_LABEL = IS_PRODUCTION ? '5 minutes' : '1 minute';

const otpLimiter = rateLimit({
  windowMs: OTP_WINDOW_MS,
  max: OTP_MAX_ATTEMPTS,
  store: new RedisRateLimitStore(OTP_WINDOW_MS, 'erl:otp:', { failClosed: true }),
  message: {
    success: false,
    message: `Too many OTP attempts. Please try again after ${OTP_WAIT_LABEL}.`,
    code: 'RATE_LIMITED',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Chatbot rate limiter
const chatbotLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  store: new RedisRateLimitStore(60 * 1000, 'erl:chatbot:'),
  message: { success: false, message: 'Too many chatbot requests. Please wait a moment.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ============== DATABASE CONNECTIONS ==============
// Await DB connection before registering routes to avoid query failures
// when bufferCommands is disabled.
// Retry with exponential backoff instead of crashing on transient failures.
async function connectWithRetry(maxRetries = 5) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await connectDB();
      return;
    } catch (err) {
      const errorMessage = err?.message || 'Unknown MongoDB connection error';
      const isAtlasAllowlistError = /whitelist|whitelisted|ip that isn't whitelisted/i.test(errorMessage);

      // Atlas allowlist errors are not transient — in production exit immediately.
      // In development, keep retrying so the dev can fix Atlas Network Access
      // without having to restart nodemon manually.
      if (isAtlasAllowlistError) {
        logger.error('MongoDB Atlas network access blocked. Add this machine\'s public IP in Atlas → Network Access, then the next retry will connect.', {
          error: errorMessage,
        });
        if (IS_PRODUCTION) {
          process.exit(1);
        }
        // In dev, fall through to retry with backoff
      }

      if (attempt === maxRetries) {
        logger.error(`Database connection failed after ${maxRetries} attempts - exiting`, { error: errorMessage });
        process.exit(1);
      }
      const delay = Math.min(1000 * 2 ** (attempt - 1), 15000);
      logger.warn(`Database connection attempt ${attempt}/${maxRetries} failed, retrying in ${delay}ms`, { error: errorMessage });
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

let _dbReady = false;
const dbReadyPromise = connectWithRetry(IS_PRODUCTION ? 5 : 10).then(async () => {
  _dbReady = true;
  // ── Distributed startup lock (Redis) ─────────────────────────────────────
  // Prevents duplicate execution on multi-worker PM2 clusters.
  // Only the process that acquires the lock runs one-time startup tasks.
  // Other workers skip gracefully — tasks are idempotent so this is safe.
  const _redis = require('./config/redis');
  const _lockAcquired = await _redis
    .set('startup:migrations:lock', process.pid.toString(), { NX: true, EX: 90 })
    .catch(() => null); // Redis unavailable — allow fallthrough so server still starts

  if (_lockAcquired) {
    logger.info('[Startup] Lock acquired — running one-time migrations', { pid: process.pid });

    const { migrateAllSlugs } = require('./utils/migrate-slugs');
    migrateAllSlugs().catch((err) => logger.error('Slug migration error', { error: err.message }));

    // Ensure optimal compound indexes for 10k+ concurrent query patterns
    const { ensureIndexes } = require('./scripts/ensure-indexes');
    ensureIndexes().catch((err) => logger.warn('Index optimization error (non-fatal)', { error: err.message }));
  } else {
    logger.info('[Startup] Migrations skipped — another worker holds the lock');
  }
});

const { initElasticsearch } = require('./config/elasticsearch');
const SearchService = require('./services/search.service');

// Initialize ES after DB is ready, then start background reindex + change streams
dbReadyPromise.then(async () => {
  try {
    await initElasticsearch();

    // Import MODEL_MAP from search routes (avoids duplicating model imports)
    const searchRoutes = require('./routes/search.routes');
    const MODEL_MAP = searchRoutes.MODEL_MAP;

    if (MODEL_MAP && SearchService.isAvailable()) {
      // Background reindex: sync all MongoDB data -> ES (non-blocking)
      SearchService.backgroundReindex(MODEL_MAP).catch(err =>
        logger.error('Background reindex failed', { error: err.message })
      );

      // Change Streams: real-time MongoDB -> ES sync
      SearchService.startChangeStreams(MODEL_MAP);
    }
  } catch (err) {
    logger.info('Elasticsearch init skipped', { reason: err.message });
  }
});

// ============== ROUTES ==============
const { registerRoutes } = require("./routes");

// Health check drain: returns 503 when shutting down — MUST be before routes
let _isShuttingDown = false;
app.use((req, res, next) => {
  if (_isShuttingDown && req.path === '/health') {
    return res.status(503).json({ status: 'draining', message: 'Server is shutting down' });
  }
  next();
});

// Apply auth-specific rate limiters on exact endpoints (avoid nested path overlap)
app.post("/api/auth/login", authLimiter);
app.post("/api/auth/register/initiate", authLimiter);
app.post("/api/auth/register-legacy", authLimiter);
app.post("/api/auth/forgot-password/initiate", authLimiter);
app.post("/api/auth/forgot-password", authLimiter);
app.post("/api/auth/register/verify", otpLimiter);
app.post("/api/auth/register/resend-otp", otpLimiter);
app.post("/api/auth/forgot-password/verify-otp", otpLimiter);
app.post("/api/auth/forgot-password/resend-otp", otpLimiter);
app.post("/api/auth/phone/send-otp", otpLimiter);
app.post("/api/auth/phone/verify-otp", otpLimiter);

// Register all routes from centralized index
registerRoutes(app, { chatbotLimiter });

// â”€â”€ Client error reporting (fire-and-forget from ErrorBoundary) â”€â”€
const clientErrorLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  store: new RedisRateLimitStore(15 * 60 * 1000, 'erl:clienterr:'),
  message: { success: false, message: 'Too many error reports' },
});
app.post("/api/client-errors", clientErrorLimiter, express.json({ limit: '10kb' }), (req, res) => {
  const { message, stack, componentStack, url, timestamp } = req.body || {};
  logger.error('Client-side error', {
    clientError: true,
    message: String(message || '').slice(0, 500),
    stack: String(stack || '').slice(0, 2000),
    componentStack: String(componentStack || '').slice(0, 500),
    url: String(url || '').slice(0, 200),
    timestamp,
    ip: req.ip,
  });
  res.status(204).end();
});

// ============== BASIC ROUTE ==============
app.get("/", (req, res) => {
  res.json({
    message: "Listifys API",
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

// ============== ERROR HANDLERS ==============
app.use("*", notFoundHandler);
app.use(errorHandler);

// ============== SERVER INITIALIZATION ==============
const PORT = process.env.PORT || 5000;
const httpServer = http.createServer(app);

// â”€â”€ Production HTTP tuning for 10k+ concurrent connections â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
httpServer.keepAliveTimeout   = 65_000;  // Must be > ALB/Nginx idle timeout (60s)
httpServer.headersTimeout     = 70_000;  // Must be > keepAliveTimeout
httpServer.requestTimeout     = 120_000; // 2 min max for any request (prevents hung connections)
httpServer.maxHeadersCount    = 100;     // Prevent header-bomb DoS
httpServer.timeout            = 120_000; // Socket timeout
// Allow more concurrent sockets (default is Infinity in Node.js)
// Leave as default â€” OS limits apply naturally

const { initSocket } = require("./config/socket");
initSocket(httpServer, corsOptions).then((io) => {
  app.set("io", io);
}).catch((err) => {
  logger.error('Socket.IO initialization failed', { error: err.message });
});

httpServer.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    logger.error('Port already in use. Stop the existing process or change PORT.', {
      port: PORT,
      code: err.code,
    });
    process.exit(1);
  }

  logger.error('HTTP server error', {
    error: err?.message || String(err),
    code: err?.code,
  });
});

const server = dbReadyPromise.then(() => httpServer.listen(PORT, "0.0.0.0", () => {
  logger.info('Server started', { port: PORT, env: process.env.NODE_ENV, host: "0.0.0.0" });

  void require('./services/email.service').verifyEmailTransport().catch(() => {});

  // Initialize write-back view counter service
  const viewCounter = require('./services/viewcount.service');
  const ForSale = require('./models/forsale.model');
  const Electronics = require('./models/electronics.model');
  const Mobile = require('./models/mobile.model');
  const Furniture = require('./models/furniture.model');
  const Fashion = require('./models/fashion.model');
  const Toy = require('./models/toy.model');
  const Job = require('./models/job.model');
  const Vehicle = require('./models/vehicle.model');
  const TakeCare = require('./models/takecare.model');
  const Sports = require('./models/sports.model');
  const Collectible = require('./models/collectible.model');
  const Pet = require('./models/pet.model');
  const Book = require('./models/book.model');
  const Beauty = require('./models/beauty.model');
  const Other = require('./models/other.model');
  const Event = require('./models/event.model');
  const Property = require('./models/property.model');
  viewCounter.init({
    forsale: ForSale,
    electronics: Electronics,
    mobiles: Mobile,
    furniture: Furniture,
    fashion: Fashion,
    sports: Sports,
    collectibles: Collectible,
    pets: Pet,
    books: Book,
    beauty: Beauty,
    others: Other,
    toys: Toy,
    jobs: Job,
    vehicles: Vehicle,
    takecare: TakeCare,
    events: Event,
    properties: Property,
  });

  // Cache warming
  const ListingCache = require('./services/listingcache.service');
  const warmCache = async () => {
    try {
      if (mongoose.connection.readyState !== 1) {
        logger.info('[CacheWarm] Waiting for MongoDB before cache warm...');
        const maxWaitMs = 30_000;
        const pollMs = 1000;
        const start = Date.now();

        while (mongoose.connection.readyState !== 1 && (Date.now() - start) < maxWaitMs) {
          await new Promise((resolve) => setTimeout(resolve, pollMs));
        }

        if (mongoose.connection.readyState !== 1) {
          logger.warn('[CacheWarm] MongoDB not ready after 30s, skipping warmup for now');
          return;
        }
      }

      const entities = [
        { model: ForSale, name: 'forsale' },
        { model: Electronics, name: 'electronics' },
        { model: Mobile, name: 'mobiles' },
        { model: Furniture, name: 'furniture' },
        { model: Fashion, name: 'fashion' },
        { model: Sports, name: 'sports' },
        { model: Collectible, name: 'collectibles' },
        { model: Pet, name: 'pets' },
        { model: Book, name: 'books' },
        { model: Beauty, name: 'beauty' },
        { model: Other, name: 'others' },
        { model: Toy, name: 'toys' },
        { model: Job, name: 'jobs' },
        { model: Vehicle, name: 'vehicles' },
        { model: TakeCare, name: 'takecare' },
      ];

      for (const { model, name } of entities) {
        const listings = await model.find({ status: 'active' })
          .sort({ createdAt: -1 })
          .limit(20)
          .populate('seller', 'name profileImage')
          .lean();

        if (listings.length > 0) {
          await ListingCache.prefetchCategoryListings(name, listings);
        }
      }

      logger.info('[CacheWarm] Cache warming completed â€” popular listings pre-loaded');
    } catch (err) {
      logger.error('[CacheWarm] Cache warming failed (non-fatal)', {
        error: err?.message || String(err),
      });
    }
  };

  warmCache();

  try {
    const { startHoldExpiryScheduler } = require("./services/eventticketing.service");
    startHoldExpiryScheduler();
    logger.info("[Ticketing] Hold expiry scheduler started");
  } catch (ticketingErr) {
    logger.warn("[Ticketing] Scheduler start failed (non-fatal)", {
      error: ticketingErr.message,
    });
  }

  // ── Start RabbitMQ workers (non-blocking: server runs even if queue is down)
  startWorkers().catch((err) => {
    logger.warn('[Server] RabbitMQ workers failed to start (non-fatal)', { error: err.message });
  });

  // â”€â”€ Start AWS CloudWatch metrics pusher (non-blocking) â”€â”€
  const { startCloudWatchMetrics } = require('./services/cloudwatch-metrics.service');
  const { getSocketStats } = require('./config/socket');
  startCloudWatchMetrics({ getSocketStats }).catch((err) => {
    logger.warn('[Server] CloudWatch metrics failed to start (non-fatal)', { error: err.message });
  });

  const { startEngagementScheduler } = require('./services/engagement-notification.scheduler');
  startEngagementScheduler();
}));

// ============== GRACEFUL SHUTDOWN WITH CONNECTION DRAINING ==============
const DRAIN_TIMEOUT_MS = parseInt(process.env.DRAIN_TIMEOUT_MS, 10) || 15_000;

const shutdown = async (signal) => {
  if (_isShuttingDown) return; // prevent double-shutdown
  _isShuttingDown = true;
  logger.info('Graceful shutdown initiated — draining connections', { signal, drainTimeoutMs: DRAIN_TIMEOUT_MS });

  let exitCode = 0;

  try {
    // Stop accepting new connections, but let in-flight requests finish
    await new Promise((resolve) => {
      const drainTimer = setTimeout(() => {
        logger.warn('Drain timeout reached — forcing server close');
        resolve();
      }, DRAIN_TIMEOUT_MS);
      if (drainTimer.unref) drainTimer.unref();

      httpServer.close(() => {
        clearTimeout(drainTimer);
        resolve();
      });
      logger.info('HTTP server stopped accepting new connections — draining in-flight requests');
    });

    try {
      const viewCounter = require('./services/viewcount.service');
      await viewCounter.shutdown();
      logger.info('View counter flushed');
    } catch (viewErr) {
      logger.warn('View counter flush error (non-fatal)', { error: viewErr.message });
    }

    try {
      await stopWorkers();
      logger.info('RabbitMQ workers stopped');
    } catch (queueErr) {
      logger.warn('RabbitMQ workers stop error (non-fatal)', { error: queueErr.message });
    }

    try {
      const { stopEngagementScheduler } = require('./services/engagement-notification.scheduler');
      stopEngagementScheduler();
    } catch (engErr) {
      logger.warn('Engagement scheduler stop error (non-fatal)', { error: engErr.message });
    }

    try {
      const { stopCloudWatchMetrics } = require('./services/cloudwatch-metrics.service');
      const { getSocketStats } = require('./config/socket');
      await stopCloudWatchMetrics(getSocketStats);
      logger.info('CloudWatch metrics flushed');
    } catch (cwErr) {
      logger.warn('CloudWatch metrics flush error (non-fatal)', { error: cwErr.message });
    }

    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
      logger.info('MongoDB connection closed');
    }

    try {
      await flushLogs();
      logger.info('CloudWatch logs flushed');
    } catch (logErr) {
      logger.warn('Log flush error (non-fatal)', { error: logErr.message });
    }

    logger.info('Graceful shutdown completed');
  } catch (error) {
    logger.error('Error during shutdown', { error: error.message });
    exitCode = 1;
  } finally {
    process.exit(exitCode);
  }
};

// ============== PROCESS HANDLERS ==============
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("uncaughtException", (err) => {  // Amqplib heartbeat timeouts are transient network errors — the connection-level
  // error handler in rabbitmq.js already schedules a reconnect. Shutting down the
  // entire server for a broker hiccup is too aggressive; just log and continue.
  if (err.message === 'Heartbeat timeout' && err.stack?.includes('amqplib')) {
    logger.warn('[RabbitMQ] Heartbeat timeout (non-fatal — reconnect will be scheduled)', { error: err.message });
    return;
  }  logger.error('Uncaught Exception â€” initiating graceful shutdown', { error: err.message, stack: err.stack });
  // After an uncaught exception, Node.js is in an undefined state.
  // Always shut down gracefully; the cluster manager or container orchestrator will restart.
  shutdown("UNCAUGHT_EXCEPTION");
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error('Unhandled Rejection (non-fatal, server continues)', { reason: String(reason) });
});

module.exports = app;

const mongoose = require("mongoose");
const { logger } = require("../utils/logger");

// ── Connection state tracking ──────────────────────────────────────────────────
let _isConnected = false;
let _reconnectAttempts = 0;
let _listenersRegistered = false;
const MAX_RECONNECT_ATTEMPTS = 10;

const connectDB = async () => {
  try {
    logger.info("Attempting MongoDB connection");

    await mongoose.connect(process.env.MONGODB_URI, {
      // ── Connection Pool — sized for 10k+ concurrent users ──────────────────
      // Rule of thumb: maxPoolSize ≈ (concurrent_requests / num_workers) + headroom
      // With 4 cluster workers handling 10k users: ~100 connections each
      maxPoolSize: parseInt(process.env.MONGO_POOL_SIZE, 10) || 100,
      minPoolSize: 20,                      // Keep 20 warm connections ready

      // ── Timeouts ──────────────────────────────────────────────────────────────
      serverSelectionTimeoutMS: 10_000,     // Wait up to 10s to find a server
      socketTimeoutMS: 45_000,              // Close idle sockets after 45s
      connectTimeoutMS: 30_000,             // Connection attempt timeout
      heartbeatFrequencyMS: 10_000,         // Check server health every 10s (faster failover)
      waitQueueTimeoutMS: 10_000,           // Max wait when pool is exhausted (fail fast)

      // ── Read/Write settings ───────────────────────────────────────────────────
      // Transactions (e.g. ticket payment confirm) require readPreference "primary".
      readPreference: "primary",
      retryWrites: true,                    // Auto-retry failed writes (network glitch)
      retryReads: true,                     // Auto-retry failed reads
      w: "majority",                        // Write concern: acknowledged by majority

      // ── Performance ───────────────────────────────────────────────────────────
      bufferCommands: false,                // Fail fast instead of queuing when disconnected
      maxIdleTimeMS: 30_000,                // Close idle connections after 30s (recycle faster)
      compressors: ['zstd', 'snappy'],      // Wire compression (reduces bandwidth 60-80%)
    });

    _isConnected = true;
    _reconnectAttempts = 0;

    logger.info("========🫙Mongodb connected successfully========", {
      database: mongoose.connection.db?.databaseName,
      host: mongoose.connection.host,
      poolSize: mongoose.connection.getClient().options?.maxPoolSize,
    });

    // ── Connection event handlers (register only once) ──────────────────────
    if (!_listenersRegistered) {
      _listenersRegistered = true;

      mongoose.connection.on("error", (err) => {
      _isConnected = false;
      logger.error("⛔MongoDB connection error:", err);
    });

    mongoose.connection.on("disconnected", () => {
      _isConnected = false;
      logger.warn("⚠️ MongoDB disconnected");
      
      // Auto-reconnect with backoff (mongoose handles this, but we track state)
      if (_reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        _reconnectAttempts++;
        logger.info(`MongoDB reconnect attempt ${_reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`);
      }
    });

    mongoose.connection.on("reconnected", () => {
      _isConnected = true;
      _reconnectAttempts = 0;
      logger.info("♻️ MongoDB reconnected");
    });
    } // end _listenersRegistered guard

    // ── Monitor slow queries in development ──────────────────────────────────
    if (process.env.NODE_ENV !== 'production') {
      mongoose.set('debug', (collectionName, method, query, doc, options) => {
        // Only log queries taking > 100ms would need profiling at driver level
        logger.debug(`[Mongoose] ${collectionName}.${method}`, {
          query: JSON.stringify(query).slice(0, 200),
        });
      });
    }

  } catch (error) {
    logger.error("MongoDB connection failed", {
      error: error.message,
      stack: error.stack,
    });
    throw error; // Let caller decide — no process.exit in library code
  }
};

/**
 * Get connection health status (for health endpoint).
 */
const getConnectionStatus = () => ({
  connected: _isConnected,
  readyState: mongoose.connection.readyState,
  host: mongoose.connection.host,
  database: mongoose.connection.db?.databaseName,
  reconnectAttempts: _reconnectAttempts,
});

module.exports = connectDB;
module.exports.getConnectionStatus = getConnectionStatus;
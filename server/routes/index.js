/**
 * Centralized route registration module.
 * Keeps server.js lean by moving all route requires + mounts here.
 */
const express = require("express");

const routeMap = [
  // ── Auth & platform ──
  ["/api/auth", "./auth.routes"],
  ["/api/admin", "./admin.routes"],
  ["/api/contact", "./contact.routes"],
  ["/api/search", "./search.routes"],
  ["/api/feed", "./feed.routes"],
  ["/api/cache", "./cache.routes"],
  ["/api/images", "./image.routes"],
  ["/api/s3", "./s3.routes"],
  ["/api/moderation", "./moderation.routes"],
  ["/api/notifications", "./notification.routes"],
  ["/api/settings", "./settings.routes"],
  ["/api/chat", "./chat.routes"],
  ["/api/nearby", "./nearby.routes"],
  ["/health", "./health.routes"],

  // ── Marketplace categories ──
  ["/api/electronics", "./electronics.routes"],
  ["/api/jobs", "./jobs.routes"],
  ["/api/vehicles", "./vehicles.routes"],
  ["/api/takecare", "./takecare.routes"],
  ["/api/events", "./events.routes"],
  ["/api/event-tickets", "./eventticketing.routes"],
  ["/api/properties", "./properties.routes"],
  ["/api/forsale", "./forsale.routes"],
  ["/api/mobiles", "./mobiles.routes"],
  ["/api/furniture", "./furniture.routes"],
  ["/api/fashion", "./fashion.routes"],
  ["/api/sports", "./sports.routes"],
  ["/api/collectibles", "./collectibles.routes"],
  ["/api/pets", "./pets.routes"],
  ["/api/books", "./books.routes"],
  ["/api/beauty", "./beauty.routes"],
  ["/api/others", "./others.routes"],
  ["/api/toys", "./toys.routes"],

  // ── Marketplace contact & analytics ──
  ["/api/marketplace", "./marketplace-contact.routes"],

  // ── Service marketplace ──
  ["/api/services/categories", "./servicecategory.routes"],
  ["/api/services/listings", "./servicelisting.routes"],
  ["/api/services/providers", "./serviceprovider.routes"],
  ["/api/services/bookings", "./servicebooking.routes"],
  ["/api/services/reviews", "./servicereview.routes"],
  ["/api/services/requests", "./servicerequest.routes"],
];

/**
 * Register all routes on the given Express app.
 * @param {express.Application} app
 * @param {{ chatbotLimiter: Function }} limiters - rate limiter middlewares
 */
function registerRoutes(app, { chatbotLimiter } = {}) {
  for (const [path, modulePath] of routeMap) {
    app.use(path, require(modulePath));
  }

  // Chatbot has its own limiter
  if (chatbotLimiter) {
    app.use("/api/chatbot", chatbotLimiter, require("./chatbot.routes"));
  } else {
    app.use("/api/chatbot", require("./chatbot.routes"));
  }
}

module.exports = { registerRoutes };

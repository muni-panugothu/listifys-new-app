'use strict';

const { getIO } = require('../config/socket');
const { logger } = require('../utils/logger');

/**
 * Broadcast ticket availability updates to clients in event:{eventId} room.
 */
function emitEventAvailability(eventId, payload) {
  if (!eventId || !payload) return;
  try {
    const io = getIO();
    io.to(`event:${eventId}`).emit('event:availability', {
      eventId: String(eventId),
      ...payload,
      at: new Date().toISOString(),
    });
  } catch (err) {
    logger.debug('[EventRealtime] emitEventAvailability skipped', { eventId, err: err.message });
  }
}

function emitEventStatusChange(eventId, payload) {
  if (!eventId || !payload) return;
  try {
    const io = getIO();
    io.to(`event:${eventId}`).emit('event:status', {
      eventId: String(eventId),
      ...payload,
      at: new Date().toISOString(),
    });
  } catch (err) {
    logger.debug('[EventRealtime] emitEventStatusChange skipped', { eventId, err: err.message });
  }
}

module.exports = { emitEventAvailability, emitEventStatusChange };

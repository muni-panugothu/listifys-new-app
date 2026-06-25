/**
 * Event date parsing, multi-day overlap, and calendar helpers.
 * Events may store free-text eventDate (legacy) or structured startDate/endDate.
 */

function parseFlexibleDate(input) {
  if (input == null || input === "") return null;
  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? null : input;
  }

  const str = String(input).trim();
  if (!str) return null;

  // Reject obvious schedule text (not a calendar date).
  if (/^(mon|tue|wed|thu|fri|sat|sun)/i.test(str) && str.includes(":")) {
    return null;
  }

  const parsed = Date.parse(str);
  if (!Number.isNaN(parsed)) return new Date(parsed);

  return null;
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

/** YYYY-MM-DD in local timezone */
function dateKey(date) {
  const d = startOfDay(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDateKey(key) {
  const [y, m, d] = String(key).split("-").map(Number);
  if (!y || !m || !d) return null;
  return startOfDay(new Date(y, m - 1, d));
}

function getEventRange(event) {
  if (!event) return null;

  let start = event.startDate ? new Date(event.startDate) : parseFlexibleDate(event.eventDate);
  let end = event.endDate ? new Date(event.endDate) : start;

  if (!start || Number.isNaN(start.getTime())) return null;
  if (!end || Number.isNaN(end.getTime())) end = start;
  if (end < start) end = start;

  return {
    start: startOfDay(start),
    end: endOfDay(end),
  };
}

function eventOccursOnDate(event, day) {
  const range = getEventRange(event);
  if (!range) return false;
  const dayStart = startOfDay(day);
  const dayEnd = endOfDay(day);
  return range.start <= dayEnd && range.end >= dayStart;
}

function isEventExpired(event, now = new Date()) {
  const range = getEventRange(event);
  if (!range) return false;
  return range.end < startOfDay(now);
}

/** Mongo filter: events overlapping a calendar day (structured dates only). */
function buildDayOverlapFilter(dayKey) {
  const day = parseDateKey(dayKey);
  if (!day) return null;

  const dayStart = startOfDay(day);
  const dayEnd = endOfDay(day);

  return {
    startDate: { $lte: dayEnd },
    $or: [
      { endDate: { $gte: dayStart } },
      { endDate: null },
      { endDate: { $exists: false } },
    ],
  };
}

/** Mongo filter: upcoming events (end >= start of today). */
function buildUpcomingFilter(now = new Date()) {
  const todayStart = startOfDay(now);
  return {
    $or: [
      { endDate: { $gte: todayStart } },
      { endDate: null, startDate: { $gte: todayStart } },
      { endDate: { $exists: false }, startDate: { $gte: todayStart } },
      // Legacy: no structured dates — keep visible (client shows eventDate text).
      { startDate: { $exists: false } },
      { startDate: null },
    ],
  };
}

function resolveEventDatesFromBody(body) {
  const start =
    parseFlexibleDate(body.startDate) ??
    parseFlexibleDate(body.eventDate);
  const end =
    parseFlexibleDate(body.endDate) ??
    start;

  return {
    startDate: start,
    endDate: end,
  };
}

module.exports = {
  parseFlexibleDate,
  startOfDay,
  endOfDay,
  dateKey,
  parseDateKey,
  getEventRange,
  eventOccursOnDate,
  isEventExpired,
  buildDayOverlapFilter,
  buildUpcomingFilter,
  resolveEventDatesFromBody,
};

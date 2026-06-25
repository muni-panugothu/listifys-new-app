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

  // "26 Jun" or "26 jun 2026" without strict ISO
  const dm = str.match(/^(\d{1,2})\s+([a-z]{3,})(?:\s+(\d{4}))?$/i);
  if (dm) {
    const year = dm[3] ? Number(dm[3]) : new Date().getFullYear();
    const retry = Date.parse(`${dm[1]} ${dm[2]} ${year}`);
    if (!Number.isNaN(retry)) return new Date(retry);
  }

  return null;
}

/** UTC noon for a calendar day — avoids timezone shifting stored dates. */
function normalizeToCalendarDate(input) {
  const parsed = input instanceof Date ? input : parseFlexibleDate(input);
  if (!parsed || Number.isNaN(parsed.getTime())) return null;
  return new Date(
    Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 12, 0, 0, 0),
  );
}

function calendarDayFromStored(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0, 0));
}

function startOfDay(date) {
  const d = calendarDayFromStored(date) ?? new Date(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

function endOfDay(date) {
  const d = calendarDayFromStored(date) ?? new Date(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
}

/** YYYY-MM-DD using UTC calendar components */
function dateKey(date) {
  const d = calendarDayFromStored(date) ?? new Date(date);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDateKey(key) {
  const [y, m, d] = String(key).split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0, 0));
}

/** Parse "26 to 28 Jun", "26 Jun - 28 Jun 2026", etc. */
function parseDateRangeFromText(text) {
  if (!text || !String(text).trim()) return { start: null, end: null };

  const str = String(text).trim();
  const rangeMatch = str.match(/^(.+?)\s*(?:–|—|-|to)\s*(.+)$/i);
  if (rangeMatch) {
    let startPart = rangeMatch[1].trim();
    const endPart = rangeMatch[2].trim();

    // "26 to 28 Jun 2026" → borrow month/year for the start day
    if (/^\d{1,2}$/.test(startPart)) {
      const endParsed = parseFlexibleDate(endPart);
      if (endParsed) {
        const monthYear = endPart.replace(/^\d{1,2}\s*/, "").trim();
        if (monthYear) startPart = `${startPart} ${monthYear}`;
      }
    }

    const start = parseFlexibleDate(startPart);
    const end = parseFlexibleDate(endPart) ?? start;
    return { start, end };
  }

  const single = parseFlexibleDate(str);
  return { start: single, end: single };
}

function getEventRange(event) {
  if (!event) return null;

  let start = event.startDate ? calendarDayFromStored(event.startDate) : null;
  let end = event.endDate ? calendarDayFromStored(event.endDate) : null;

  if (!start && event.eventDate) {
    const range = parseDateRangeFromText(event.eventDate);
    start = normalizeToCalendarDate(range.start);
    end = normalizeToCalendarDate(range.end);
  }

  if (!start) {
    start = normalizeToCalendarDate(parseFlexibleDate(event.eventDate));
    end = end ?? start;
  }

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
  let start = normalizeToCalendarDate(body.startDate);
  let end = normalizeToCalendarDate(body.endDate);

  if ((!start || !end) && body.eventDate) {
    const range = parseDateRangeFromText(body.eventDate);
    start = start ?? normalizeToCalendarDate(range.start);
    end = end ?? normalizeToCalendarDate(range.end);
  }

  if (!start) {
    start = normalizeToCalendarDate(parseFlexibleDate(body.eventDate));
  }
  if (!end) end = start;

  return {
    startDate: start,
    endDate: end,
  };
}

module.exports = {
  parseFlexibleDate,
  parseDateRangeFromText,
  normalizeToCalendarDate,
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

/**
 * Event date parsing, multi-day overlap, and calendar helpers.
 * Events may store free-text eventDate (legacy) or structured startDate/endDate.
 */

const MIN_VALID_YEAR = 1970;
const MAX_VALID_YEAR = 2100;

function stripOrdinals(input) {
  return String(input).replace(/(\d{1,2})(?:st|nd|rd|th)\b/gi, "$1");
}

function isPlausibleYear(year) {
  return year >= MIN_VALID_YEAR && year <= MAX_VALID_YEAR;
}

function parseFlexibleDate(input) {
  if (input == null || input === "") return null;
  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? null : input;
  }

  let str = stripOrdinals(String(input).trim());
  if (!str) return null;

  // Reject obvious schedule text (not a calendar date).
  if (/^(mon|tue|wed|thu|fri|sat|sun)/i.test(str) && str.includes(":")) {
    return null;
  }

  // Bare day or bare short number — Date.parse("26") => year 0026 in some engines.
  if (/^\d{1,2}$/.test(str)) return null;

  // Bare year — Date.parse("2026") => Jan 1, which silently fabricates a day.
  if (/^\d{4}$/.test(str)) return null;

  // ISO date-only YYYY-MM-DD
  const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const y = Number(iso[1]);
    const m = Number(iso[2]);
    const d = Number(iso[3]);
    if (isPlausibleYear(y)) {
      return new Date(Date.UTC(y, m - 1, d, 12, 0, 0, 0));
    }
    return null;
  }

  // "26 Jun 2026" / "26 Jun"
  const dm = str.match(/^(\d{1,2})\s+([a-zA-Z]+)(?:\s+(\d{4}))?$/);
  if (dm) {
    const year = dm[3] ? Number(dm[3]) : new Date().getFullYear();
    if (!isPlausibleYear(year)) return null;
    const retry = Date.parse(`${dm[1]} ${dm[2]} ${year}`);
    if (!Number.isNaN(retry)) {
      const parsed = new Date(retry);
      if (isPlausibleYear(parsed.getFullYear())) return parsed;
    }
  }

  const parsed = Date.parse(str);
  if (!Number.isNaN(parsed)) {
    const d = new Date(parsed);
    if (isPlausibleYear(d.getFullYear())) return d;
  }

  return null;
}

/** UTC noon for a calendar day — avoids timezone shifting stored dates. */
function normalizeToCalendarDate(input) {
  const parsed = input instanceof Date ? input : parseFlexibleDate(input);
  if (!parsed || Number.isNaN(parsed.getTime())) return null;
  const y = parsed.getFullYear();
  if (!isPlausibleYear(y)) return null;
  return new Date(
    Date.UTC(y, parsed.getMonth(), parsed.getDate(), 12, 0, 0, 0),
  );
}

function calendarDayFromStored(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  if (!isPlausibleYear(y)) return null;
  return new Date(Date.UTC(y, d.getUTCMonth(), d.getUTCDate(), 12, 0, 0, 0));
}

function isCorruptStoredDate(stored, fromText) {
  if (!stored) return false;
  const y = stored.getUTCFullYear();
  if (!isPlausibleYear(y)) return true;
  if (fromText) {
    const ty = fromText.getUTCFullYear();
    if (isPlausibleYear(ty) && ty !== y) return true;
  }
  return false;
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
  if (!y || !m || !d || !isPlausibleYear(y)) return null;
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0, 0));
}

/**
 * Parse ranges including:
 * - "26 - 28th Jun 2026"
 * - "26 Jun - 28 Jun 2026"
 * - "26 to 28 Jun 2026"
 */
function parseDateRangeFromText(text) {
  if (!text || !String(text).trim()) return { start: null, end: null };

  const str = stripOrdinals(String(text).trim());

  // ISO dates must be matched before any hyphen split, or "2026-09-12" is read
  // as the range 2026 → 09-12 and collapses to Jan 1.
  const ISO_DAY = /^\d{4}-\d{2}-\d{2}(?:[T\s][\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)?$/;
  if (ISO_DAY.test(str)) {
    const single = parseFlexibleDate(str);
    return { start: single, end: single };
  }

  const isoRange = str.match(/^(\d{4}-\d{2}-\d{2})\s*(?:–|—|-|to)\s*(\d{4}-\d{2}-\d{2})$/i);
  if (isoRange) {
    const start = parseFlexibleDate(isoRange[1]);
    return { start, end: parseFlexibleDate(isoRange[2]) ?? start };
  }

  // "26 - 28 Jun 2026" (shared month/year on the right)
  const sharedMonth = str.match(
    /^(\d{1,2})\s*(?:–|—|-|to)\s*(\d{1,2})\s+([a-zA-Z]+)(?:\s+(\d{4}))?$/i,
  );
  if (sharedMonth) {
    const year = sharedMonth[4] ? Number(sharedMonth[4]) : new Date().getFullYear();
    const month = sharedMonth[3];
    const start = parseFlexibleDate(`${sharedMonth[1]} ${month} ${year}`);
    const end = parseFlexibleDate(`${sharedMonth[2]} ${month} ${year}`);
    return { start, end };
  }

  const rangeMatch = str.match(/^(.+?)\s*(?:–|—|-|to)\s*(.+)$/i);
  if (rangeMatch) {
    let startPart = rangeMatch[1].trim();
    const endPart = rangeMatch[2].trim();

    // "26 to 28 Jun 2026" → borrow month/year for the start day
    if (/^\d{1,2}$/.test(startPart)) {
      const endParsed = parseFlexibleDate(endPart);
      if (endParsed) {
        const monthYear = endPart.replace(/^\d{1,2}(?:st|nd|rd|th)?\s*/i, "").trim();
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

  const textRange = event.eventDate ? parseDateRangeFromText(event.eventDate) : { start: null, end: null };
  const textStart = normalizeToCalendarDate(textRange.start);
  const textEnd = normalizeToCalendarDate(textRange.end ?? textRange.start);

  let start = event.startDate ? calendarDayFromStored(event.startDate) : null;
  let end = event.endDate ? calendarDayFromStored(event.endDate) : null;

  // Prefer eventDate when structured dates are missing or corrupt (e.g. year 0026).
  if (isCorruptStoredDate(start, textStart) || (!start && textStart)) {
    start = textStart;
    end = textEnd ?? textStart;
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
      { startDate: { $exists: false } },
      { startDate: null },
      // Include corrupt/missing structured dates when eventDate text exists.
      { eventDate: { $exists: true, $ne: "" } },
    ],
  };
}

function resolveEventDatesFromBody(body) {
  let start = normalizeToCalendarDate(body.startDate);
  let end = normalizeToCalendarDate(body.endDate);

  if (body.eventDate) {
    const range = parseDateRangeFromText(body.eventDate);
    const fromTextStart = normalizeToCalendarDate(range.start);
    const fromTextEnd = normalizeToCalendarDate(range.end ?? range.start);

    if (isCorruptStoredDate(start, fromTextStart) || !start) {
      start = fromTextStart;
    }
    if (isCorruptStoredDate(end, fromTextEnd) || !end) {
      end = fromTextEnd ?? start;
    }
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

/** Repair corrupt startDate/endDate from eventDate text. Returns fields to $set or null. */
function repairEventDatesIfNeeded(event) {
  if (!event?.eventDate) return null;

  const resolved = resolveEventDatesFromBody({
    eventDate: event.eventDate,
    startDate: event.startDate,
    endDate: event.endDate,
  });

  if (!resolved.startDate) return null;

  const currentStart = event.startDate ? calendarDayFromStored(event.startDate) : null;
  if (
    !isCorruptStoredDate(currentStart, resolved.startDate) &&
    currentStart &&
    resolved.startDate &&
    currentStart.getTime() === resolved.startDate.getTime()
  ) {
    return null;
  }

  return {
    startDate: resolved.startDate,
    endDate: resolved.endDate ?? resolved.startDate,
  };
}

function eventOccursOnUpcomingWeekend(event, now = new Date()) {
  const today = now instanceof Date ? now : new Date(now);
  const dayOfWeek = today.getDay();
  const daysUntilSaturday = (6 - dayOfWeek + 7) % 7;
  const saturdayOffset = daysUntilSaturday === 0 ? 7 : daysUntilSaturday;

  const saturday = new Date(today);
  saturday.setDate(today.getDate() + saturdayOffset);
  const sunday = new Date(saturday);
  sunday.setDate(saturday.getDate() + 1);

  return (
    eventOccursOnDate(event, saturday) || eventOccursOnDate(event, sunday)
  );
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
  eventOccursOnUpcomingWeekend,
  isEventExpired,
  buildDayOverlapFilter,
  buildUpcomingFilter,
  resolveEventDatesFromBody,
  repairEventDatesIfNeeded,
};

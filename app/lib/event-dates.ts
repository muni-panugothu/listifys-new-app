/**
 * Client-side event date parsing and display helpers.
 * Mirrors server/utils/eventDates.js for consistent filtering labels.
 */

export type EventDateFields = {
  eventDate?: string;
  eventTime?: string;
  startDate?: string | Date;
  endDate?: string | Date;
};

export function parseFlexibleDate(input: unknown): Date | null {
  if (input == null || input === "") return null;
  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? null : input;
  }

  const str = String(input).trim();
  if (!str) return null;

  if (/^(mon|tue|wed|thu|fri|sat|sun)/i.test(str) && str.includes(":")) {
    return null;
  }

  const parsed = Date.parse(str);
  if (!Number.isNaN(parsed)) return new Date(parsed);

  const dm = str.match(/^(\d{1,2})\s+([a-z]{3,})(?:\s+(\d{4}))?$/i);
  if (dm) {
    const year = dm[3] ? Number(dm[3]) : new Date().getFullYear();
    const retry = Date.parse(`${dm[1]} ${dm[2]} ${year}`);
    if (!Number.isNaN(retry)) return new Date(retry);
  }

  return null;
}

/** UTC noon for a calendar day — avoids timezone shifting stored dates. */
export function normalizeToCalendarDate(input: unknown): Date | null {
  const parsed = input instanceof Date ? input : parseFlexibleDate(input);
  if (!parsed || Number.isNaN(parsed.getTime())) return null;
  return new Date(
    Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 12, 0, 0, 0),
  );
}

function calendarDayFromStored(value: string | Date): Date | null {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0, 0));
}

export function startOfDay(date: Date): Date {
  const d = calendarDayFromStored(date) ?? date;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

export function endOfDay(date: Date): Date {
  const d = calendarDayFromStored(date) ?? date;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
}

/** YYYY-MM-DD for UI date strip (user's local calendar day). */
export function dateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Parse YYYY-MM-DD as a timezone-neutral calendar day (UTC noon). */
export function parseDateKey(key: string): Date | null {
  const [y, m, d] = String(key).split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0, 0));
}

/** Local midnight — for building the date strip from today. */
export function localStartOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function getEventRange(event: EventDateFields): { start: Date; end: Date } | null {
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

export function eventOccursOnDate(event: EventDateFields, day: Date): boolean {
  const range = getEventRange(event);
  if (!range) return false;
  const dayStart = startOfDay(day);
  const dayEnd = endOfDay(day);
  return range.start <= dayEnd && range.end >= dayStart;
}

/** Parse "26 to 28 Jun", "26 Jun - 28 Jun 2026", etc. */
export function parseDateRangeFromText(text?: string): { start: Date | null; end: Date | null } {
  if (!text?.trim()) return { start: null, end: null };

  const str = text.trim();
  const rangeMatch = str.match(/^(.+?)\s*(?:–|—|-|to)\s*(.+)$/i);
  if (rangeMatch) {
    let startPart = rangeMatch[1].trim();
    const endPart = rangeMatch[2].trim();

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

export function formatShortDate(date: Date): string {
  return date.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
}

export function formatStripMonth(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
}

export function formatStripDay(date: Date): string {
  return String(date.getDate());
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Human-readable date/time for event cards.
 * Never returns "Invalid Date" — falls back to raw text fields.
 */
export function formatEventDisplayLabel(event: EventDateFields): string {
  const parts: string[] = [];

  const range = getEventRange(event);
  if (range) {
    if (isSameDay(range.start, range.end)) {
      parts.push(formatShortDate(range.start));
    } else {
      parts.push(`${formatShortDate(range.start)} – ${formatShortDate(range.end)}`);
    }
  } else if (event.eventDate?.trim()) {
    parts.push(event.eventDate.trim());
  }

  if (event.eventTime?.trim()) {
    parts.push(event.eventTime.trim());
  }

  return parts.join(" • ");
}

export type DateStripItem = {
  date: Date;
  key: string;
  count: number;
};

/**
 * Build horizontal date strip items from calendar API counts.
 * Includes today through the last day with events (min 14-day window).
 */
export function buildDateStripItems(
  counts: Record<string, number>,
  opts: { minDays?: number; maxDays?: number } = {},
): DateStripItem[] {
  const minDays = opts.minDays ?? 14;
  const maxDays = opts.maxDays ?? 60;
  const today = localStartOfDay(new Date());

  let lastEventDay = today;
  for (const [key, count] of Object.entries(counts)) {
    if (count > 0) {
      const d = parseDateKey(key);
      if (d && d > lastEventDay) lastEventDay = d;
    }
  }

  const span = Math.min(
    maxDays,
    Math.max(minDays, Math.ceil((lastEventDay.getTime() - today.getTime()) / 86_400_000) + 1),
  );

  const items: DateStripItem[] = [];
  for (let i = 0; i < span; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const key = dateKey(d);
    items.push({ date: d, key, count: counts[key] ?? 0 });
  }

  return items;
}

export function buildCalendarGrid(month: Date): (Date | null)[][] {
  const year = month.getFullYear();
  const m = month.getMonth();
  const firstDay = new Date(year, m, 1).getDay();
  const daysInMonth = new Date(year, m + 1, 0).getDate();
  const cells: (Date | null)[] = Array(firstDay).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, m, d));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export function buildWeekStrip(anchor: Date): Date[] {
  const start = startOfDay(anchor);
  const dayOfWeek = start.getDay();
  start.setDate(start.getDate() - dayOfWeek);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

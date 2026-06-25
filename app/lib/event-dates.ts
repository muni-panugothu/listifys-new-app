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

  return null;
}

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

/** YYYY-MM-DD in local timezone */
export function dateKey(date: Date): string {
  const d = startOfDay(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseDateKey(key: string): Date | null {
  const [y, m, d] = String(key).split("-").map(Number);
  if (!y || !m || !d) return null;
  return startOfDay(new Date(y, m - 1, d));
}

export function getEventRange(event: EventDateFields): { start: Date; end: Date } | null {
  let start = event.startDate ? new Date(event.startDate) : parseFlexibleDate(event.eventDate);
  let end = event.endDate ? new Date(event.endDate) : start;

  if (!start || Number.isNaN(start.getTime())) return null;
  if (!end || Number.isNaN(end.getTime())) end = start;
  if (end < start) end = start;

  return { start: startOfDay(start), end: endOfDay(end) };
}

export function eventOccursOnDate(event: EventDateFields, day: Date): boolean {
  const range = getEventRange(event);
  if (!range) return false;
  const dayStart = startOfDay(day);
  const dayEnd = endOfDay(day);
  return range.start <= dayEnd && range.end >= dayStart;
}

/** Parse "27 Jun 2025 - 30 Jun 2025" style ranges from free-text eventDate. */
export function parseDateRangeFromText(text?: string): { start: Date | null; end: Date | null } {
  if (!text?.trim()) return { start: null, end: null };

  const parts = text.split(/\s*(?:–|—|-|to)\s*/i).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const start = parseFlexibleDate(parts[0]);
    const end = parseFlexibleDate(parts[parts.length - 1]);
    return { start, end };
  }

  const single = parseFlexibleDate(text);
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
  const today = startOfDay(new Date());

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

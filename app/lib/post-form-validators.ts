const MONTH_NAMES: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

/** Parse user-entered event date (e.g. "25 Dec 2025", "25/12/2025", "2025-12-25"). */
export function parseEventDateInput(raw: string): Date | null {
  const input = raw.trim();
  if (!input) return null;

  // Reject obvious garbage (e.g. "20222", letters only)
  if (/^\d{5,}$/.test(input.replace(/\D/g, "")) && !input.includes("/") && !input.includes("-")) {
    return null;
  }

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(input);
  if (iso) {
    const y = Number(iso[1]);
    const m = Number(iso[2]);
    const d = Number(iso[3]);
    if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
    const date = new Date(y, m - 1, d);
    return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? date : null;
  }

  const slash = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/.exec(input);
  if (slash) {
    const d = Number(slash[1]);
    const m = Number(slash[2]);
    const y = Number(slash[3]);
    if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
    const date = new Date(y, m - 1, d);
    return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? date : null;
  }

  const text = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/.exec(input);
  if (text) {
    const d = Number(text[1]);
    const monthKey = text[2].toLowerCase();
    const y = Number(text[3]);
    const m = MONTH_NAMES[monthKey];
    if (m === undefined || y < 2000 || y > 2100 || d < 1 || d > 31) return null;
    const date = new Date(y, m, d);
    return date.getFullYear() === y && date.getMonth() === m && date.getDate() === d ? date : null;
  }

  const parsed = new Date(input);
  if (!Number.isNaN(parsed.getTime()) && input.length >= 8) {
    return parsed;
  }

  return null;
}

export function isEventDateTodayOrFuture(date: Date): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const check = new Date(date);
  check.setHours(0, 0, 0, 0);
  return check >= today;
}

/** Accepts "7:00 PM", "07:30 am", "19:00". */
export function isValidEventTime(raw: string): boolean {
  const input = raw.trim();
  if (!input) return false;
  const twelve = /^(0?[1-9]|1[0-2]):([0-5]\d)\s*(AM|PM|am|pm)$/.test(input);
  const twentyFour = /^([01]?\d|2[0-3]):([0-5]\d)$/.test(input);
  return twelve || twentyFour;
}

export function normalizeEventTime(raw: string): string {
  const input = raw.trim();
  const m = /^(0?[1-9]|1[0-2]):([0-5]\d)\s*(AM|PM|am|pm)$/.exec(input);
  if (m) {
    const suffix = m[3].toUpperCase();
    const hour = m[1].padStart(m[1].length === 1 ? 0 : 0, "") || m[1];
    return `${hour}:${m[2]} ${suffix}`;
  }
  return input;
}

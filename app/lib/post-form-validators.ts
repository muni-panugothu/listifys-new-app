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

  // Reject obvious garbage (e.g. "20222") — but not text dates like "10 Aug 2026".
  const digitsOnly = input.replace(/\D/g, "");
  if (
    !/[A-Za-z]/.test(input) &&
    /^\d{5,}$/.test(digitsOnly) &&
    !input.includes("/") &&
    !input.includes("-")
  ) {
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

/** Format a picked date for the post-ad event date field (e.g. "10 Aug 2026"). */
export function formatEventDateForForm(date: Date): string {
  const day = date.getDate();
  const month = date.toLocaleString("en-IN", { month: "short" });
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
}

export type EventTimeParts = {
  hour12: number;
  minute: number;
  period: "AM" | "PM";
};

export function parseEventTimeParts(raw: string): EventTimeParts {
  const input = raw.trim();
  const twelve = /^(0?[1-9]|1[0-2]):([0-5]\d)\s*(AM|PM|am|pm)$/.exec(input);
  if (twelve) {
    return {
      hour12: Number(twelve[1]),
      minute: Number(twelve[2]),
      period: twelve[3].toUpperCase() as "AM" | "PM",
    };
  }

  const twentyFour = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(input);
  if (twentyFour) {
    const h24 = Number(twentyFour[1]);
    const minute = Number(twentyFour[2]);
    return {
      hour12: h24 % 12 || 12,
      minute,
      period: h24 >= 12 ? "PM" : "AM",
    };
  }

  const now = new Date();
  const h = now.getHours();
  const roundedMinute = Math.round(now.getMinutes() / 15) * 15;
  return {
    hour12: h % 12 || 12,
    minute: roundedMinute % 60,
    period: h >= 12 ? "PM" : "AM",
  };
}

export function formatEventTimeFromParts(parts: EventTimeParts): string {
  return `${parts.hour12}:${String(parts.minute).padStart(2, "0")} ${parts.period}`;
}

export function isSameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Minutes since midnight for 12h or 24h time strings. */
export function parseTimeToMinutes(raw: string): number | null {
  const input = raw.trim();
  const twelve = /^(0?[1-9]|1[0-2]):([0-5]\d)\s*(AM|PM|am|pm)$/.exec(input);
  if (twelve) {
    let hour = Number(twelve[1]) % 12;
    if (twelve[3].toUpperCase() === "PM") hour += 12;
    return hour * 60 + Number(twelve[2]);
  }
  const twentyFour = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(input);
  if (twentyFour) {
    return Number(twentyFour[1]) * 60 + Number(twentyFour[2]);
  }
  return null;
}

export function isEventEndDateOnOrAfterStart(startRaw: string, endRaw: string): boolean {
  const start = parseEventDateInput(startRaw);
  const end = parseEventDateInput(endRaw);
  if (!start || !end) return false;
  const s = new Date(start);
  const e = new Date(end);
  s.setHours(0, 0, 0, 0);
  e.setHours(0, 0, 0, 0);
  return e >= s;
}

/** When dates are the same day, end time must be after start time. */
export function isEventEndTimeAfterStart(
  startDateRaw: string,
  endDateRaw: string,
  startTimeRaw: string,
  endTimeRaw: string,
): boolean {
  const startDate = parseEventDateInput(startDateRaw);
  const endDate = parseEventDateInput(endDateRaw);
  if (!startDate || !endDate) return false;
  if (!isSameCalendarDay(startDate, endDate)) return true;

  const startM = parseTimeToMinutes(startTimeRaw);
  const endM = parseTimeToMinutes(endTimeRaw);
  if (startM == null || endM == null) return false;
  return endM > startM;
}

/** Legacy display string stored in eventDate (single or multi-day). */
export function buildLegacyEventDateString(startRaw: string, endRaw: string): string {
  const start = parseEventDateInput(startRaw);
  const end = parseEventDateInput(endRaw);
  if (!start) return startRaw.trim();
  if (!end || isSameCalendarDay(start, end)) return formatEventDateForForm(start);

  const startDay = start.getDate();
  const startMonth = start.toLocaleString("en-IN", { month: "short" });
  const endDay = end.getDate();
  const endMonth = end.toLocaleString("en-IN", { month: "short" });
  const endYear = end.getFullYear();

  if (start.getFullYear() === endYear && start.getMonth() === end.getMonth()) {
    return `${startDay} – ${endDay} ${endMonth} ${endYear}`;
  }
  if (start.getFullYear() === endYear) {
    return `${startDay} ${startMonth} – ${endDay} ${endMonth} ${endYear}`;
  }
  return `${formatEventDateForForm(start)} – ${formatEventDateForForm(end)}`;
}

/** Legacy display string stored in eventTime. */
export function buildLegacyEventTimeString(startTimeRaw: string, endTimeRaw: string): string {
  const start = normalizeEventTime(startTimeRaw);
  const end = normalizeEventTime(endTimeRaw);
  if (!start) return end;
  if (!end || start === end) return start;
  return `${start} – ${end}`;
}

/** Preview label for the post-ad form. */
export function buildEventSchedulePreview(
  startDateRaw: string,
  endDateRaw: string,
  startTimeRaw: string,
  endTimeRaw: string,
): string {
  const datePart = buildLegacyEventDateString(startDateRaw, endDateRaw);
  const timePart = buildLegacyEventTimeString(startTimeRaw, endTimeRaw);
  return [datePart, timePart].filter(Boolean).join(" • ");
}

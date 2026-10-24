// Pure date math for weekly plans. Dates are handled as local calendar dates and
// exchanged with the API as ISO strings (YYYY-MM-DD).

const MS_PER_DAY = 86_400_000;

export const DAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

const pad = (value: number) => String(value).padStart(2, "0");

/** Format a local date as YYYY-MM-DD. */
export function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Parse YYYY-MM-DD as a local date at midnight. */
export function parseIsoDate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    throw new Error(`Invalid ISO date: ${iso}`);
  }
  return new Date(year, month - 1, day);
}

/** Add whole calendar days (DST-safe, since it works on the date fields). */
export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** The Monday of the week containing ``date``. */
export function mondayOf(date: Date): Date {
  const sinceMonday = (date.getDay() + 6) % 7;
  return addDays(date, -sinceMonday);
}

/** ISO date of the Monday that starts the week containing ``date``. */
export function weekStartOf(date: Date): string {
  return toIsoDate(mondayOf(date));
}

/** Whole days from ``a`` to ``b`` (calendar days). */
export function daysBetween(a: Date, b: Date): number {
  const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((utcB - utcA) / MS_PER_DAY);
}

export function isToday(iso: string, now: Date): boolean {
  return iso === toIsoDate(now);
}

const SHORT_DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
const LONG_DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

/** "26 Oct" */
export function formatShortDate(iso: string): string {
  return SHORT_DATE.format(parseIsoDate(iso));
}

/** "26 October 2026" */
export function formatLongDate(iso: string): string {
  return LONG_DATE.format(parseIsoDate(iso));
}

/** "26 Oct – 1 Nov 2026" for the week starting on ``weekStart``. */
export function formatWeekRange(weekStart: string): string {
  const start = parseIsoDate(weekStart);
  const end = addDays(start, 6);
  return `${SHORT_DATE.format(start)} – ${LONG_DATE.format(end)}`;
}

/** Name of day index 0-6, e.g. "Monday". */
export function dayName(day: number): string {
  return DAY_NAMES[day] ?? "";
}

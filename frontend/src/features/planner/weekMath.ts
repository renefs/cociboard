// Pure date math for weekly plans. Dates are handled as local calendar dates and
// exchanged with the API as ISO strings (YYYY-MM-DD).

const MS_PER_DAY = 86_400_000;

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

/** The `Intl` locale of each UI language ("en" keeps day-first dates, as in the UK). */
const INTL_LOCALE: Record<string, string> = { en: "en-GB", es: "es-ES" };
const intlLocale = (locale: string) => INTL_LOCALE[locale] ?? INTL_LOCALE["en"] ?? "en-GB";

type FormatKind = "short" | "long" | "weekday" | "datetime";
const OPTIONS: Record<FormatKind, Intl.DateTimeFormatOptions> = {
  short: { day: "numeric", month: "short" },
  long: { day: "numeric", month: "long", year: "numeric" },
  weekday: { weekday: "long" },
  datetime: { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" },
};
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(locale: string, kind: FormatKind): Intl.DateTimeFormat {
  const key = `${locale}:${kind}`;
  let cached = formatters.get(key);
  if (!cached) {
    cached = new Intl.DateTimeFormat(intlLocale(locale), OPTIONS[kind]);
    formatters.set(key, cached);
  }
  return cached;
}

/** "26 Oct" / "26 oct" */
export function formatShortDate(iso: string, locale: string): string {
  return formatter(locale, "short").format(parseIsoDate(iso));
}

/** "26 Oct 2026, 14:05" / "26 oct 2026, 14:05", in the viewer's time zone. */
export function formatDateTime(moment: string | Date, locale: string): string {
  return formatter(locale, "datetime").format(typeof moment === "string" ? new Date(moment) : moment);
}

/** "26 October 2026" / "26 de octubre de 2026" */
export function formatLongDate(iso: string, locale: string): string {
  return formatter(locale, "long").format(parseIsoDate(iso));
}

/** "26 Oct – 1 November 2026" for the week starting on ``weekStart``. */
export function formatWeekRange(weekStart: string, locale: string): string {
  const start = parseIsoDate(weekStart);
  const end = addDays(start, 6);
  return `${formatter(locale, "short").format(start)} – ${formatter(locale, "long").format(end)}`;
}

/** "26 Oct – 1 Nov 2026" / "26 oct – 1 nov 2026": the compact range shown in the planner header. */
export function formatWeekRangeShort(weekStart: string, locale: string): string {
  const start = parseIsoDate(weekStart);
  const end = addDays(start, 6);
  const short = formatter(locale, "short");
  return `${short.format(start)} – ${short.format(end)} ${end.getFullYear()}`;
}

/** 2024-01-01 was a Monday: a fixed reference for weekday names. */
const REFERENCE_MONDAY = new Date(2024, 0, 1);

/**
 * Name of day index 0-6 ("Monday" / "Lunes"). Capitalised for headings and labels; pass
 * `capitalize: false` for the lower-case form Spanish uses mid-sentence ("el lunes").
 */
export function dayName(day: number, locale: string, capitalize = true): string {
  const name = formatter(locale, "weekday").format(addDays(REFERENCE_MONDAY, day));
  const lang = intlLocale(locale);
  return capitalize
    ? name.charAt(0).toLocaleUpperCase(lang) + name.slice(1)
    : name.toLocaleLowerCase(lang);
}

/** The Monday ``weeks`` weeks after (or before, when negative) ``weekStart``. */
export function shiftWeek(weekStart: string, weeks: number): string {
  return toIsoDate(addDays(parseIsoDate(weekStart), weeks * 7));
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Parse a YYYY-MM-DD string; null when malformed or not a real calendar date. */
export function parseStrictIsoDate(value: string | null): Date | null {
  if (!value || !ISO_DATE.test(value)) return null;
  const date = parseIsoDate(value);
  return toIsoDate(date) === value ? date : null;
}

/**
 * The week shown for a URL query string: the Monday of the date in `?week=`, or the week of
 * `now` when the parameter is missing or invalid.
 */
export function weekFromSearch(search: string, now: Date): string {
  const date = parseStrictIsoDate(new URLSearchParams(search).get("week"));
  return weekStartOf(date ?? now);
}

/** The query string for `weekStart`: other parameters are kept, the current week is implicit. */
export function searchForWeek(search: string, weekStart: string, now: Date): string {
  const params = new URLSearchParams(search);
  if (weekStart === weekStartOf(now)) params.delete("week");
  else params.set("week", weekStart);
  const query = params.toString();
  return query ? `?${query}` : "";
}

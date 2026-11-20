import { TIMEZONE } from "../playwright.config";

/** Today's date as the app sees it: the server and the browser both run in Europe/Madrid. */
export function today(): { iso: string; weekStart: string; dayIndex: number; weekday: string } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(new Date());
  const [y, m, d] = parts.split("-").map(Number) as [number, number, number];
  const utc = new Date(Date.UTC(y, m - 1, d));
  const dayIndex = (utc.getUTCDay() + 6) % 7; // Monday = 0
  const monday = new Date(utc.getTime() - dayIndex * 86_400_000);
  return {
    iso: utc.toISOString().slice(0, 10),
    weekStart: monday.toISOString().slice(0, 10),
    dayIndex,
    weekday: new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "UTC" }).format(utc),
  };
}

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** `iso` (YYYY-MM-DD) shifted by `days`. */
export function addDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

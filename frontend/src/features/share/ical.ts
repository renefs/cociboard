// Pure iCalendar (RFC 5545) export of a week's meals: one event per filled slot.
import type { TFunction } from "i18next";
import type { DayPlan, MealSlot, WeekPlan } from "../../api/types";
import { MEAL_SLOTS } from "../../api/types";
import { mealName, mealOfDay, recipeOf } from "../planner/slots";

/** Typical meal times in Spain: the defaults of the household preferences. */
export const DEFAULT_MEAL_TIMES: MealTimes = { lunch: "14:00", dinner: "21:00" };

/** Start of each meal as `HH:MM` (24 h); events are floating local times, one hour long. */
export type MealTimes = Record<MealSlot, string>;

export interface IcsOptions {
  /** When lunch and dinner start; defaults to 14:00 and 21:00. */
  times?: MealTimes;
  /** The moment of export, written as DTSTAMP (injected so the output is deterministic). */
  now: Date;
  /** App version for PRODID; omitted from it when not given. */
  version?: string;
}

const pad = (value: number) => String(value).padStart(2, "0");
const encoder = new TextEncoder();

/** TEXT value escaping: backslash, semicolon, comma and line breaks. */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/**
 * Fold a content line at 75 octets (RFC 5545 3.1): the break is CRLF plus one space, which
 * counts toward the next line. Bytes are counted in UTF-8 and a character is never split.
 */
export function foldLine(line: string): string {
  if (encoder.encode(line).length <= 75) return line;
  const lines: string[] = [];
  let current = "";
  let bytes = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    // Continuation lines start with a space, so they carry one octet less of content.
    const limit = lines.length === 0 ? 75 : 74;
    if (bytes + size > limit) {
      lines.push(current);
      current = "";
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  lines.push(current);
  return lines.map((part, index) => (index === 0 ? part : ` ${part}`)).join("\r\n");
}

/** UTC timestamp: 20261120T093000Z */
function utcStamp(date: Date): string {
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

function localStamp(isoDate: string, minutes: number): string {
  return `${isoDate.replaceAll("-", "")}T${pad(Math.floor(minutes / 60))}${pad(minutes % 60)}00`;
}

/** Minutes after midnight of an `HH:MM` time; falls back to the default for a malformed one. */
function minutesOf(time: string, fallback: string): number {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time) ?? /^(\d\d):(\d\d)$/.exec(fallback);
  return Number(match?.[1]) * 60 + Number(match?.[2]);
}

const addDays = (isoDate: string, days: number) => {
  const [year = 0, month = 1, day = 1] = isoDate.split("-").map(Number);
  const moved = new Date(Date.UTC(year, month - 1, day + days));
  return `${moved.getUTCFullYear()}-${pad(moved.getUTCMonth() + 1)}-${pad(moved.getUTCDate())}`;
};

/** Start and end (one hour later, possibly after midnight) of a slot's event. */
function eventTimes(isoDate: string, slot: MealSlot, times: MealTimes): { start: string; end: string } {
  const start = minutesOf(times[slot], DEFAULT_MEAL_TIMES[slot]);
  const end = start + 60;
  return {
    start: localStamp(isoDate, start),
    end: end >= 24 * 60 ? localStamp(addDays(isoDate, 1), end - 24 * 60) : localStamp(isoDate, end),
  };
}

function eventLines(
  day: DayPlan,
  slot: MealSlot,
  t: TFunction,
  stamp: string,
  times: MealTimes,
): string[] | null {
  const meal = mealOfDay(day, slot);
  if (!meal) return null;
  const recipe = recipeOf(meal);
  const description = [meal.note, ...(recipe?.ingredients ?? [])].filter(
    (line): line is string => typeof line === "string" && line !== "",
  );
  const { start, end } = eventTimes(day.date, slot, times);
  return [
    "BEGIN:VEVENT",
    `UID:${day.date}-${slot}@cociboard`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${escapeText(t(`share.line.${slot}`, { meal: mealName(meal, t) }))}`,
    ...(description.length > 0 ? [`DESCRIPTION:${escapeText(description.join("\n"))}`] : []),
    ...(recipe?.source_url ? [`URL:${recipe.source_url}`] : []),
    "END:VEVENT",
  ];
}

/**
 * The week as an iCalendar document (CRLF line endings). UIDs derive from the date and the
 * slot, so importing a later export updates the events instead of duplicating them.
 */
export function weekAsIcs(plan: WeekPlan, t: TFunction, options: IcsOptions): string {
  const stamp = utcStamp(options.now);
  const times = options.times ?? DEFAULT_MEAL_TIMES;
  const product = options.version ? `Cociboard ${options.version}` : "Cociboard";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//Cociboard//${product}//EN`,
    "CALSCALE:GREGORIAN",
    ...plan.days.flatMap((day) => MEAL_SLOTS.flatMap((slot) => eventLines(day, slot, t, stamp, times) ?? [])),
    "END:VCALENDAR",
  ];
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

/** File name of the export: cociboard-2026-11-16.ics */
export function icsFileName(weekStart: string): string {
  return `cociboard-${weekStart}.ics`;
}

import { describe, expect, it } from "vitest";
import {
  addDays,
  dayAbbr,
  dayName,
  daysBetween,
  formatDateTime,
  formatShortDate,
  formatWeekRange,
  formatWeekRangeShort,
  searchForWeek,
  shiftWeek,
  weekFromSearch,
  isToday,
  mondayOf,
  parseIsoDate,
  toIsoDate,
  weekStartOf,
} from "./weekMath";

describe("weekMath", () => {
  it("round-trips ISO dates", () => {
    expect(toIsoDate(parseIsoDate("2026-03-05"))).toBe("2026-03-05");
    expect(() => parseIsoDate("nope")).toThrow();
  });

  it("finds the Monday of any weekday", () => {
    expect(weekStartOf(new Date(2026, 9, 26))).toBe("2026-10-26"); // Monday
    expect(weekStartOf(new Date(2026, 9, 28))).toBe("2026-10-26"); // Wednesday
    expect(weekStartOf(new Date(2026, 10, 1))).toBe("2026-10-26"); // Sunday
    expect(weekStartOf(new Date(2027, 0, 1))).toBe("2026-12-28"); // across the year boundary
  });

  it("returns a Monday at local midnight", () => {
    const monday = mondayOf(new Date(2026, 9, 30, 18, 45));
    expect(monday.getDay()).toBe(1);
    expect(monday.getHours()).toBe(0);
  });

  it("adds days across month ends and DST changes", () => {
    expect(toIsoDate(addDays(new Date(2026, 9, 30), 3))).toBe("2026-11-02");
    expect(toIsoDate(addDays(new Date(2026, 2, 28), 2))).toBe("2026-03-30");
    expect(daysBetween(new Date(2026, 2, 28), new Date(2026, 2, 30))).toBe(2);
  });

  it("detects today", () => {
    expect(isToday("2026-10-28", new Date(2026, 9, 28, 23, 59))).toBe(true);
    expect(isToday("2026-10-27", new Date(2026, 9, 28))).toBe(false);
  });

  it("formats dates and ranges in English", () => {
    expect(formatShortDate("2026-10-26", "en")).toBe("26 Oct");
    expect(formatWeekRange("2026-10-26", "en")).toBe("26 Oct – 1 November 2026");
    expect(formatWeekRangeShort("2026-10-26", "en")).toBe("26 Oct – 1 Nov 2026");
    expect(formatWeekRangeShort("2026-12-28", "en")).toBe("28 Dec – 3 Jan 2027");
    expect(dayName(0, "en")).toBe("Monday");
    expect(dayName(6, "en")).toBe("Sunday");
  });

  it("formats dates and ranges in Spanish", () => {
    expect(formatShortDate("2026-10-26", "es")).toBe("26 oct");
    expect(formatWeekRange("2026-10-26", "es")).toBe("26 oct – 1 de noviembre de 2026");
    expect(formatWeekRangeShort("2026-10-26", "es")).toBe("26 oct – 1 nov 2026");
    expect(dayName(0, "es")).toBe("Lunes");
    expect(dayName(5, "es")).toBe("Sábado");
    expect(dayName(0, "es", false)).toBe("lunes");
  });

  it("falls back to English for an unknown locale", () => {
    expect(dayName(2, "fr")).toBe("Wednesday");
  });
});

describe("week navigation helpers", () => {
  const now = new Date(2026, 9, 28); // Wednesday, week of 2026-10-26

  it("shifts by whole weeks across month and year boundaries", () => {
    expect(shiftWeek("2026-10-26", 1)).toBe("2026-11-02");
    expect(shiftWeek("2026-10-26", -1)).toBe("2026-10-19");
    expect(shiftWeek("2026-12-28", 1)).toBe("2027-01-04");
    expect(shiftWeek("2026-03-23", 1)).toBe("2026-03-30"); // across the DST change
  });

  it("reads the week from the query string, normalising to the Monday", () => {
    expect(weekFromSearch("?week=2026-11-02", now)).toBe("2026-11-02");
    expect(weekFromSearch("?week=2026-11-05", now)).toBe("2026-11-02");
    expect(weekFromSearch("?x=1&week=2026-11-02", now)).toBe("2026-11-02");
  });

  it("falls back to the current week for missing or invalid parameters", () => {
    expect(weekFromSearch("", now)).toBe("2026-10-26");
    expect(weekFromSearch("?week=", now)).toBe("2026-10-26");
    expect(weekFromSearch("?week=banana", now)).toBe("2026-10-26");
    expect(weekFromSearch("?week=2026-02-31", now)).toBe("2026-10-26");
    expect(weekFromSearch("?week=2026-2-3", now)).toBe("2026-10-26");
  });

  it("builds the query string: the current week is implicit and other params are kept", () => {
    expect(searchForWeek("", "2026-11-02", now)).toBe("?week=2026-11-02");
    expect(searchForWeek("?week=2026-11-02", "2026-10-26", now)).toBe("");
    expect(searchForWeek("?a=1&week=2026-11-02", "2026-10-26", now)).toBe("?a=1");
    expect(searchForWeek("?a=1", "2026-11-09", now)).toBe("?a=1&week=2026-11-09");
  });
});

describe("formatDateTime", () => {
  it("formats a moment in each language, day first, with the time", () => {
    const moment = new Date(2026, 10, 19, 14, 5);
    expect(formatDateTime(moment, "en")).toBe("19 Nov 2026, 14:05");
    expect(formatDateTime(moment, "es")).toMatch(/^19 nov\.? 2026,? 14:05$/);
  });

  it("accepts an ISO string", () => {
    expect(formatDateTime(new Date(2026, 10, 19, 9, 0).toISOString(), "en")).toBe("19 Nov 2026, 09:00");
  });
});

describe("dayAbbr", () => {
  it("abbreviates the weekday in each language", () => {
    expect(dayAbbr(0, "en")).toBe("Mon");
    expect(dayAbbr(6, "en")).toBe("Sun");
    expect(dayAbbr(0, "es")).toBe("lun");
    expect(dayAbbr(2, "es")).toBe("mié");
  });
});

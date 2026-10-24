import { describe, expect, it } from "vitest";
import {
  addDays,
  dayName,
  daysBetween,
  formatShortDate,
  formatWeekRange,
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
    expect(formatShortDate("2026-10-26")).toBe("26 Oct");
    expect(formatWeekRange("2026-10-26")).toBe("26 Oct – 1 November 2026");
    expect(dayName(0)).toBe("Monday");
    expect(dayName(6)).toBe("Sunday");
  });
});

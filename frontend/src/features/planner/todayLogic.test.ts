import { describe, expect, it } from "vitest";
import { makePlan, makeRecipe } from "../../test/fixtures";
import { dayPlanFor, dayRefOf, hasMeals, tomorrowOf } from "./todayLogic";

describe("dayRefOf / tomorrowOf", () => {
  it("places a midweek day in its week", () => {
    expect(dayRefOf(new Date(2026, 9, 28))).toEqual({ weekStart: "2026-10-26", day: 2, date: "2026-10-28" });
    expect(tomorrowOf(new Date(2026, 9, 28))).toEqual({ weekStart: "2026-10-26", day: 3, date: "2026-10-29" });
  });

  it("moves tomorrow into next week on a Sunday", () => {
    expect(dayRefOf(new Date(2026, 10, 1))).toEqual({ weekStart: "2026-10-26", day: 6, date: "2026-11-01" });
    expect(tomorrowOf(new Date(2026, 10, 1))).toEqual({ weekStart: "2026-11-02", day: 0, date: "2026-11-02" });
  });

  it("crosses a month and year boundary", () => {
    expect(tomorrowOf(new Date(2026, 11, 31))).toEqual({ weekStart: "2026-12-28", day: 4, date: "2027-01-01" });
  });
});

describe("dayPlanFor", () => {
  const plan = makePlan("2026-10-26");

  it("finds the day of a loaded week", () => {
    expect(dayPlanFor(plan, dayRefOf(new Date(2026, 9, 28)))?.date).toBe("2026-10-28");
  });

  it("is null while loading or for another week", () => {
    expect(dayPlanFor(undefined, dayRefOf(new Date(2026, 9, 28)))).toBeNull();
    expect(dayPlanFor(plan, tomorrowOf(new Date(2026, 10, 1)))).toBeNull();
  });
});

describe("hasMeals", () => {
  it("is false for an empty day or no day", () => {
    expect(hasMeals(null)).toBe(false);
    expect(hasMeals(makePlan().days[0] ?? null)).toBe(false);
  });

  it("counts recipes and special meals", () => {
    const withRecipe = makePlan("2026-10-26", { "0:dinner": makeRecipe() });
    const withSpecial = makePlan("2026-10-26", {}, undefined, { specials: { "0:lunch": "leftovers" } });
    expect(hasMeals(withRecipe.days[0] ?? null)).toBe(true);
    expect(hasMeals(withSpecial.days[0] ?? null)).toBe(true);
  });
});

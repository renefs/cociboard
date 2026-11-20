import { describe, expect, it } from "vitest";
import type { PlannedMeal } from "../../api/types";
import i18n from "../../i18n";
import { makeRecipe } from "../../test/fixtures";
import { elapsedSince, lastMadeText, nextMeal, sortByNotMadeLately, whenText } from "./historyLogic";

const NOW = new Date(2026, 10, 20); // 20 Nov 2026

describe("elapsedSince", () => {
  it.each([
    ["2026-11-20", { unit: "today" }],
    ["2026-11-21", { unit: "today" }], // a clock behind the server's
    ["2026-11-19", { unit: "yesterday" }],
    ["2026-11-07", { unit: "days", count: 13 }],
    ["2026-11-06", { unit: "weeks", count: 2 }],
    ["2026-10-02", { unit: "weeks", count: 7 }],
    ["2026-09-21", { unit: "months", count: 2 }],
    ["2026-01-01", { unit: "months", count: 11 }],
    ["2025-11-20", { unit: "years", count: 1 }],
    ["2024-01-01", { unit: "years", count: 2 }],
  ])("%s", (iso, expected) => {
    expect(elapsedSince(iso, NOW)).toEqual(expected);
  });
});

describe("lastMadeText", () => {
  const en = i18n.getFixedT("en");
  const es = i18n.getFixedT("es");
  const at = (last: string | null) => ({ last_planned_on: last });

  it("says never for recipes without a past meal", () => {
    expect(lastMadeText(at(null), NOW, en)).toBe("Never planned");
    expect(lastMadeText(at(null), NOW, es)).toBe("Nunca planificada");
  });

  it("uses plurals in both languages", () => {
    expect(lastMadeText(at("2026-11-19"), NOW, en)).toBe("Last made yesterday");
    expect(lastMadeText(at("2026-11-17"), NOW, en)).toBe("Last made 3 days ago");
    expect(lastMadeText(at("2026-10-30"), NOW, en)).toBe("Last made 3 weeks ago");
    expect(lastMadeText(at("2026-11-13"), NOW, en)).toBe("Last made 7 days ago");
    expect(lastMadeText(at("2025-11-20"), NOW, en)).toBe("Last made 1 year ago");
    expect(lastMadeText(at("2026-10-30"), NOW, es)).toBe("Preparada hace 3 semanas");
    expect(lastMadeText(at("2026-11-20"), NOW, es)).toBe("Preparada hoy");
    expect(lastMadeText(at("2025-11-20"), NOW, es)).toBe("Preparada hace 1 año");
  });
});

describe("whenText", () => {
  it("joins a short date and the slot name", () => {
    expect(whenText("2026-11-26", "lunch", i18n.getFixedT("en"), "en")).toBe("Thu 26 Nov · Lunch");
    expect(whenText("2026-11-26", "dinner", i18n.getFixedT("es"), "es")).toMatch(/^jue,? 26 nov\.? · Cena$/);
  });
});

describe("nextMeal", () => {
  const meal = (date: string, upcoming: boolean): PlannedMeal => ({
    date,
    week_start: "2026-11-16",
    day: 0,
    slot: "lunch",
    upcoming,
  });

  it("finds the meal of the server's next date in a most-recent-first list", () => {
    const meals = [meal("2026-12-01", true), meal("2026-11-23", true), meal("2026-11-10", false)];
    expect(nextMeal(meals, "2026-11-23")?.date).toBe("2026-11-23");
  });

  it("takes the lunch when a day has two meals", () => {
    const dinner: PlannedMeal = { ...meal("2026-11-23", true), slot: "dinner" };
    expect(nextMeal([dinner, meal("2026-11-23", true)], "2026-11-23")?.slot).toBe("lunch");
  });

  it("is null without a next date or when the list is capped before it", () => {
    expect(nextMeal([meal("2026-11-10", false)], null)).toBeNull();
    expect(nextMeal([meal("2026-12-01", true)], "2026-11-23")).toBeNull();
    expect(nextMeal([], "2026-11-23")).toBeNull();
  });
});

describe("sortByNotMadeLately", () => {
  const r = (id: number, name: string, last: string | null) =>
    makeRecipe({ id, name, last_planned_on: last });

  it("puts never-planned first, then the oldest, ties by name", () => {
    const input = [
      r(1, "Zarzuela", "2026-11-10"),
      r(2, "Arroz", "2026-11-18"),
      r(3, "Migas", null),
      r(4, "Bocadillo", "2026-11-10"),
      r(5, "Albóndigas", null),
    ];
    expect(sortByNotMadeLately(input).map((x) => x.name)).toEqual([
      "Albóndigas",
      "Migas",
      "Bocadillo",
      "Zarzuela",
      "Arroz",
    ]);
  });

  it("does not mutate its input", () => {
    const input = [r(1, "B", "2026-11-10"), r(2, "A", null)];
    sortByNotMadeLately(input);
    expect(input.map((x) => x.name)).toEqual(["B", "A"]);
  });
});

import type { Recipe } from "../api/types";

export function makeRecipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    id: 1,
    name: "Lentejas estofadas",
    description: null,
    meal_type: "lunch",
    protein: "legumes",
    prep_minutes: 60,
    ingredients: ["Lentejas", "Chorizo", "Zanahoria", "Cebolla", "Laurel", "Aceite"],
    properties: ["gluten_free", "batch_cooking"],
    created_at: "2026-01-01T00:00:00Z",
    archived: false,
    ...overrides,
  };
}

import type { DayPlan, MealSlot, VarietyReport, WeekPlan } from "../api/types";

export const NO_VARIETY: VarietyReport = {
  score: null,
  filled_slots: 0,
  issues: [],
  protein_counts: {},
};

/** A week plan with empty slots; `placements` maps "day:slot" to a recipe. */
export function makePlan(
  weekStart = "2026-10-26",
  placements: Partial<Record<`${number}:${MealSlot}`, Recipe>> = {},
  variety: VarietyReport = NO_VARIETY,
): WeekPlan {
  const [year, month, day] = weekStart.split("-").map(Number) as [number, number, number];
  const days: DayPlan[] = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(year, month - 1, day + index);
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    return {
      day: index,
      date: iso,
      lunch: placements[`${index}:lunch`] ?? null,
      dinner: placements[`${index}:dinner`] ?? null,
    };
  });
  return { week_start: weekStart, days, variety };
}

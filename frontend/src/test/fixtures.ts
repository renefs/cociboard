import type { Recipe, RecipeDraft } from "../api/types";

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
    servings: null,
    steps: [],
    source_url: null,
    created_at: "2026-01-01T00:00:00Z",
    archived: false,
    favourite: false,
    last_planned_on: null,
    next_planned_on: null,
    times_planned: 0,
    ...overrides,
  };
}

import type { DayPlan, MealSlot, SpecialMeal, VarietyReport, WeekPlan } from "../api/types";

export const NO_VARIETY: VarietyReport = {
  score: null,
  filled_slots: 0,
  issues: [],
  protein_counts: {},
};

type SlotKey = `${number}:${MealSlot}`;

/**
 * A week plan with empty slots; `placements` maps "day:slot" to a recipe, `specials` to a
 * special meal and `notes` to a slot note.
 */
export function makePlan(
  weekStart = "2026-10-26",
  placements: Partial<Record<SlotKey, Recipe>> = {},
  variety: VarietyReport = NO_VARIETY,
  extras: {
    specials?: Partial<Record<SlotKey, SpecialMeal>>;
    notes?: Partial<Record<SlotKey, string>>;
  } = {},
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
      lunch_special: extras.specials?.[`${index}:lunch`] ?? null,
      dinner_special: extras.specials?.[`${index}:dinner`] ?? null,
      lunch_note: extras.notes?.[`${index}:lunch`] ?? null,
      dinner_note: extras.notes?.[`${index}:dinner`] ?? null,
    };
  });
  return { week_start: weekStart, days, variety };
}

export function makeDraft(overrides: Partial<RecipeDraft> = {}): RecipeDraft {
  return {
    name: "Lemon Chicken Traybake",
    description: "A simple weeknight dinner.",
    servings: 4,
    prep_minutes: 60,
    ingredients: ["8 chicken thighs", "2 lemons"],
    steps: ["Heat the oven.", "Roast."],
    source_url: "https://www.example.com/final",
    warnings: [],
    ...overrides,
  };
}

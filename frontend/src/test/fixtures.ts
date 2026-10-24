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
    ...overrides,
  };
}

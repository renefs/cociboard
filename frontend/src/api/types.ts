// Mirrors the Pydantic schemas in backend/src/cociboard/schemas.py and domain.py.

export interface HealthResponse {
  status: string;
  version: string;
}

export const MEAL_TYPES = ["lunch", "dinner", "both"] as const;
export type MealType = (typeof MEAL_TYPES)[number];

export const MEAL_SLOTS = ["lunch", "dinner"] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];

export const PROTEINS = [
  "meat",
  "poultry",
  "fish",
  "seafood",
  "eggs",
  "legumes",
  "dairy",
  "tofu",
  "none",
] as const;
export type Protein = (typeof PROTEINS)[number];

export const RECIPE_PROPERTIES = [
  "vegetarian",
  "vegan",
  "gluten_free",
  "dairy_free",
  "quick",
  "spicy",
  "light",
  "kid_friendly",
  "batch_cooking",
] as const;
export type RecipeProperty = (typeof RECIPE_PROPERTIES)[number];

export interface Recipe {
  id: number;
  name: string;
  description: string | null;
  meal_type: MealType;
  protein: Protein;
  prep_minutes: number | null;
  ingredients: string[];
  properties: RecipeProperty[];
  created_at: string;
}

export interface RecipeCreate {
  name: string;
  description?: string | null;
  meal_type: MealType;
  protein: Protein;
  prep_minutes?: number | null;
  ingredients: string[];
  properties?: RecipeProperty[];
}

export type RecipeUpdate = Partial<RecipeCreate>;

export interface RecipeFilters {
  slot?: MealSlot | undefined;
  q?: string | undefined;
  properties?: readonly RecipeProperty[] | undefined;
}

export interface DayPlan {
  /** 0 = Monday ... 6 = Sunday */
  day: number;
  /** ISO date (YYYY-MM-DD) */
  date: string;
  lunch: Recipe | null;
  dinner: Recipe | null;
}

export interface WeekPlan {
  /** ISO date of the Monday that starts the week */
  week_start: string;
  days: DayPlan[];
}

export interface SlotRef {
  day: number;
  slot: MealSlot;
}

export interface SlotMoveRequest {
  from_day: number;
  from_slot: MealSlot;
  to_day: number;
  to_slot: MealSlot;
}

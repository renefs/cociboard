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

/** Response of `GET /api/recipes/{id}/usage`. */
export interface RecipeUsage {
  count: number;
}

/** A planned slot affected by a recipe edit. */
export interface ConflictSlot {
  /** ISO date of the Monday that starts the week */
  week_start: string;
  day: number;
  slot: MealSlot;
}

/** `detail` of the 409 answered when a meal-type change breaks planned meals. */
export interface MealTypeConflictDetail {
  code: "meal_type_conflict";
  message: string;
  conflicts: ConflictSlot[];
}

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

export type IssueKind =
  | "repeated_recipe"
  | "consecutive_protein"
  | "protein_overload"
  | "few_vegetarian"
  | "little_fish";
export type IssueSeverity = "info" | "warning";

export interface SlotPosition {
  day: number;
  slot: MealSlot;
}

export interface VarietyIssue {
  kind: IssueKind;
  severity: IssueSeverity;
  message: string;
  /** Slots involved; empty for plan-wide hints such as "little fish". */
  slots: SlotPosition[];
}

export interface VarietyReport {
  /** 0-100, or null while the plan is empty */
  score: number | null;
  filled_slots: number;
  issues: VarietyIssue[];
  protein_counts: Partial<Record<Protein, number>>;
}

export interface WeekPlan {
  /** ISO date of the Monday that starts the week */
  week_start: string;
  days: DayPlan[];
  variety: VarietyReport;
}

export interface SlotFill {
  day: number;
  slot: MealSlot;
  recipe_id: number;
}

/** A recipe that fits a slot, with its effect on the variety score. */
export interface Candidate {
  recipe: Recipe;
  score_delta: number;
  reason: string;
  good_pick: boolean;
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

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

/** Values behind an issue's message; the keys depend on `kind` (see `variety.py`). */
export type IssueParams = Record<string, string | number | SlotPosition>;

export interface VarietyIssue {
  kind: IssueKind;
  severity: IssueSeverity;
  /** English text for API consumers; the UI translates from `kind` and `params`. */
  message: string;
  params: IssueParams;
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
export const CANDIDATE_REASONS = [
  "fits_week",
  "adds_fish",
  "adds_vegetable_forward",
  "new_protein",
  "twice_in_a_row",
  "protein_overload",
  "already_planned",
  "already_planned_batch",
] as const;
export type CandidateReason = (typeof CANDIDATE_REASONS)[number];

export interface Candidate {
  recipe: Recipe;
  score_delta: number;
  /** English text for API consumers; the UI translates from `reason_code`. */
  reason: string;
  reason_code: CandidateReason;
  /** `protein` (an enum value) for `twice_in_a_row` and `protein_overload`. */
  reason_params: Record<string, string>;
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

/** A planned meal that uses a shopping item. */
export interface ShoppingMeal {
  day: number;
  slot: MealSlot;
  recipe_id: number;
  recipe_name: string;
}

/** An ingredient of the week, grouped by its case/accent-folded name (`key`). */
export interface ShoppingItem {
  key: string;
  name: string;
  checked: boolean;
  meals: ShoppingMeal[];
}

/** An item added by hand. */
export interface ShoppingExtra {
  id: number;
  name: string;
  checked: boolean;
}

export interface ShoppingList {
  week_start: string;
  items: ShoppingItem[];
  /** In creation order. */
  extras: ShoppingExtra[];
}

export interface ShoppingExtraUpdate {
  name?: string;
  checked?: boolean;
}

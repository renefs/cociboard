// Mirrors the Pydantic schemas in backend/src/cociboard/schemas.py and domain.py.

export interface HealthResponse {
  status: string;
  version: string;
}

export const MEAL_TYPES = ["lunch", "dinner", "both"] as const;
export type MealType = (typeof MEAL_TYPES)[number];

export const MEAL_SLOTS = ["lunch", "dinner"] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];

/** A slot that holds no recipe. */
export const SPECIAL_MEALS = ["eating_out", "leftovers", "free"] as const;
export type SpecialMeal = (typeof SPECIAL_MEALS)[number];

/** Longest note a slot can carry. */
export const NOTE_MAX_LENGTH = 120;

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
  /** Hidden from the catalogue and suggestions, but still shown in the plans that use it. */
  archived: boolean;
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

/** `archived` archives or restores the recipe without touching planned meals. */
export type RecipeUpdate = Partial<RecipeCreate> & { archived?: boolean };

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

/** `detail` of the 409 answered when a recipe name is taken; `archived` if by an archived one. */
export interface DuplicateNameDetail {
  code: "duplicate_name";
  message: string;
  archived: boolean;
}

/** `detail` of the 422 answered when an archived recipe is assigned to a slot. */
export interface RecipeArchivedDetail {
  code: "recipe_archived";
  message: string;
  recipe_id: number;
}

export interface RecipeFilters {
  /** true lists only archived recipes; the default hides them. */
  archived?: boolean | undefined;
  slot?: MealSlot | undefined;
  q?: string | undefined;
  properties?: readonly RecipeProperty[] | undefined;
}

export interface DayPlan {
  /** 0 = Monday ... 6 = Sunday */
  day: number;
  /** ISO date (YYYY-MM-DD) */
  date: string;
  /** A slot holds a recipe or a special meal, never both. */
  lunch: Recipe | null;
  dinner: Recipe | null;
  lunch_special: SpecialMeal | null;
  dinner_special: SpecialMeal | null;
  lunch_note: string | null;
  dinner_note: string | null;
}

export type IssueKind =
  | "repeated_recipe"
  | "consecutive_protein"
  | "protein_overload"
  | "few_vegetarian"
  | "little_fish"
  | "previous_week_protein"
  | "recent_repeat";
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

/** Result of `POST /api/weeks/{week}/copy`. */
export interface WeekCopyResult {
  plan: WeekPlan;
  /** Meals copied into empty slots. */
  copied: number;
  /** Meals left out because their recipe is archived. */
  skipped_archived: number;
  /** Meals in the source week; 0 means there was nothing to copy. */
  source_meals: number;
}

/** One slot of a whole-week restore: exactly one of `recipe_id` and `special` is set. */
export interface SlotFill {
  day: number;
  slot: MealSlot;
  recipe_id: number | null;
  special: SpecialMeal | null;
  note: string | null;
}

/** Body of `PUT /api/weeks/{week}/days/{day}/{slot}`: exactly one of `recipe_id` and `special`. */
export type SlotAssignBody =
  | { recipe_id: number; note: string | null }
  | { special: SpecialMeal; note: string | null };

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
  "planned_recently",
] as const;
export type CandidateReason = (typeof CANDIDATE_REASONS)[number];

export interface Candidate {
  recipe: Recipe;
  score_delta: number;
  /** English text for API consumers; the UI translates from `reason_code`. */
  reason: string;
  reason_code: CandidateReason;
  /**
   * `protein` (an enum value) for `twice_in_a_row` and `protein_overload`; `weeks_ago`
   * (1 or 2) for `planned_recently`.
   */
  reason_params: Record<string, string | number>;
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

/** Backup file written by `GET /api/backup` and read by `POST /api/backup/restore`. */
export const BACKUP_FORMAT = "cociboard-backup";
/** Version written by the server; version 1 files (no special meals or notes) still restore. */
export const BACKUP_FORMAT_VERSION = 2;
export const READABLE_BACKUP_VERSIONS: readonly number[] = [1, 2];

/** Response of `POST /api/backup/restore`. */
export interface RestoreResult {
  recipes: number;
  meals: number;
  shopping_checks: number;
  shopping_extras: number;
}

/** `detail` of the 422 answered when a backup file is rejected; `params` depend on the code. */
export interface BackupErrorDetail {
  code: string;
  message: string;
  params: Record<string, string | number>;
}

/** Response of `GET /api/auth/status`. `exposed`: auth is off and the client has a public IP. */
export interface AuthStatus {
  enabled: boolean;
  authenticated: boolean;
  exposed: boolean;
}

/** Body of `POST /api/auth/login`. */
export interface LoginBody {
  password: string;
}

/** `detail` of the 429 answered when too many logins failed. */
export interface TooManyAttemptsDetail {
  code: "too_many_attempts";
  retry_after: number;
}

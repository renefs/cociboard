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

/** Limits of the richer recipe fields; mirror `domain.py`. */
export const SERVINGS_MIN = 1;
export const SERVINGS_MAX = 50;
export const STEP_MAX_LENGTH = 1000;
export const STEPS_MAX_COUNT = 50;
export const SOURCE_URL_MAX_LENGTH = 500;

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
  /** How many people the recipe feeds (1-50), or null when unknown. */
  servings: number | null;
  /** Method steps in order; empty when the recipe has none. */
  steps: string[];
  /** Link to the original recipe (http or https only), or null. */
  source_url: string | null;
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
  /** 1-50; `null` clears it on update. */
  servings?: number | null;
  /** At most 50 steps of at most 1000 characters; empty ones are dropped by the server. */
  steps?: string[];
  /** http(s) URL of at most 500 characters; `null` clears it on update. */
  source_url?: string | null;
}

/** Warning codes of an imported draft (`warnings` of `POST /api/recipes/import`). */
export type ImportWarning =
  | "name_truncated"
  | "steps_truncated"
  | "ingredients_truncated"
  | "servings_unknown"
  | "time_unknown"
  | "no_ingredients"
  | "no_steps"
  | "name_exists";

/** Response of `POST /api/recipes/import`: fields for the form; nothing is saved. */
export interface RecipeDraft {
  name: string;
  description: string | null;
  servings: number | null;
  prep_minutes: number | null;
  ingredients: string[];
  steps: string[];
  source_url: string | null;
  warnings: ImportWarning[];
}

/** `detail.code` of a failed import (HTTP 422, 502, 504, 413, 415, 429, or 404 when disabled). */
export type ImportErrorCode =
  | "invalid_url"
  | "blocked_address"
  | "fetch_failed"
  | "timeout"
  | "too_large"
  | "not_html"
  | "no_recipe_found"
  | "busy"
  | "import_disabled";

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
  "outside_preferences",
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
  /** Its key matches a pantry item: listed apart instead of "to buy". Extras never are. */
  in_pantry: boolean;
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

/** A pantry staple (global, not per week). `key` is the folded name items are matched on. */
export interface PantryItem {
  id: number;
  key: string;
  name: string;
}

/** An ingredient used by many active recipes, offered as a one-tap staple. */
export interface PantrySuggestion {
  key: string;
  name: string;
  recipe_count: number;
}

/** Response of `GET /api/pantry`: items sorted by key, plus suggestions. */
export interface Pantry {
  items: PantryItem[];
  suggestions: PantrySuggestion[];
}

/** The properties that can be required as a diet; any property can be avoided. */
export const DIETARY_PROPERTIES = ["vegetarian", "vegan", "gluten_free", "dairy_free"] as const satisfies readonly RecipeProperty[];
export type DietaryProperty = (typeof DIETARY_PROPERTIES)[number];

/** Household preferences (`/api/settings/household`); times are 24-hour `HH:MM`. */
export interface HouseholdSettings {
  /** Suggestions only propose recipes tagged with all of these (dietary subset). */
  required_properties: RecipeProperty[];
  /** Suggestions skip recipes carrying any of these. Never overlaps `required_properties`. */
  avoided_properties: RecipeProperty[];
  /** 1-14: more meals with one main protein than this is flagged. */
  max_meals_per_protein: number;
  /** 0-14: fewer vegetable-forward meals than this is flagged; 0 turns the check off. */
  min_vegetarian_meals: number;
  /** 0-14: fewer fish or seafood meals than this is flagged; 0 turns the check off. */
  min_fish_meals: number;
  /** Start of lunch / dinner events in the calendar export. */
  lunch_time: string;
  dinner_time: string;
}

/** Backup file written by `GET /api/backup` and read by `POST /api/backup/restore`. */
export const BACKUP_FORMAT = "cociboard-backup";
/** Version written by the server; versions 1 to 4 still restore (v1 has no special meals or notes, v2 no recipe steps, servings or source link, v3 no pantry, v4 no household settings, which then reset to the defaults). */
export const BACKUP_FORMAT_VERSION = 5;
export const READABLE_BACKUP_VERSIONS: readonly number[] = [1, 2, 3, 4, 5];

/** Response of `POST /api/backup/restore`. */
export interface RestoreResult {
  recipes: number;
  meals: number;
  shopping_checks: number;
  shopping_extras: number;
  pantry: number;
}

/** Why the last automatic copy failed; the UI translates the code. */
export type BackupErrorCode = "disk_full" | "permission_denied" | "unknown";

/** Response of `GET /api/backup/status`: the automatic database copies. */
export interface BackupStatus {
  enabled: boolean;
  interval_hours: number;
  kept: number;
  /** ISO 8601 moment of the newest automatic copy, or null when there is none yet. */
  last_backup_at: string | null;
  copies: number;
  last_error: { at: string; code: BackupErrorCode } | null;
  /** True when copies go to `COCIBOARD_BACKUP_DIR` instead of next to the database. */
  custom_dir: boolean;
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

import type { TFunction } from "i18next";
import { ApiError } from "../../api/client";
import { dayParams } from "../planner/slots";
import { formatShortDate } from "../planner/weekMath";
import type {
  ConflictSlot,
  DuplicateNameDetail,
  MealType,
  MealTypeConflictDetail,
  Protein,
  Recipe,
  RecipeCreate,
  RecipeProperty,
} from "../../api/types";

export const NAME_MAX = 80;

/** Editable state of the recipe form. Numbers and ingredients stay strings while typing. */
export interface RecipeFormValues {
  name: string;
  mealType: MealType;
  protein: Protein;
  prepMinutes: string;
  description: string;
  ingredients: string[];
  properties: RecipeProperty[];
}

export type FormField =
  | "name"
  | "mealType"
  | "protein"
  | "prepMinutes"
  | "description"
  | "ingredients"
  | "properties";

export type FormErrors = Partial<Record<FormField, string>>;

export function emptyValues(): RecipeFormValues {
  return {
    name: "",
    mealType: "both",
    protein: "none",
    prepMinutes: "",
    description: "",
    ingredients: [""],
    properties: [],
  };
}

export function valuesFromRecipe(recipe: Recipe): RecipeFormValues {
  return {
    name: recipe.name,
    mealType: recipe.meal_type,
    protein: recipe.protein,
    prepMinutes: recipe.prep_minutes === null ? "" : String(recipe.prep_minutes),
    description: recipe.description ?? "",
    ingredients: recipe.ingredients.length > 0 ? [...recipe.ingredients] : [""],
    properties: [...recipe.properties],
  };
}

/** The ingredients that will be saved: trimmed, empty rows dropped. */
export function cleanIngredients(rows: readonly string[]): string[] {
  return rows.map((row) => row.trim()).filter((row) => row !== "");
}

/**
 * Split pasted text into ingredient rows: one per line, with list bullets and numbering
 * stripped. Returns null for single-line text so the browser's normal paste applies.
 */
export function splitPastedIngredients(text: string): string[] | null {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•·▪‣]|\d+[.)])\s+/, "").trim())
    .filter((line) => line !== "");
  return lines.length > 1 ? lines : null;
}

/** Mirrors the backend rules (see `RecipeCreate` in schemas.py). */
export function validateValues(values: RecipeFormValues, t: TFunction): FormErrors {
  const errors: FormErrors = {};
  const name = values.name.trim();
  if (name === "") errors.name = t("recipeForm.errors.nameRequired");
  else if (name.length > NAME_MAX) errors.name = t("recipeForm.errors.nameTooLong", { max: NAME_MAX });

  const minutes = values.prepMinutes.trim();
  if (minutes !== "" && !/^\d+$/.test(minutes)) errors.prepMinutes = t("recipeForm.errors.minutesFormat");
  else if (minutes !== "" && Number(minutes) < 1) errors.prepMinutes = t("recipeForm.errors.minutesMin");
  else if (minutes !== "" && Number(minutes) > 100000) errors.prepMinutes = t("recipeForm.errors.minutesMax");

  if (cleanIngredients(values.ingredients).length === 0) {
    errors.ingredients = t("recipeForm.errors.ingredientsRequired");
  }
  return errors;
}

/** Build the API body. Call only with values that passed `validateValues`. */
export function toPayload(values: RecipeFormValues): RecipeCreate {
  const minutes = values.prepMinutes.trim();
  return {
    name: values.name.trim(),
    description: values.description.trim() || null,
    meal_type: values.mealType,
    protein: values.protein,
    prep_minutes: minutes === "" ? null : Number(minutes),
    ingredients: cleanIngredients(values.ingredients),
    properties: values.properties,
  };
}

const FIELD_BY_API_KEY: Record<string, FormField> = {
  name: "name",
  meal_type: "mealType",
  protein: "protein",
  prep_minutes: "prepMinutes",
  description: "description",
  ingredients: "ingredients",
  properties: "properties",
};

/**
 * Map a FastAPI 422 `detail` list to form fields. The server's English `msg` is never shown:
 * each field gets the client's own translated message (the same one `validateValues` would
 * give), or a generic "invalid value" for fields without a specific rule. Errors that belong
 * to no field are returned apart, also translated.
 */
export function mapValidationErrors(
  detail: unknown,
  t: TFunction,
): { fields: FormErrors; other: string[] } {
  const fields: FormErrors = {};
  const other: string[] = [];
  if (!Array.isArray(detail)) return { fields, other };
  for (const item of detail as unknown[]) {
    if (typeof item !== "object" || item === null) continue;
    const { loc, type } = item as { loc?: unknown; type?: unknown };
    const key = Array.isArray(loc) && typeof loc[1] === "string" ? loc[1] : undefined;
    const field = key ? FIELD_BY_API_KEY[key] : undefined;
    if (field) fields[field] ??= fieldMessage(field, typeof type === "string" ? type : "", t);
    else other.push(t("recipeForm.errors.invalidValue"));
  }
  return { fields, other };
}

function fieldMessage(field: FormField, type: string, t: TFunction): string {
  switch (field) {
    case "name":
      return type === "string_too_long"
        ? t("recipeForm.errors.nameTooLong", { max: NAME_MAX })
        : t("recipeForm.errors.nameRequired");
    case "prepMinutes":
      return type === "int_parsing"
        ? t("recipeForm.errors.minutesFormat")
        : t("recipeForm.errors.minutesMin");
    case "ingredients":
      return t("recipeForm.errors.ingredientsRequired");
    default:
      return t("recipeForm.errors.invalidValue");
  }
}

/** The 409 for a taken name; also accepts the plain-text detail of older servers. */
export function isDuplicateNameError(error: unknown): boolean {
  if (!(error instanceof ApiError) || error.status !== 409) return false;
  const detail = error.detail as Partial<DuplicateNameDetail> | string | null | undefined;
  return typeof detail === "string" || (typeof detail === "object" && detail?.code === "duplicate_name");
}

/** Whether the recipe holding the taken name is archived (so it can be restored instead). */
export function isDuplicateOfArchived(error: unknown): boolean {
  if (!isDuplicateNameError(error) || !(error instanceof ApiError)) return false;
  const detail = error.detail as Partial<DuplicateNameDetail> | string;
  return typeof detail === "object" && detail.archived === true;
}

export function asMealTypeConflict(error: unknown): MealTypeConflictDetail | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null;
  const detail = error.detail as Partial<MealTypeConflictDetail> | null | undefined;
  if (
    typeof detail === "object" &&
    detail !== null &&
    detail.code === "meal_type_conflict" &&
    Array.isArray(detail.conflicts)
  ) {
    return detail as MealTypeConflictDetail;
  }
  return null;
}

/** "Tuesday dinner (week of 26 Oct)" for a conflicting slot. */
export function describeConflict(conflict: ConflictSlot, t: TFunction, locale: string): string {
  return t(`recipeForm.conflictSlot.${conflict.slot}`, {
    ...dayParams(conflict.day, locale),
    week: formatShortDate(conflict.week_start, locale),
  });
}

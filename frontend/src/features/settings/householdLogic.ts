// Pure rules for the household preferences form (ADR-0026).
import type { TFunction } from "i18next";
import { ApiError } from "../../api/client";
import type { HouseholdSettings, RecipeProperty } from "../../api/types";

export const DEFAULT_HOUSEHOLD: HouseholdSettings = {
  required_properties: [],
  avoided_properties: [],
  max_meals_per_protein: 4,
  min_vegetarian_meals: 2,
  min_fish_meals: 2,
  lunch_time: "14:00",
  dinner_time: "21:00",
};

/** Allowed range of each variety target (0 turns a minimum off). */
export const TARGET_LIMITS = {
  max_meals_per_protein: { min: 1, max: 14 },
  min_vegetarian_meals: { min: 0, max: 14 },
  min_fish_meals: { min: 0, max: 14 },
} as const;

export type TargetField = keyof typeof TARGET_LIMITS;
export type TimeField = "lunch_time" | "dinner_time";

/** The form's state: numbers stay text while typing so a field can be empty. */
export interface HouseholdDraft {
  required: RecipeProperty[];
  avoided: RecipeProperty[];
  max_meals_per_protein: string;
  min_vegetarian_meals: string;
  min_fish_meals: string;
  lunch_time: string;
  dinner_time: string;
}

export type DraftErrors = Partial<Record<TargetField | TimeField, "range" | "time">>;

export function toDraft(settings: HouseholdSettings): HouseholdDraft {
  return {
    required: [...settings.required_properties],
    avoided: [...settings.avoided_properties],
    max_meals_per_protein: String(settings.max_meals_per_protein),
    min_vegetarian_meals: String(settings.min_vegetarian_meals),
    min_fish_meals: String(settings.min_fish_meals),
    lunch_time: settings.lunch_time,
    dinner_time: settings.dinner_time,
  };
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidTime(value: string): boolean {
  return TIME.test(value);
}

/** The whole number in a field, or `null` when it is empty, fractional or out of range. */
export function parseTarget(field: TargetField, text: string): number | null {
  if (!/^\d{1,2}$/.test(text.trim())) return null;
  const value = Number(text);
  const { min, max } = TARGET_LIMITS[field];
  return value >= min && value <= max ? value : null;
}

export function validateDraft(draft: HouseholdDraft): DraftErrors {
  const errors: DraftErrors = {};
  for (const field of Object.keys(TARGET_LIMITS) as TargetField[]) {
    if (parseTarget(field, draft[field]) === null) errors[field] = "range";
  }
  for (const field of ["lunch_time", "dinner_time"] as const) {
    if (!isValidTime(draft[field])) errors[field] = "time";
  }
  return errors;
}

/** The settings the draft stands for, or `null` while it has errors. */
export function draftToSettings(draft: HouseholdDraft): HouseholdSettings | null {
  const max = parseTarget("max_meals_per_protein", draft.max_meals_per_protein);
  const veg = parseTarget("min_vegetarian_meals", draft.min_vegetarian_meals);
  const fish = parseTarget("min_fish_meals", draft.min_fish_meals);
  if (max === null || veg === null || fish === null) return null;
  if (!isValidTime(draft.lunch_time) || !isValidTime(draft.dinner_time)) return null;
  return {
    required_properties: draft.required,
    avoided_properties: draft.avoided,
    max_meals_per_protein: max,
    min_vegetarian_meals: veg,
    min_fish_meals: fish,
    lunch_time: draft.lunch_time,
    dinner_time: draft.dinner_time,
  };
}

const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((item) => b.includes(item));

/** Whether the draft differs from the saved settings (property order does not matter). */
export function isChanged(draft: HouseholdDraft, saved: HouseholdSettings): boolean {
  const next = draftToSettings(draft);
  if (next === null) return true; // an invalid draft is a change, just not a savable one
  return (
    !sameSet(next.required_properties, saved.required_properties) ||
    !sameSet(next.avoided_properties, saved.avoided_properties) ||
    next.max_meals_per_protein !== saved.max_meals_per_protein ||
    next.min_vegetarian_meals !== saved.min_vegetarian_meals ||
    next.min_fish_meals !== saved.min_fish_meals ||
    next.lunch_time !== saved.lunch_time ||
    next.dinner_time !== saved.dinner_time
  );
}

const toggled = (list: RecipeProperty[], property: RecipeProperty) =>
  list.includes(property) ? list.filter((p) => p !== property) : [...list, property];

/** Require (or stop requiring) a dietary property; requiring one drops it from "avoid". */
export function toggleRequired(draft: HouseholdDraft, property: RecipeProperty): HouseholdDraft {
  const required = toggled(draft.required, property);
  return {
    ...draft,
    required,
    avoided: required.includes(property) ? draft.avoided.filter((p) => p !== property) : draft.avoided,
  };
}

export function toggleAvoided(draft: HouseholdDraft, property: RecipeProperty): HouseholdDraft {
  if (draft.required.includes(property)) return draft; // the same property can't be both
  return { ...draft, avoided: toggled(draft.avoided, property) };
}

/** Step a numeric field, starting from its limit when the text is not a number. */
export function stepTarget(field: TargetField, text: string, delta: 1 | -1): string {
  const { min, max } = TARGET_LIMITS[field];
  const current = /^\d{1,2}$/.test(text.trim()) ? Number(text) : delta > 0 ? min - 1 : max + 1;
  return String(Math.min(max, Math.max(min, current + delta)));
}

/** Whether any preference narrows what Suggest proposes. */
export function hasRecipePreferences(settings: HouseholdSettings | undefined): boolean {
  return !!settings && (settings.required_properties.length > 0 || settings.avoided_properties.length > 0);
}

const SERVER_CODES = ["invalid_time", "not_dietary", "required_and_avoided"] as const;

/** User-facing text for a failed save. */
export function describeSaveError(error: unknown, t: TFunction): string {
  if (error instanceof ApiError && error.status === 422) {
    const detail = error.detail as { code?: unknown } | null | undefined;
    const code = SERVER_CODES.find((known) => known === detail?.code);
    if (code) return t(`household.errors.${code}`);
  }
  return t("household.saveFailed");
}

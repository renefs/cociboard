import type { TFunction } from "i18next";
import type { DayPlan, MealSlot, MealType, Recipe, SlotRef, WeekPlan } from "../../api/types";
import { MEAL_SLOTS } from "../../api/types";
import { dayName } from "./weekMath";

/** Mirror of the backend rule `fits_slot` in `domain.py`. */
export function fitsSlot(mealType: MealType, slot: MealSlot): boolean {
  return mealType === "both" || mealType === slot;
}

export function slotLabel(slot: MealSlot, t: TFunction): string {
  return t(`meta.mealType.${slot}`);
}

/** Interpolation values for sentences that name a day: "Monday" and (for Spanish) "lunes". */
export function dayParams(day: number, locale: string): { day: string; dayLower: string } {
  return { day: dayName(day, locale), dayLower: dayName(day, locale, false) };
}

/** Upper-case the first letter, for sentence-style text that starts with a slot description. */
export function capitalizeFirst(text: string, locale: string): string {
  return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);
}

/** Human description of a slot: "Monday lunch" / "comida del lunes". */
export function describeSlot(ref: SlotRef, t: TFunction, locale: string): string {
  return t(`planner.slotName.${ref.slot}`, dayParams(ref.day, locale));
}

export function sameSlot(a: SlotRef, b: SlotRef): boolean {
  return a.day === b.day && a.slot === b.slot;
}

export function recipeAt(plan: WeekPlan, ref: SlotRef): Recipe | null {
  return plan.days.find((d) => d.day === ref.day)?.[ref.slot] ?? null;
}

/** All 14 slot references of a week in reading order. */
export function allSlots(): SlotRef[] {
  const refs: SlotRef[] = [];
  for (let day = 0; day < 7; day++) for (const slot of MEAL_SLOTS) refs.push({ day, slot });
  return refs;
}

/** Whether `recipe` may be placed in `slot`, plus the user-facing refusal text. */
export function slotHint(recipe: Recipe, slot: MealSlot, t: TFunction): string | null {
  return fitsSlot(recipe.meal_type, slot) ? null : t(`planner.slotHint.${slot}`);
}

/** Case-insensitive search in name and ingredients (same rule as the backend). */
export function matchesQuery(recipe: Recipe, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [recipe.name, ...recipe.ingredients].some((text) => text.toLowerCase().includes(needle));
}

export function filterRecipes(
  recipes: readonly Recipe[],
  options: { slot?: MealSlot | undefined; query?: string | undefined },
): Recipe[] {
  const needle = options.query?.trim().toLowerCase() ?? "";
  return recipes.filter((recipe) => {
    if (options.slot && !fitsSlot(recipe.meal_type, options.slot)) return false;
    return !needle || matchesQuery(recipe, needle);
  });
}

export type { DayPlan };

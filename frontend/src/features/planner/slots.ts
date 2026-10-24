import type { DayPlan, MealSlot, MealType, Recipe, SlotRef, WeekPlan } from "../../api/types";
import { MEAL_SLOTS } from "../../api/types";
import { dayName } from "./weekMath";

/** Mirror of the backend rule `fits_slot` in `domain.py`. */
export function fitsSlot(mealType: MealType, slot: MealSlot): boolean {
  return mealType === "both" || mealType === slot;
}

export function slotLabel(slot: MealSlot): string {
  return slot === "lunch" ? "Lunch" : "Dinner";
}

/** Human description of a slot, e.g. "Monday lunch". */
export function describeSlot(ref: SlotRef): string {
  return `${dayName(ref.day)} ${ref.slot}`;
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
export function slotHint(recipe: Recipe, slot: MealSlot): string | null {
  return fitsSlot(recipe.meal_type, slot) ? null : `Not for ${slot}`;
}

/** Case-insensitive search in name and ingredients (same rule as the backend). */
export function filterRecipes(
  recipes: readonly Recipe[],
  options: { slot?: MealSlot | undefined; query?: string | undefined },
): Recipe[] {
  const needle = options.query?.trim().toLowerCase() ?? "";
  return recipes.filter((recipe) => {
    if (options.slot && !fitsSlot(recipe.meal_type, options.slot)) return false;
    if (!needle) return true;
    return [recipe.name, ...recipe.ingredients].some((text) => text.toLowerCase().includes(needle));
  });
}

export type { DayPlan };

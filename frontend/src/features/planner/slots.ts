import type { TFunction } from "i18next";
import type {
  DayPlan,
  MealSlot,
  MealType,
  Recipe,
  SlotRef,
  SpecialMeal,
  WeekPlan,
} from "../../api/types";
import { MEAL_SLOTS } from "../../api/types";
import { SPECIAL_META } from "./specialMeta";
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

/** What a filled slot holds: a recipe or a special meal, with the slot's note. */
export type SlotMeal =
  | { kind: "recipe"; recipe: Recipe; note: string | null }
  | { kind: "special"; special: SpecialMeal; note: string | null };

/** The meal of `slot` on `day`, or `null` when the slot is empty. */
export function mealOfDay(day: DayPlan, slot: MealSlot): SlotMeal | null {
  const note = day[`${slot}_note`];
  const recipe = day[slot];
  if (recipe) return { kind: "recipe", recipe, note };
  const special = day[`${slot}_special`];
  return special ? { kind: "special", special, note } : null;
}

export function mealAt(plan: WeekPlan, ref: SlotRef): SlotMeal | null {
  const day = plan.days.find((d) => d.day === ref.day);
  return day ? mealOfDay(day, ref.slot) : null;
}

/** The recipe of a meal, or `null` for a special meal. */
export function recipeOf(meal: SlotMeal | null): Recipe | null {
  return meal?.kind === "recipe" ? meal.recipe : null;
}

/** Display name of a meal: the recipe name (data) or the translated special label. */
export function mealName(meal: SlotMeal, t: TFunction): string {
  return meal.kind === "recipe" ? meal.recipe.name : t(SPECIAL_META[meal.special].labelKey);
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

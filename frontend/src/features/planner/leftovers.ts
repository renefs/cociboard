import type { SlotRef, WeekPlan } from "../../api/types";
import { mealAt } from "./slots";

/**
 * The slot after `ref` in the same week: lunch goes to dinner of the same day, dinner to the
 * next day's lunch. Sunday dinner has none (leftovers never cross into the next week).
 */
export function nextSlotInWeek(ref: SlotRef): SlotRef | null {
  if (ref.slot === "lunch") return { day: ref.day, slot: "dinner" };
  return ref.day >= 6 ? null : { day: ref.day + 1, slot: "lunch" };
}

/**
 * Where "Save leftovers for the next meal" would put them: the next slot, offered only when
 * `ref` holds a batch-cooking recipe and that next slot exists and is empty.
 */
export function leftoversTarget(plan: WeekPlan, ref: SlotRef): SlotRef | null {
  const meal = mealAt(plan, ref);
  if (meal?.kind !== "recipe" || !meal.recipe.properties.includes("batch_cooking")) return null;
  const next = nextSlotInWeek(ref);
  return next && mealAt(plan, next) === null ? next : null;
}

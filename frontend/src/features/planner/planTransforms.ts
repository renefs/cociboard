// Pure transforms of a week plan, used for optimistic updates. They mirror the
// backend rules in `planner.py`: invalid operations return the plan unchanged.
import type { DayPlan, Recipe, SlotRef, WeekPlan } from "../../api/types";
import { fitsSlot, recipeAt, sameSlot } from "./slots";

function withSlots(plan: WeekPlan, changes: { ref: SlotRef; recipe: Recipe | null }[]): WeekPlan {
  const days = plan.days.map((day): DayPlan => {
    const mine = changes.filter((change) => change.ref.day === day.day);
    if (mine.length === 0) return day;
    const next = { ...day };
    for (const { ref, recipe } of mine) next[ref.slot] = recipe;
    return next;
  });
  return { ...plan, days };
}

export function assignInPlan(plan: WeekPlan, ref: SlotRef, recipe: Recipe): WeekPlan {
  if (!fitsSlot(recipe.meal_type, ref.slot)) return plan;
  return withSlots(plan, [{ ref, recipe }]);
}

export function clearInPlan(plan: WeekPlan, ref: SlotRef): WeekPlan {
  return withSlots(plan, [{ ref, recipe: null }]);
}

/** Move a recipe, swapping with the occupant of the target. */
export function moveInPlan(plan: WeekPlan, from: SlotRef, to: SlotRef): WeekPlan {
  if (sameSlot(from, to)) return plan;
  const moved = recipeAt(plan, from);
  if (!moved || !fitsSlot(moved.meal_type, to.slot)) return plan;
  const displaced = recipeAt(plan, to);
  if (displaced && !fitsSlot(displaced.meal_type, from.slot)) return plan;
  return withSlots(plan, [
    { ref: to, recipe: moved },
    { ref: from, recipe: displaced },
  ]);
}

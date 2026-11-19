// Pure transforms of a week plan, used for optimistic updates. They mirror the
// backend rules in `planner.py`: invalid operations return the plan unchanged.
import type { DayPlan, Recipe, SlotFill, SlotRef, SpecialMeal, WeekPlan } from "../../api/types";
import { MEAL_SLOTS } from "../../api/types";
import { fitsSlot, mealAt, mealOfDay, sameSlot, type SlotMeal } from "./slots";

function withSlots(plan: WeekPlan, changes: { ref: SlotRef; meal: SlotMeal | null }[]): WeekPlan {
  const days = plan.days.map((day): DayPlan => {
    const mine = changes.filter((change) => change.ref.day === day.day);
    if (mine.length === 0) return day;
    const next = { ...day };
    for (const { ref, meal } of mine) {
      next[ref.slot] = meal?.kind === "recipe" ? meal.recipe : null;
      next[`${ref.slot}_special`] = meal?.kind === "special" ? meal.special : null;
      next[`${ref.slot}_note`] = meal?.note ?? null;
    }
    return next;
  });
  return { ...plan, days };
}

/** Place a recipe. `note` is stored with it (the server keeps exactly the note it is sent). */
export function assignInPlan(
  plan: WeekPlan,
  ref: SlotRef,
  recipe: Recipe,
  note: string | null = null,
): WeekPlan {
  if (!fitsSlot(recipe.meal_type, ref.slot)) return plan;
  return withSlots(plan, [{ ref, meal: { kind: "recipe", recipe, note } }]);
}

/** Place a special meal (eating out, leftovers, free); it fits any slot. */
export function assignSpecialInPlan(
  plan: WeekPlan,
  ref: SlotRef,
  special: SpecialMeal,
  note: string | null = null,
): WeekPlan {
  return withSlots(plan, [{ ref, meal: { kind: "special", special, note } }]);
}

/** Set or clear the note of a filled slot; an empty slot is left alone. */
export function setNoteInPlan(plan: WeekPlan, ref: SlotRef, note: string | null): WeekPlan {
  const meal = mealAt(plan, ref);
  return meal ? withSlots(plan, [{ ref, meal: { ...meal, note } }]) : plan;
}

export function clearInPlan(plan: WeekPlan, ref: SlotRef): WeekPlan {
  return withSlots(plan, [{ ref, meal: null }]);
}

/** Move a meal (recipe or special, with its note), swapping with the occupant of the target. */
export function moveInPlan(plan: WeekPlan, from: SlotRef, to: SlotRef): WeekPlan {
  if (sameSlot(from, to)) return plan;
  const moved = mealAt(plan, from);
  if (!moved || (moved.kind === "recipe" && !fitsSlot(moved.recipe.meal_type, to.slot))) return plan;
  const displaced = mealAt(plan, to);
  if (displaced?.kind === "recipe" && !fitsSlot(displaced.recipe.meal_type, from.slot)) return plan;
  return withSlots(plan, [
    { ref: to, meal: moved },
    { ref: from, meal: displaced },
  ]);
}

/** Number of filled slots, special meals included. */
export function countFilled(plan: WeekPlan): number {
  return plan.days.reduce(
    (total, day) => total + MEAL_SLOTS.filter((slot) => mealOfDay(day, slot)).length,
    0,
  );
}

/** The plan as a list of assignments, the body of a whole-week restore (Undo). */
export function planToFills(plan: WeekPlan): SlotFill[] {
  const fills: SlotFill[] = [];
  for (const day of plan.days) {
    for (const slot of MEAL_SLOTS) {
      const meal = mealOfDay(day, slot);
      if (!meal) continue;
      fills.push({
        day: day.day,
        slot,
        recipe_id: meal.kind === "recipe" ? meal.recipe.id : null,
        special: meal.kind === "special" ? meal.special : null,
        note: meal.note,
      });
    }
  }
  return fills;
}

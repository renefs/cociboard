import type { DayPlan, WeekPlan } from "../../api/types";
import { addDays, toIsoDate, weekStartOf } from "./weekMath";
import { mealOfDay } from "./slots";

/** A calendar day located in the planner's grid: the week it belongs to and its index in it. */
export interface DayRef {
  weekStart: string;
  /** 0 = Monday … 6 = Sunday. */
  day: number;
  /** YYYY-MM-DD. */
  date: string;
}

export function dayRefOf(date: Date): DayRef {
  return { weekStart: weekStartOf(date), day: (date.getDay() + 6) % 7, date: toIsoDate(date) };
}

/** Tomorrow's place in the grid; on a Sunday that is Monday of the next week. */
export function tomorrowOf(now: Date): DayRef {
  return dayRefOf(addDays(now, 1));
}

/** The plan of `ref`'s day, or `null` while the week is not loaded. */
export function dayPlanFor(plan: WeekPlan | undefined, ref: DayRef): DayPlan | null {
  if (!plan || plan.week_start !== ref.weekStart) return null;
  return plan.days.find((d) => d.day === ref.day) ?? null;
}

/** Whether a lunch or a dinner (recipe or special meal) is planned on the day. */
export function hasMeals(day: DayPlan | null): boolean {
  return day !== null && (mealOfDay(day, "lunch") !== null || mealOfDay(day, "dinner") !== null);
}

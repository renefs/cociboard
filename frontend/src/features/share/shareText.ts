// Pure plain-text exports of the week menu and the shopping list, for chats and notes apps.
import type { TFunction } from "i18next";
import type { DayPlan, MealSlot, ShoppingList, WeekPlan } from "../../api/types";
import { MEAL_SLOTS } from "../../api/types";
import { mealName, mealOfDay } from "../planner/slots";
import { dayName, formatShortDate, formatWeekRangeShort } from "../planner/weekMath";
import { shoppingListText } from "../shopping/shoppingLogic";

/** "Weekly menu: 16 Nov – 22 Nov 2026": the heading of the printout and of the shared text. */
export function menuTitle(weekStart: string, t: TFunction, locale: string): string {
  return t("share.menuTitle", { range: formatWeekRangeShort(weekStart, locale) });
}

/** "Monday 16 Nov" */
export function dayHeading(day: DayPlan, locale: string): string {
  return `${dayName(day.day, locale)} ${formatShortDate(day.date, locale)}`;
}

/** One slot line: "Lunch: Lentejas" or "Dinner: Tortilla (no onion)", "—" when empty. */
function slotLine(day: DayPlan, slot: MealSlot, t: TFunction): string {
  const meal = mealOfDay(day, slot);
  if (!meal) return t(`share.line.${slot}`, { meal: t("share.none") });
  const name = mealName(meal, t);
  return meal.note
    ? t(`share.lineNote.${slot}`, { meal: name, note: meal.note })
    : t(`share.line.${slot}`, { meal: name });
}

/** Whether the week has at least one recipe or special meal. */
export function hasMeals(plan: WeekPlan): boolean {
  return plan.days.some((day) => MEAL_SLOTS.some((slot) => mealOfDay(day, slot) !== null));
}

/** The week as text: a title, then each day with its lunch and dinner indented below it. */
export function weekAsText(plan: WeekPlan, t: TFunction, locale: string): string {
  const days = plan.days.map((day) =>
    [dayHeading(day, locale), ...MEAL_SLOTS.map((slot) => `  ${slotLine(day, slot, t)}`)].join("\n"),
  );
  return [menuTitle(plan.week_start, t, locale), "", days.join("\n\n")].join("\n");
}

/**
 * What is still to buy as text, in the order of the screen (generated items, then extras
 * added by hand). Pantry staples are named on a last line; see `shoppingListText`.
 */
export function shoppingAsText(list: ShoppingList, t: TFunction, locale: string): string {
  return shoppingListText(list, t, locale);
}

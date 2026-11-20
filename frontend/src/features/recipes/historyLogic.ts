import type { TFunction } from "i18next";
import type { MealSlot, PlannedMeal, Recipe } from "../../api/types";
import { daysBetween, formatWeekdayDate, parseIsoDate } from "../planner/weekMath";

/** Within this many days the line counts days; up to `WEEKS_UNTIL_DAYS` it counts weeks. */
const DAYS_UNTIL = 14;
const WEEKS_UNTIL_DAYS = 60;
const DAYS_PER_MONTH = 30.44;
const DAYS_PER_YEAR = 365;

export type Elapsed =
  | { unit: "today" | "yesterday" }
  | { unit: "days" | "weeks" | "months" | "years"; count: number };

/** How long ago a past ISO date was, in the coarsest unit that keeps the number small. */
export function elapsedSince(iso: string, now: Date): Elapsed {
  const days = daysBetween(parseIsoDate(iso), now);
  if (days <= 0) return { unit: "today" }; // also a clock a day behind the server's
  if (days === 1) return { unit: "yesterday" };
  if (days < DAYS_UNTIL) return { unit: "days", count: days };
  if (days < WEEKS_UNTIL_DAYS) return { unit: "weeks", count: Math.floor(days / 7) };
  if (days < DAYS_PER_YEAR) return { unit: "months", count: Math.round(days / DAYS_PER_MONTH) };
  return { unit: "years", count: Math.floor(days / DAYS_PER_YEAR) };
}

/** "Last made 3 weeks ago", or "Never planned" when no meal of it is on or before today. */
export function lastMadeText(recipe: Pick<Recipe, "last_planned_on">, now: Date, t: TFunction): string {
  if (recipe.last_planned_on === null) return t("recipes.history.never");
  const elapsed = elapsedSince(recipe.last_planned_on, now);
  switch (elapsed.unit) {
    case "today":
      return t("recipes.history.lastMadeToday");
    case "yesterday":
      return t("recipes.history.lastMadeYesterday");
    case "days":
      return t("recipes.history.lastMadeDays", { count: elapsed.count });
    case "weeks":
      return t("recipes.history.lastMadeWeeks", { count: elapsed.count });
    case "months":
      return t("recipes.history.lastMadeMonths", { count: elapsed.count });
    case "years":
      return t("recipes.history.lastMadeYears", { count: elapsed.count });
  }
}

/** "Thu 26 Nov · Lunch": a date and the slot's name. */
export function whenText(iso: string, slot: MealSlot, t: TFunction, locale: string): string {
  return t("recipes.history.when", {
    date: formatWeekdayDate(iso, locale),
    slot: t(`meta.mealType.${slot}`),
  });
}

/**
 * The meal that comes next, found in the (capped, most recent first) list by the server's
 * `next_planned_on`. On a day with two meals the lunch is the next one. Null when the list
 * doesn't reach that far back.
 */
export function nextMeal(meals: readonly PlannedMeal[], nextDate: string | null): PlannedMeal | null {
  const onThatDay = meals.filter((meal) => meal.date === nextDate);
  return onThatDay[onThatDay.length - 1] ?? null;
}

/**
 * Order for "Not made lately": recipes never made first, then the ones made longest ago.
 * Ties (same last date, or both never) go by name.
 */
export function sortByNotMadeLately(recipes: readonly Recipe[]): Recipe[] {
  return recipes
    .map((recipe, index) => ({ recipe, index }))
    .sort((a, b) => {
      const dateA = a.recipe.last_planned_on;
      const dateB = b.recipe.last_planned_on;
      if (dateA !== dateB) {
        if (dateA === null) return -1;
        if (dateB === null) return 1;
        return dateA < dateB ? -1 : 1; // ISO dates compare as text
      }
      return (
        a.recipe.name.localeCompare(b.recipe.name, undefined, { sensitivity: "base" }) ||
        a.index - b.index
      );
    })
    .map(({ recipe }) => recipe);
}

import { useMemo, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { useLocale } from "../../i18n/useLocale";
import type { DayPlan, MealSlot, Recipe } from "../../api/types";
import { MEAL_SLOTS } from "../../api/types";
import { RecipeDetailsModal } from "../recipes/RecipeDetailsModal";
import { SPECIAL_META } from "./specialMeta";
import { mealName, mealOfDay, slotLabel, type SlotMeal } from "./slots";
import { dayPlanFor, dayRefOf, hasMeals, tomorrowOf } from "./todayLogic";
import { useWeekPlan } from "./useWeekPlan";
import { dayName, formatShortDate } from "./weekMath";
import { Clock } from "lucide-react";
import { PROTEIN_META, proteinDotStyle } from "../recipes/recipeMeta";

interface TodayViewProps {
  /** Current time; the view always reads the real current week, not the one being browsed. */
  now: Date;
  /** "Plan the week" from the empty state. */
  onPlanWeek: () => void;
  onNotify: (kind: "error" | "info", text: string) => void;
}

/** Today's and tomorrow's lunch and dinner as large, readable cards (the phone's first tab). */
export function TodayView({ now, onPlanWeek, onNotify }: TodayViewProps) {
  const { t } = useTranslation();
  const locale = useLocale();
  const today = useMemo(() => dayRefOf(now), [now]);
  const tomorrow = useMemo(() => tomorrowOf(now), [now]);
  const todayQuery = useWeekPlan(today.weekStart);
  // Tomorrow is in next week on a Sunday; otherwise this shares the query above.
  const tomorrowQuery = useWeekPlan(tomorrow.weekStart);
  const [details, setDetails] = useState<Recipe | null>(null);

  const todayPlan = dayPlanFor(todayQuery.data, today);
  const tomorrowPlan = dayPlanFor(tomorrowQuery.data, tomorrow);

  return (
    <section className="today-view" data-view="today" aria-labelledby="today-heading">
      <h2 id="today-heading">{t("today.heading")}</h2>
      <p className="today-date">
        {dayName(today.day, locale)} {formatShortDate(today.date, locale)}
      </p>

      {todayPlan ? (
        hasMeals(todayPlan) ? (
          <DayMeals day={todayPlan} onOpen={setDetails} />
        ) : (
          <div className="state-box">
            <p>{t("today.nothingToday")}</p>
            <button type="button" className="btn btn-primary" onClick={onPlanWeek}>
              {t("today.planWeek")}
            </button>
          </div>
        )
      ) : todayQuery.isError ? (
        <div className="state-box" role="alert">
          <p>{t("today.loadError")}</p>
          <button type="button" className="btn" onClick={() => void todayQuery.refetch()}>
            {t("common.retry")}
          </button>
        </div>
      ) : (
        <p className="today-muted" role="status">
          {t("today.loading")}
        </p>
      )}

      <h2 className="today-tomorrow">
        {t("today.tomorrow")}{" "}
        <span className="today-tomorrow-date">
          {dayName(tomorrow.day, locale)} {formatShortDate(tomorrow.date, locale)}
        </span>
      </h2>
      {tomorrowPlan ? (
        <DayMeals day={tomorrowPlan} onOpen={setDetails} />
      ) : tomorrowQuery.isError ? (
        <div className="state-box" role="alert">
          <p>{t("today.tomorrowLoadError")}</p>
          <button type="button" className="btn" onClick={() => void tomorrowQuery.refetch()}>
            {t("common.retry")}
          </button>
        </div>
      ) : null}

      {details && <RecipeDetailsModal recipe={details} onClose={() => setDetails(null)} onNotify={onNotify} />}
    </section>
  );
}

function DayMeals({ day, onOpen }: { day: DayPlan; onOpen: (recipe: Recipe) => void }) {
  return (
    <div className="meal-cards">
      {MEAL_SLOTS.map((slot) => (
        <MealCard key={slot} slot={slot} meal={mealOfDay(day, slot)} onOpen={onOpen} />
      ))}
    </div>
  );
}

function MealCard({
  slot,
  meal,
  onOpen,
}: {
  slot: MealSlot;
  meal: SlotMeal | null;
  onOpen: (recipe: Recipe) => void;
}) {
  const { t } = useTranslation();
  return (
    <article className={meal ? "meal-card" : "meal-card meal-card--empty"}>
      <h3 className="meal-card-slot">{slotLabel(slot, t)}</h3>
      {meal === null ? (
        <p className="today-muted">{t("today.nothingSlot")}</p>
      ) : meal.kind === "recipe" ? (
        <button
            type="button"
            className="meal-card-title"
            onClick={() => onOpen(meal.recipe)}
          >
            {/* The verb is visually hidden text, not an aria-label, so the accessible
                name keeps everything the button shows (the prep time too). */}
            <Trans
              i18nKey="today.openRecipe"
              values={{ name: meal.recipe.name }}
              components={{ hidden: <span className="visually-hidden" />, name: <span className="meal-card-name" /> }}
            />{" "}
            <span className="meal-card-meta">
              <span className="meal-card-fact">
                <span className="protein-dot" style={proteinDotStyle(PROTEIN_META[meal.recipe.protein])} aria-hidden="true" />{" "}
                <span className="visually-hidden">{t("recipes.mainProtein")}:</span>{" "}
                {t(PROTEIN_META[meal.recipe.protein].shortLabelKey)}
              </span>{" "}
              {meal.recipe.prep_minutes !== null && (
                <>
                  <span className="meal-card-fact">
                    <Clock aria-hidden="true" size={14} className="icon" /> {t("recipes.minutes", { count: meal.recipe.prep_minutes })}
                  </span>{" "}
                </>
              )}
              {meal.recipe.ingredients.length > 0 && (
                <span className="meal-card-fact">
                  {t("recipes.ingredientCount", { count: meal.recipe.ingredients.length })}
                </span>
              )}
            </span>
          </button>
      ) : (
        <p className="meal-card-special">
          <span aria-hidden="true">{SPECIAL_META[meal.special].icon}</span> {mealName(meal, t)}
        </p>
      )}
      {meal?.note && <p className="meal-card-note">{t("today.note", { note: meal.note })}</p>}
    </article>
  );
}

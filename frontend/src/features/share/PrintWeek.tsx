import { useTranslation } from "react-i18next";
import type { WeekPlan } from "../../api/types";
import { MEAL_SLOTS } from "../../api/types";
import { useLocale } from "../../i18n/useLocale";
import { mealName, mealOfDay, slotLabel } from "../planner/slots";
import { dayName, formatShortDate } from "../planner/weekMath";
import { menuTitle } from "./shareText";

/** The week menu as a printable table (days by lunch and dinner). Shown only in print. */
export function PrintWeek({ plan }: { plan: WeekPlan }) {
  const { t } = useTranslation();
  const locale = useLocale();
  return (
    <article className="print-sheet">
      <h1 className="print-title">{menuTitle(plan.week_start, t, locale)}</h1>
      <table className="print-table">
        <thead>
          <tr>
            <th scope="col">{t("share.printDay")}</th>
            {MEAL_SLOTS.map((slot) => (
              <th key={slot} scope="col">
                {slotLabel(slot, t)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {plan.days.map((day) => (
            <tr key={day.day}>
              <th scope="row">
                {dayName(day.day, locale)}
                <span className="print-date">{formatShortDate(day.date, locale)}</span>
              </th>
              {MEAL_SLOTS.map((slot) => {
                const meal = mealOfDay(day, slot);
                return (
                  <td key={slot}>
                    {meal ? (
                      <>
                        <span className="print-meal">{mealName(meal, t)}</span>
                        {meal.note && <span className="print-note">{meal.note}</span>}
                      </>
                    ) : (
                      t("share.none")
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="print-footer">{t("app.title")}</p>
    </article>
  );
}

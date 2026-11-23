import { Moon, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocale } from "../../i18n/useLocale";
import type { MealSlot, Recipe, WeekPlan } from "../../api/types";
import { MEAL_SLOTS } from "../../api/types";
import { slotKey } from "../variety/varietyLogic";
import { Slot } from "./Slot";
import { mealOfDay, slotLabel } from "./slots";
import { dayAbbr, dayName, formatShortDate, isToday } from "./weekMath";

interface WeekGridProps {
  plan: WeekPlan;
  now: Date;
  selecting?: Recipe | null;
  onActivate: (day: number, slot: MealSlot) => void;
  onRemove: (day: number, slot: MealSlot) => void;
  /** Slot key ("day:slot") -> variety warning messages. */
  warnings?: ReadonlyMap<string, readonly string[]>;
  /** Slot keys to highlight (the issue chosen in the variety summary). */
  highlighted?: ReadonlySet<string>;
}

/** Seven days with a lunch and a dinner slot each (14 slots). */
export function WeekGrid({
  plan,
  now,
  selecting = null,
  onActivate,
  onRemove,
  warnings,
  highlighted,
}: WeekGridProps) {
  const { t } = useTranslation();
  const locale = useLocale();
  return (
    <div className="week-grid">
      {/* The row labels of the desktop matrix. Every slot group already has an accessible name
          ("Monday lunch"), so this column is only for the eye. */}
      <div className="week-rows" aria-hidden="true">
        <span />
        {MEAL_SLOTS.map((slot) => (
          <span key={slot} className="week-row-label">
            {slot === "lunch" ? <Sun size={16} /> : <Moon size={16} />}
            <span className="week-row-text">{slotLabel(slot, t)}</span>
          </span>
        ))}
      </div>
      {plan.days.map((day) => {
        const today = isToday(day.date, now);
        return (
          <section
            key={day.day}
            className={today ? "day day--today" : "day"}
            aria-current={today ? "date" : undefined}
            aria-label={`${dayName(day.day, locale)} ${formatShortDate(day.date, locale)}`}
          >
            <h3 className="day-head">
              {/* Wide: the weekday and the date. Phone list: the abbreviation and the day number
                  (the full text stays for assistive technology). */}
              <span className="day-name">{dayName(day.day, locale)}</span>{" "}
              <span className="day-date">{formatShortDate(day.date, locale)}</span>{" "}
              {today && <span className="day-today">{t("planner.today")}</span>}
              <span className="day-abbr" aria-hidden="true">
                {dayAbbr(day.day, locale)}
              </span>
              <span className="day-num" aria-hidden="true">
                {Number(day.date.slice(8))}
              </span>
            </h3>
            {MEAL_SLOTS.map((slot) => (
              <Slot
                key={slot}
                day={day.day}
                slot={slot}
                meal={mealOfDay(day, slot)}
                plan={plan}
                selecting={selecting}
                onActivate={onActivate}
                onRemove={onRemove}
                warnings={warnings?.get(slotKey({ day: day.day, slot }))}
                highlighted={highlighted?.has(slotKey({ day: day.day, slot })) ?? false}
              />
            ))}
          </section>
        );
      })}
    </div>
  );
}

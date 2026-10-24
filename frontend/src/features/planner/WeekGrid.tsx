import { useTranslation } from "react-i18next";
import { useLocale } from "../../i18n/useLocale";
import type { MealSlot, Recipe, WeekPlan } from "../../api/types";
import { MEAL_SLOTS } from "../../api/types";
import { slotKey } from "../variety/varietyLogic";
import { Slot } from "./Slot";
import { dayName, formatShortDate, isToday } from "./weekMath";

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
              <span className="day-name">{dayName(day.day, locale)}</span>{" "}
              <span className="day-date">{formatShortDate(day.date, locale)}</span>{" "}
              {today && <span className="day-today">{t("planner.today")}</span>}
            </h3>
            {MEAL_SLOTS.map((slot) => (
              <Slot
                key={slot}
                day={day.day}
                slot={slot}
                recipe={day[slot]}
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

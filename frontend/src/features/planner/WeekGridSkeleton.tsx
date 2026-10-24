import { MEAL_SLOTS } from "../../api/types";

/** Placeholder grid shown while the week loads. Same shape as the real grid. */
export function WeekGridSkeleton() {
  return (
    <div className="week-grid" aria-busy="true" data-testid="week-skeleton">
      <p className="visually-hidden" role="status">
        Loading the week…
      </p>
      {Array.from({ length: 7 }, (_, day) => (
        <div key={day} className="day skeleton-day" aria-hidden="true">
          <span className="skeleton-line skeleton-line--title" />
          {MEAL_SLOTS.map((slot) => (
            <span key={slot} className="skeleton-slot" />
          ))}
        </div>
      ))}
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import { searchForWeek, shiftWeek, weekFromSearch, weekStartOf } from "./weekMath";

export interface WeekNavigation {
  weekStart: string;
  isCurrentWeek: boolean;
  goTo: (weekStart: string) => void;
  previous: () => void;
  next: () => void;
  today: () => void;
}

/**
 * The shown week, kept in sync with `?week=YYYY-MM-DD` through the plain history API.
 * Navigation pushes history entries (Back and Forward work); a missing, invalid or
 * non-Monday parameter is normalised in place. The current week has no parameter.
 */
export function useWeekNavigation(now: Date): WeekNavigation {
  const currentWeek = weekStartOf(now);
  const [weekStart, setWeekStart] = useState(() => weekFromSearch(window.location.search, now));

  // Rewrite the address bar to its canonical form on load.
  useEffect(() => {
    const canonical = searchForWeek(window.location.search, weekStart, now);
    if (canonical !== window.location.search) {
      window.history.replaceState(null, "", `${window.location.pathname}${canonical}${window.location.hash}`);
    }
    // Only on mount: later changes go through goTo or popstate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onPop = () => setWeekStart(weekFromSearch(window.location.search, now));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [now]);

  const goTo = useCallback(
    (target: string) => {
      if (target === weekStart) return;
      const search = searchForWeek(window.location.search, target, now);
      window.history.pushState(null, "", `${window.location.pathname}${search}${window.location.hash}`);
      setWeekStart(target);
    },
    [weekStart, now],
  );

  return {
    weekStart,
    isCurrentWeek: weekStart === currentWeek,
    goTo,
    previous: () => goTo(shiftWeek(weekStart, -1)),
    next: () => goTo(shiftWeek(weekStart, 1)),
    today: () => goTo(currentWeek),
  };
}

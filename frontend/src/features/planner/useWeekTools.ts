import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { clearWeek, replaceWeek, suggestWeek } from "../../api/client";
import type { WeekPlan } from "../../api/types";
import { countFilled, planToFills } from "./planTransforms";
import type { ToastAction } from "./Toast";
import { weekKey } from "./useWeekPlan";

export interface WeekTools {
  busy: boolean;
  suggest: () => Promise<void>;
  clear: () => Promise<void>;
}

type Notify = (kind: "info" | "error", text: string, action?: ToastAction) => void;

/**
 * Week-level actions: "Suggest" fills empty slots, "Clear week" empties the week. Both keep
 * the previous plan and offer an Undo that restores it atomically on the server.
 */
export function useWeekTools(weekStart: string, notify: Notify): WeekTools {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  const restore = useCallback(
    async (previous: WeekPlan) => {
      try {
        const restored = await replaceWeek(previous.week_start, planToFills(previous));
        queryClient.setQueryData(weekKey(previous.week_start), restored);
        notify("info", t("planner.restored"));
      } catch {
        void queryClient.invalidateQueries({ queryKey: weekKey(previous.week_start) });
        notify("error", t("planner.undoFailed"));
      }
    },
    [queryClient, notify, t],
  );

  const run = useCallback(
    async (action: (key: string) => Promise<WeekPlan>, message: (before: WeekPlan, after: WeekPlan) => string | null) => {
      const key = weekKey(weekStart);
      const previous = queryClient.getQueryData<WeekPlan>(key);
      if (!previous || busy) return;
      setBusy(true);
      try {
        await queryClient.cancelQueries({ queryKey: key });
        const next = await action(weekStart);
        queryClient.setQueryData(key, next);
        const text = message(previous, next);
        if (text === null) notify("info", t("planner.noEmptySlots"));
        else notify("info", text, { label: t("planner.undo"), onClick: () => void restore(previous) });
      } catch {
        void queryClient.invalidateQueries({ queryKey: key });
        notify("error", t("planner.updateFailed"));
      } finally {
        setBusy(false);
      }
    },
    [weekStart, queryClient, busy, notify, restore, t],
  );

  return {
    busy,
    suggest: () =>
      run(
        (week) => suggestWeek(week),
        (before, after) => {
          const added = countFilled(after) - countFilled(before);
          return added > 0 ? t("planner.filledSlots", { count: added }) : null;
        },
      ),
    clear: () =>
      run(
        (week) => clearWeek(week),
        (before) => t("planner.clearedMeals", { count: countFilled(before) }),
      ),
  };
}

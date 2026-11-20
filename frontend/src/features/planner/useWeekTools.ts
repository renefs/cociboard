import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { clearWeek, copyWeek, replaceWeek, suggestWeek } from "../../api/client";
import type { WeekCopyResult, WeekPlan } from "../../api/types";
import { hasRecipePreferences } from "../settings/householdLogic";
import { householdKey } from "../settings/useHouseholdSettings";
import type { HouseholdSettings } from "../../api/types";
import { countFilled, planToFills } from "./planTransforms";
import type { ToastAction } from "./Toast";
import { invalidateFollowingWeeks, readWeek, weekKey } from "./useWeekPlan";
import { shiftWeek } from "./weekMath";

const SLOTS_PER_WEEK = 14;

export interface WeekTools {
  busy: boolean;
  suggest: () => Promise<void>;
  clear: () => Promise<void>;
  /** Fill the empty slots with last week's meals. */
  copyPrevious: () => Promise<void>;
}

type Notify = (kind: "info" | "error", text: string, action?: ToastAction) => void;

/** What to tell the user: `undo` is false when the plan did not change. */
interface Outcome {
  text: string;
  undo: boolean;
}

/**
 * Week-level actions: "Suggest" and "Copy last week" fill empty slots, "Clear week" empties
 * the week. All of them keep the previous plan and offer an Undo that restores it
 * atomically on the server.
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
        void queryClient.invalidateQueries({ queryKey: ["shopping", previous.week_start] });
        invalidateFollowingWeeks(queryClient, previous.week_start);
        notify("info", t("planner.restored"));
      } catch {
        void queryClient.invalidateQueries({ queryKey: weekKey(previous.week_start) });
        invalidateFollowingWeeks(queryClient, previous.week_start);
        notify("error", t("planner.undoFailed"));
      }
    },
    [queryClient, notify, t],
  );

  const run = useCallback(
    async (action: (week: string) => Promise<WeekPlan>, outcome: (before: WeekPlan, after: WeekPlan) => Outcome) => {
      const key = weekKey(weekStart);
      // What the user sees, waiting changes included (that is what Undo restores).
      const previous = readWeek(queryClient, weekStart);
      if (!previous || busy) return;
      setBusy(true);
      try {
        await queryClient.cancelQueries({ queryKey: key });
        const next = await action(weekStart);
        queryClient.setQueryData(key, next);
        void queryClient.invalidateQueries({ queryKey: ["shopping", weekStart] });
        invalidateFollowingWeeks(queryClient, weekStart);
        const { text, undo } = outcome(previous, next);
        if (undo) notify("info", text, { label: t("planner.undo"), onClick: () => void restore(previous) });
        else notify("info", text);
      } catch {
        void queryClient.invalidateQueries({ queryKey: key });
        invalidateFollowingWeeks(queryClient, weekStart);
        notify("error", t("planner.updateFailed"));
      } finally {
        setBusy(false);
      }
    },
    [weekStart, queryClient, busy, notify, restore, t],
  );

  /** Toast for a copy: how many meals came over, plus a note about archived ones. */
  const copyOutcome = (result: WeekCopyResult): Outcome => {
    const { copied, skipped_archived: skipped, source_meals: sourceMeals } = result;
    if (copied > 0) {
      const note = skipped > 0 ? ` ${t("planner.copySkippedArchived", { count: skipped })}` : "";
      return { text: `${t("planner.copiedMeals", { count: copied })}${note}`, undo: true };
    }
    if (sourceMeals === 0) return { text: t("planner.copyNoSource"), undo: false };
    if (skipped > 0) return { text: t("planner.copyOnlyArchived", { count: skipped }), undo: false };
    return { text: t("planner.copyNoEmptySlots"), undo: false };
  };

  return {
    busy,
    suggest: () =>
      run(
        (week) => suggestWeek(week),
        (before, after) => {
          const added = countFilled(after) - countFilled(before);
          // With preferences set, empty slots that remain are likely due to them.
          const household = queryClient.getQueryData<HouseholdSettings>(householdKey);
          const leftEmpty = countFilled(after) < SLOTS_PER_WEEK && hasRecipePreferences(household);
          const note = leftEmpty ? `. ${t("planner.slotsLeftEmptyByPreferences")}` : "";
          if (added > 0) return { text: `${t("planner.filledSlots", { count: added })}${note}`, undo: true };
          return { text: leftEmpty ? t("planner.slotsLeftEmptyByPreferences") : t("planner.noEmptySlots"), undo: false };
        },
      ),
    clear: () =>
      run(
        (week) => clearWeek(week),
        (before) => ({ text: t("planner.clearedMeals", { count: countFilled(before) }), undo: true }),
      ),
    copyPrevious: () => {
      let result: WeekCopyResult | undefined;
      return run(
        async (week) => {
          result = await copyWeek(week, shiftWeek(week, -1));
          return result.plan;
        },
        () => (result ? copyOutcome(result) : { text: t("planner.updateFailed"), undo: false }),
      );
    },
  };
}

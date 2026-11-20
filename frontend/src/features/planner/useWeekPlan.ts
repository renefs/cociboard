import { useMutation, useQuery, useQueryClient, type MutationOptions, type QueryClient } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { assignSlot, clearSlot, getWeek, moveSlot, setSlotNote } from "../../api/client";
import type { Recipe, SlotRef, SpecialMeal, WeekPlan } from "../../api/types";
import i18n from "../../i18n";
import { retryAfterSignIn } from "../../offline/authRetry";
import { PLAN_CHANGE_KEY } from "../../offline/keys";
import { pushNotice } from "../../offline/notices";
import { pendingVariables, usePendingVariables } from "../../offline/pending";
import { applyPlanChanges, type PlanChange, type PlanMutationVariables } from "./planChanges";
import { describePlanError } from "./planErrors";
import { mealAt } from "./slots";
import { shiftWeek } from "./weekMath";

export const weekKey = (weekStart: string) => ["week", weekStart] as const;

/** The week as the user sees it: the server's plan with the waiting changes laid over it. */
export function useWeekPlan(weekStart: string) {
  const waiting = usePendingVariables<PlanMutationVariables>([PLAN_CHANGE_KEY, weekStart]);
  const select = useCallback((plan: WeekPlan) => applyPlanChanges(plan, waiting), [waiting]);
  return useQuery({
    queryKey: weekKey(weekStart),
    queryFn: ({ signal }) => getWeek(weekStart, signal),
    select,
  });
}

/** How many following weeks' variety reads this week (the backend looks two weeks back). */
export const VARIETY_LOOKAHEAD_WEEKS = 2;

/**
 * A week's variety depends on the two weeks before it, so once a change to `weekStart` has
 * settled the next two weeks are stale. A week with its own changes in flight is skipped:
 * its settle step refetches it.
 */
export function invalidateFollowingWeeks(queryClient: QueryClient, weekStart: string): void {
  for (let offset = 1; offset <= VARIETY_LOOKAHEAD_WEEKS; offset++) {
    const following = shiftWeek(weekStart, offset);
    if (queryClient.isMutating({ mutationKey: [PLAN_CHANGE_KEY, following] }) > 0) continue;
    void queryClient.invalidateQueries({ queryKey: weekKey(following) });
  }
}

const PREFETCH_STALE_MS = 30_000;

/** Warm the cache for the previous and next week so navigating feels instant. */
export function usePrefetchNeighbours(weekStart: string): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    for (const offset of [-1, 1]) {
      const neighbour = shiftWeek(weekStart, offset);
      void queryClient.prefetchQuery({
        queryKey: weekKey(neighbour),
        queryFn: ({ signal }) => getWeek(neighbour, signal),
        staleTime: PREFETCH_STALE_MS,
      });
    }
  }, [weekStart, queryClient]);
}

function send(weekStart: string, change: PlanChange): Promise<WeekPlan> {
  switch (change.type) {
    case "assign":
      return assignSlot(weekStart, change.to.day, change.to.slot, {
        recipe_id: change.recipe.id,
        note: change.note,
      });
    case "special":
      return assignSlot(weekStart, change.to.day, change.to.slot, {
        special: change.special,
        note: change.note,
      });
    case "note":
      return setSlotNote(weekStart, change.at.day, change.at.slot, change.note);
    case "clear":
      return clearSlot(weekStart, change.from.day, change.from.slot);
    case "move":
      return moveSlot(weekStart, {
        from_day: change.from.day,
        from_slot: change.from.slot,
        to_day: change.to.day,
        to_slot: change.to.slot,
      });
  }
}

/** Plan requests of one week are sent one at a time, in call order, also after a restore. */
export const planScope = (weekStart: string) => ({ id: `week-${weekStart}` });

/**
 * What a plan change does, whether it was made in this page or restored from the device
 * (registered as mutation defaults, see `registerMutationDefaults`). The variables hold
 * everything the request needs. A success stores the server's plan as the base the waiting
 * changes are overlaid on; the plan and what derives from it are refetched once the last
 * change of the week settles.
 */
export function planMutationDefaults(
  queryClient: QueryClient,
): MutationOptions<WeekPlan, unknown, PlanMutationVariables> {
  return {
    mutationFn: ({ weekStart, change }) => retryAfterSignIn(() => send(weekStart, change)),
    onSuccess: (plan, { weekStart }) => {
      queryClient.setQueryData<WeekPlan>(weekKey(weekStart), plan);
    },
    onError: (error) => pushNotice(describePlanError(error, i18n.t)),
    onSettled: (_plan, _error, { weekStart }) => {
      if (queryClient.isMutating({ mutationKey: [PLAN_CHANGE_KEY, weekStart] }) <= 1) {
        void queryClient.invalidateQueries({ queryKey: weekKey(weekStart) });
        invalidateFollowingWeeks(queryClient, weekStart);
        // The shopping list is derived from the plan.
        void queryClient.invalidateQueries({ queryKey: ["shopping", weekStart] });
        // Recipe history (last planned, times planned, the details list) is derived from the plan.
        void queryClient.invalidateQueries({ queryKey: ["recipes"] });
        void queryClient.invalidateQueries({ queryKey: ["recipe-history"] });
      }
    },
  };
}

/** The plan as the user sees it: the server's plan plus the changes still waiting. */
export function readWeek(queryClient: QueryClient, weekStart: string): WeekPlan | undefined {
  const plan = queryClient.getQueryData<WeekPlan>(weekKey(weekStart));
  if (!plan) return undefined;
  return applyPlanChanges(plan, pendingVariables<PlanMutationVariables>(queryClient, [PLAN_CHANGE_KEY, weekStart]));
}

export interface PlanActions {
  /** Place a recipe. A note already on the slot is kept (the API stores the note it is sent). */
  assign: (to: SlotRef, recipe: Recipe) => void;
  /**
   * Set the slot to eating out, leftovers or free, in one request. The note already on the
   * slot is kept unless `note` is given (`null` clears it).
   */
  assignSpecial: (to: SlotRef, special: SpecialMeal, note?: string | null) => void;
  /** Set (or clear with `null`) the note of a filled slot. */
  setNote: (at: SlotRef, note: string | null) => void;
  clear: (from: SlotRef) => void;
  move: (from: SlotRef, to: SlotRef) => void;
}

/**
 * Plan mutations. A change shows at once because `useWeekPlan` overlays the waiting changes
 * on the server's plan; it is sent in order (one request at a time per week, `planScope`),
 * waits for the connection and survives closing the app. A failure drops the overlay, so the
 * plan falls back by itself, and `onError` receives a user-facing message.
 */
export function usePlanActions(weekStart: string, onError: (message: string) => void): PlanActions {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { mutate } = useMutation<WeekPlan, unknown, PlanMutationVariables>({
    mutationKey: [PLAN_CHANGE_KEY, weekStart],
    scope: planScope(weekStart),
    onError: (error) => onError(describePlanError(error, t)),
  });

  const noteAt = (ref: SlotRef): string | null => {
    const plan = readWeek(queryClient, weekStart);
    return (plan && mealAt(plan, ref)?.note) ?? null;
  };
  const submit = (change: PlanChange) => mutate({ weekStart, change });
  return {
    assign: (to, recipe) => submit({ type: "assign", to, recipe, note: noteAt(to) }),
    assignSpecial: (to, special, note) =>
      submit({ type: "special", to, special, note: note === undefined ? noteAt(to) : note }),
    setNote: (at, note) => submit({ type: "note", at, note }),
    clear: (from) => submit({ type: "clear", from }),
    move: (from, to) => submit({ type: "move", from, to }),
  };
}

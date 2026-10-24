import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { assignSlot, clearSlot, getWeek, moveSlot } from "../../api/client";
import type { Recipe, SlotRef, WeekPlan } from "../../api/types";
import { describePlanError } from "./planErrors";
import { assignInPlan, clearInPlan, moveInPlan } from "./planTransforms";

export const weekKey = (weekStart: string) => ["week", weekStart] as const;

export function useWeekPlan(weekStart: string) {
  return useQuery({
    queryKey: weekKey(weekStart),
    queryFn: ({ signal }) => getWeek(weekStart, signal),
  });
}

type Change =
  | { type: "assign"; to: SlotRef; recipe: Recipe }
  | { type: "clear"; from: SlotRef }
  | { type: "move"; from: SlotRef; to: SlotRef };

function applyChange(plan: WeekPlan, change: Change): WeekPlan {
  switch (change.type) {
    case "assign":
      return assignInPlan(plan, change.to, change.recipe);
    case "clear":
      return clearInPlan(plan, change.from);
    case "move":
      return moveInPlan(plan, change.from, change.to);
  }
}

function send(weekStart: string, change: Change): Promise<WeekPlan> {
  switch (change.type) {
    case "assign":
      return assignSlot(weekStart, change.to.day, change.to.slot, change.recipe.id);
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

export interface PlanActions {
  assign: (to: SlotRef, recipe: Recipe) => void;
  clear: (from: SlotRef) => void;
  move: (from: SlotRef, to: SlotRef) => void;
}

/**
 * Plan mutations with optimistic updates. The cache is updated immediately; on failure
 * it is rolled back to the snapshot taken before the change and `onError` receives a
 * user-facing message. The plan is refetched once the last in-flight change settles, so
 * overlapping responses never overwrite a newer optimistic state.
 */
export function usePlanActions(weekStart: string, onError: (message: string) => void): PlanActions {
  const queryClient = useQueryClient();
  const key = weekKey(weekStart);
  const mutationKey = ["week-change", weekStart];

  const mutation = useMutation<WeekPlan, unknown, Change, { previous: WeekPlan | undefined }>({
    mutationKey,
    mutationFn: (change) => send(weekStart, change),
    onMutate: async (change) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<WeekPlan>(key);
      if (previous) queryClient.setQueryData<WeekPlan>(key, applyChange(previous, change));
      return { previous };
    },
    onError: (error, _change, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      onError(describePlanError(error));
    },
    onSettled: () => {
      if (queryClient.isMutating({ mutationKey }) <= 1) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    },
  });

  const { mutate } = mutation;
  return {
    assign: (to, recipe) => mutate({ type: "assign", to, recipe }),
    clear: (from) => mutate({ type: "clear", from }),
    move: (from, to) => mutate({ type: "move", from, to }),
  };
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { assignSlot, clearSlot, getWeek, moveSlot } from "../../api/client";
import type { Recipe, SlotRef, WeekPlan } from "../../api/types";
import { describePlanError } from "./planErrors";
import { assignInPlan, clearInPlan, moveInPlan } from "./planTransforms";
import { shiftWeek } from "./weekMath";

export const weekKey = (weekStart: string) => ["week", weekStart] as const;

export function useWeekPlan(weekStart: string) {
  return useQuery({
    queryKey: weekKey(weekStart),
    queryFn: ({ signal }) => getWeek(weekStart, signal),
  });
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

/**
 * Tail of the request chain per week. Every plan request waits for the previous one of the
 * same week to settle (success or failure) so the server sees them in call order.
 */
const requestChains = new Map<string, Promise<unknown>>();

function sendInOrder(weekStart: string, change: Change): Promise<WeekPlan> {
  const previous = requestChains.get(weekStart) ?? Promise.resolve();
  const request = previous.then(() => send(weekStart, change));
  const tail = request.then(
    () => undefined,
    () => undefined,
  );
  requestChains.set(weekStart, tail);
  void tail.then(() => {
    if (requestChains.get(weekStart) === tail) requestChains.delete(weekStart);
  });
  return request;
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
 * overlapping responses never overwrite a newer optimistic state. Requests of one week are
 * sent one at a time in call order (see `sendInOrder`) while the cache updates immediately.
 */
export function usePlanActions(weekStart: string, onError: (message: string) => void): PlanActions {
  const queryClient = useQueryClient();
  const key = weekKey(weekStart);
  const mutationKey = ["week-change", weekStart];

  const mutation = useMutation<WeekPlan, unknown, Change, { previous: WeekPlan | undefined }>({
    mutationKey,
    mutationFn: (change) => sendInOrder(weekStart, change),
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

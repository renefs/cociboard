import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { assignSlot, clearSlot, getWeek, moveSlot, setSlotNote } from "../../api/client";
import type { Recipe, SlotRef, SpecialMeal, WeekPlan } from "../../api/types";
import { describePlanError } from "./planErrors";
import {
  assignInPlan,
  assignSpecialInPlan,
  clearInPlan,
  moveInPlan,
  setNoteInPlan,
} from "./planTransforms";
import { mealAt } from "./slots";
import { shiftWeek } from "./weekMath";

export const weekKey = (weekStart: string) => ["week", weekStart] as const;

export function useWeekPlan(weekStart: string) {
  return useQuery({
    queryKey: weekKey(weekStart),
    queryFn: ({ signal }) => getWeek(weekStart, signal),
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
    if (queryClient.isMutating({ mutationKey: ["week-change", following] }) > 0) continue;
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

type Change =
  | { type: "assign"; to: SlotRef; recipe: Recipe; note: string | null }
  | { type: "special"; to: SlotRef; special: SpecialMeal; note: string | null }
  | { type: "note"; at: SlotRef; note: string | null }
  | { type: "clear"; from: SlotRef }
  | { type: "move"; from: SlotRef; to: SlotRef };

function applyChange(plan: WeekPlan, change: Change): WeekPlan {
  switch (change.type) {
    case "assign":
      return assignInPlan(plan, change.to, change.recipe, change.note);
    case "special":
      return assignSpecialInPlan(plan, change.to, change.special, change.note);
    case "note":
      return setNoteInPlan(plan, change.at, change.note);
    case "clear":
      return clearInPlan(plan, change.from);
    case "move":
      return moveInPlan(plan, change.from, change.to);
  }
}

function send(weekStart: string, change: Change): Promise<WeekPlan> {
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
 * Plan mutations with optimistic updates. The cache is updated immediately; on failure
 * it is rolled back to the snapshot taken before the change and `onError` receives a
 * user-facing message. The plan is refetched once the last in-flight change settles, so
 * overlapping responses never overwrite a newer optimistic state. Requests of one week are
 * sent one at a time in call order (see `sendInOrder`) while the cache updates immediately.
 */
export function usePlanActions(weekStart: string, onError: (message: string) => void): PlanActions {
  const { t } = useTranslation();
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
      onError(describePlanError(error, t));
    },
    onSettled: () => {
      if (queryClient.isMutating({ mutationKey }) <= 1) {
        void queryClient.invalidateQueries({ queryKey: key });
        invalidateFollowingWeeks(queryClient, weekStart);
        // The shopping list is derived from the plan.
        void queryClient.invalidateQueries({ queryKey: ["shopping", weekStart] });
        // Recipe history (last planned, times planned, the details list) is derived from the plan.
        void queryClient.invalidateQueries({ queryKey: ["recipes"] });
        void queryClient.invalidateQueries({ queryKey: ["recipe-history"] });
      }
    },
  });

  const { mutate } = mutation;
  const noteAt = (ref: SlotRef): string | null => {
    const plan = queryClient.getQueryData<WeekPlan>(key);
    return (plan && mealAt(plan, ref)?.note) ?? null;
  };
  return {
    assign: (to, recipe) => mutate({ type: "assign", to, recipe, note: noteAt(to) }),
    assignSpecial: (to, special, note) =>
      mutate({ type: "special", to, special, note: note === undefined ? noteAt(to) : note }),
    setNote: (at, note) => mutate({ type: "note", at, note }),
    clear: (from) => mutate({ type: "clear", from }),
    move: (from, to) => mutate({ type: "move", from, to }),
  };
}

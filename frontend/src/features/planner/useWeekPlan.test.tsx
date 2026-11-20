import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "../../api/client";
import { ApiError } from "../../api/client";
import type { WeekPlan } from "../../api/types";
import { makePlan, makeRecipe } from "../../test/fixtures";
import i18n from "../../i18n";
import { describePlanError } from "./planErrors";
import { recipeAt } from "./slots";
import { usePlanActions, weekKey } from "./useWeekPlan";

const WEEK = "2026-10-26";
const soup = makeRecipe({ id: 1, name: "Soup", meal_type: "both" });
const stew = makeRecipe({ id: 2, name: "Stew", meal_type: "both" });

interface Deferred {
  resolve: (plan: WeekPlan) => void;
  reject: (error: unknown) => void;
  promise: Promise<WeekPlan>;
}

function deferred(): Deferred {
  let resolve!: Deferred["resolve"];
  let reject!: Deferred["reject"];
  const promise = new Promise<WeekPlan>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { resolve, reject, promise };
}

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(weekKey(WEEK), makePlan());
  const onError = vi.fn();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => usePlanActions(WEEK, onError), { wrapper });
  return { queryClient, onError, actions: result };
}

const slotA = { day: 0, slot: "lunch" } as const;

describe("usePlanActions request ordering", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(client, "getWeek").mockResolvedValue(makePlan());
  });

  it("sends changes in call order, the second only after the first resolves", async () => {
    const first = deferred();
    const second = deferred();
    const assign = vi
      .spyOn(client, "assignSlot")
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { queryClient, actions } = setup();

    act(() => {
      actions.current.assign(slotA, soup);
      actions.current.assign(slotA, stew);
    });

    // The optimistic update of the second change is visible immediately.
    await waitFor(() =>
      expect(recipeAt(queryClient.getQueryData<WeekPlan>(weekKey(WEEK))!, slotA)?.name).toBe("Stew"),
    );
    await waitFor(() => expect(assign).toHaveBeenCalledTimes(1));
    expect(assign).toHaveBeenLastCalledWith(WEEK, 0, "lunch", { recipe_id: 1, note: null });

    // Give the second request every chance to start early.
    await new Promise((r) => setTimeout(r, 20));
    expect(assign).toHaveBeenCalledTimes(1);

    await act(async () => first.resolve(makePlan()));
    await waitFor(() => expect(assign).toHaveBeenCalledTimes(2));
    expect(assign).toHaveBeenLastCalledWith(WEEK, 0, "lunch", { recipe_id: 2, note: null });
    await act(async () => second.resolve(makePlan()));
  });

  it("does not block the second request when the first fails", async () => {
    const first = deferred();
    const assign = vi
      .spyOn(client, "assignSlot")
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(makePlan());
    const { onError, actions } = setup();

    act(() => {
      actions.current.assign(slotA, soup);
      actions.current.assign(slotA, stew);
    });
    await waitFor(() => expect(assign).toHaveBeenCalledTimes(1));

    await act(async () => first.reject(new ApiError(500, "boom")));
    await waitFor(() => expect(assign).toHaveBeenCalledTimes(2));
    expect(assign).toHaveBeenLastCalledWith(WEEK, 0, "lunch", { recipe_id: 2, note: null });
    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
  });
});

describe("usePlanActions following weeks", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(client, "getWeek").mockResolvedValue(makePlan());
  });

  it("marks the next two weeks stale once a change settles, and no others", async () => {
    vi.spyOn(client, "assignSlot").mockResolvedValue(makePlan());
    const { queryClient, actions } = setup();
    const keys = ["2026-11-02", "2026-11-09", "2026-11-16", "2026-10-19"].map(weekKey);
    for (const key of keys) queryClient.setQueryData(key, makePlan());

    act(() => actions.current.assign(slotA, soup));
    await waitFor(() => expect(queryClient.getQueryState(keys[0]!)?.isInvalidated).toBe(true));
    expect(queryClient.getQueryState(keys[1]!)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(keys[2]!)?.isInvalidated).toBe(false);
    expect(queryClient.getQueryState(keys[3]!)?.isInvalidated).toBe(false);
  });

  it("also does it when the change fails", async () => {
    vi.spyOn(client, "assignSlot").mockRejectedValue(new ApiError(500, "boom"));
    const { queryClient, actions } = setup();
    queryClient.setQueryData(weekKey("2026-11-02"), makePlan());
    act(() => actions.current.assign(slotA, soup));
    await waitFor(() =>
      expect(queryClient.getQueryState(weekKey("2026-11-02"))?.isInvalidated).toBe(true),
    );
  });
});

describe("describePlanError", () => {
  it("explains a 409 conflict", () => {
    expect(describePlanError(new ApiError(409, "Conflict"), i18n.getFixedT("en"))).toBe(
      "The plan changed meanwhile; reload and try again.",
    );
  });
});

describe("usePlanActions notes and special meals", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(client, "getWeek").mockResolvedValue(makePlan());
  });

  it("keeps the note of the slot when a recipe or a special replaces its content", async () => {
    const assign = vi.spyOn(client, "assignSlot").mockResolvedValue(makePlan());
    const { queryClient, actions } = setup();
    queryClient.setQueryData(
      weekKey(WEEK),
      makePlan(WEEK, { "0:lunch": soup }, undefined, { notes: { "0:lunch": "Double batch" } }),
    );

    act(() => actions.current.assign(slotA, stew));
    await waitFor(() => expect(assign).toHaveBeenCalledTimes(1));
    expect(assign).toHaveBeenLastCalledWith(WEEK, 0, "lunch", { recipe_id: 2, note: "Double batch" });

    act(() => actions.current.assignSpecial({ day: 3, slot: "dinner" }, "free"));
    await waitFor(() => expect(assign).toHaveBeenCalledTimes(2));
    expect(assign).toHaveBeenLastCalledWith(WEEK, 3, "dinner", { special: "free", note: null });
  });

  it("applies a special and a note optimistically and sends the note request", async () => {
    const first = deferred();
    vi.spyOn(client, "assignSlot").mockReturnValue(first.promise);
    const note = vi.spyOn(client, "setSlotNote").mockResolvedValue(makePlan());
    const { queryClient, actions } = setup();

    act(() => {
      actions.current.assignSpecial(slotA, "leftovers");
      actions.current.setNote(slotA, "From Sunday");
    });
    await waitFor(() => {
      const day = queryClient.getQueryData<WeekPlan>(weekKey(WEEK))!.days[0]!;
      expect(day.lunch_special).toBe("leftovers");
      expect(day.lunch_note).toBe("From Sunday");
    });
    // The note request waits for the special request of the same week.
    await new Promise((r) => setTimeout(r, 20));
    expect(note).not.toHaveBeenCalled();
    await act(async () => first.resolve(makePlan()));
    await waitFor(() => expect(note).toHaveBeenCalledWith(WEEK, 0, "lunch", "From Sunday"));
  });
});

describe("usePlanActions recipe history", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(client, "getWeek").mockResolvedValue(makePlan());
  });

  it("refreshes the recipe lists and histories once the last change has settled", async () => {
    const first = deferred();
    const second = deferred();
    vi.spyOn(client, "assignSlot").mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { queryClient, actions } = setup();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    act(() => {
      actions.current.assign(slotA, soup);
      actions.current.assign({ day: 1, slot: "lunch" }, stew);
    });
    await act(async () => first.resolve(makePlan()));
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ["recipes"] }); // one still in flight

    await act(async () => second.resolve(makePlan()));
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["recipes"] }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["recipe-history"] });
  });
});

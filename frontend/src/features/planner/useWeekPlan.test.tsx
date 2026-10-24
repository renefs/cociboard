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
    expect(assign).toHaveBeenLastCalledWith(WEEK, 0, "lunch", 1);

    // Give the second request every chance to start early.
    await new Promise((r) => setTimeout(r, 20));
    expect(assign).toHaveBeenCalledTimes(1);

    await act(async () => first.resolve(makePlan()));
    await waitFor(() => expect(assign).toHaveBeenCalledTimes(2));
    expect(assign).toHaveBeenLastCalledWith(WEEK, 0, "lunch", 2);
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
    expect(assign).toHaveBeenLastCalledWith(WEEK, 0, "lunch", 2);
    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
  });
});

describe("describePlanError", () => {
  it("explains a 409 conflict", () => {
    expect(describePlanError(new ApiError(409, "Conflict"), i18n.getFixedT("en"))).toBe(
      "The plan changed meanwhile; reload and try again.",
    );
  });
});

import { QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "../api/client";
import { ApiError } from "../api/client";
import { PLAN_CHANGE_KEY } from "./keys";
import { makePlan, makeRecipe } from "../test/fixtures";
import { makeTestQueryClient } from "../test/utils";
import { useShoppingActions } from "../features/shopping/useShoppingList";
import { readWeek, usePlanActions, useWeekPlan, weekKey } from "../features/planner/useWeekPlan";
import { recipeAt } from "../features/planner/slots";
import { notifySignedIn, retryAfterSignIn } from "./authRetry";
import { pendingVariables } from "./pending";
import { STORAGE_KEY, createEditsPersister } from "./persister";
import { discardWaitingEdits, startOfflineEdits } from "./start";
import { resetNotices } from "./notices";

const WEEK = "2026-10-26";
const soup = makeRecipe({ id: 1, name: "Soup", meal_type: "both" });
const stew = makeRecipe({ id: 2, name: "Stew", meal_type: "both" });
const monday = { day: 0, slot: "lunch" } as const;
const tuesday = { day: 1, slot: "dinner" } as const;

function wrapperFor(queryClient: ReturnType<typeof makeTestQueryClient>) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

/** The app as it was when the page closed: offline, three changes made, then stored. */
async function closeOfflineWithThreeChanges() {
  onlineManager.setOnline(false);
  const queryClient = makeTestQueryClient();
  queryClient.setQueryData(weekKey(WEEK), makePlan(WEEK));
  const persister = createEditsPersister({ throttleMs: 0 });
  const stop = startOfflineEdits(queryClient, { persister, locks: undefined });
  // Restoring (nothing stored yet) must finish before changes are saved.
  await new Promise((resolve) => setTimeout(resolve, 10));
  const { result } = renderHook(
    () => ({ plan: usePlanActions(WEEK, vi.fn()), shopping: useShoppingActions(WEEK, vi.fn()) }),
    { wrapper: wrapperFor(queryClient) },
  );
  act(() => {
    result.current.plan.assign(monday, soup);
    result.current.shopping.toggleItem("sal", true);
    result.current.plan.move(monday, tuesday);
    result.current.plan.assign(monday, stew);
  });
  persister.flush();
  stop();
  queryClient.clear();
}

describe("waiting changes survive closing the app", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    resetNotices();
    vi.spyOn(client, "getWeek").mockResolvedValue(makePlan(WEEK));
    vi.spyOn(client, "getShoppingList").mockResolvedValue({ week_start: WEEK, items: [], extras: [] });
  });
  afterEach(() => onlineManager.setOnline(true));

  it("stores paused changes as JSON with their scope", async () => {
    await closeOfflineWithThreeChanges();
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as {
      version: number;
      client: { clientState: { mutations: { mutationKey: unknown[]; scope: { id: string } }[] } };
    };
    const mutations = stored.client.clientState.mutations;
    expect(mutations.map((m) => m.mutationKey[0])).toEqual([PLAN_CHANGE_KEY, "shopping-change", PLAN_CHANGE_KEY, PLAN_CHANGE_KEY]);
    expect(mutations.map((m) => m.scope.id)).toEqual([`week-${WEEK}`, `shopping-${WEEK}`, `week-${WEEK}`, `week-${WEEK}`]);
  });

  it("while still offline shows the changes as left and keeps them waiting", async () => {
    await closeOfflineWithThreeChanges();
    const assign = vi.spyOn(client, "assignSlot");

    const queryClient = makeTestQueryClient();
    // The server's plan as the service worker's cache would serve it.
    queryClient.setQueryData(weekKey(WEEK), makePlan(WEEK));
    startOfflineEdits(queryClient, { persister: createEditsPersister({ throttleMs: 0 }), locks: undefined });
    const { result } = renderHook(() => useWeekPlan(WEEK), { wrapper: wrapperFor(queryClient) });

    await waitFor(() => expect(result.current.data && recipeAt(result.current.data, monday)?.name).toBe("Stew"));
    expect(recipeAt(result.current.data!, tuesday)?.name).toBe("Soup");
    expect(pendingVariables(queryClient, [PLAN_CHANGE_KEY, WEEK])).toHaveLength(3);
    expect(assign).not.toHaveBeenCalled();
  });

  it("once online sends them in the original order per scope", async () => {
    await closeOfflineWithThreeChanges();
    const calls: string[] = [];
    vi.spyOn(client, "assignSlot").mockImplementation(async (_week, day, slot, body) => {
      calls.push(`assign ${day}:${slot}:${"recipe_id" in body ? body.recipe_id : body.special}`);
      return makePlan(WEEK);
    });
    vi.spyOn(client, "moveSlot").mockImplementation(async (_week, body) => {
      calls.push(`move ${body.from_day}:${body.from_slot}>${body.to_day}:${body.to_slot}`);
      return makePlan(WEEK);
    });
    vi.spyOn(client, "setShoppingCheck").mockImplementation(async (_week, key, checked) => {
      calls.push(`check ${key}:${checked}`);
      return { week_start: WEEK, items: [], extras: [] };
    });

    onlineManager.setOnline(true);
    const queryClient = makeTestQueryClient();
    startOfflineEdits(queryClient, { persister: createEditsPersister({ throttleMs: 0 }), locks: undefined });

    await waitFor(() => expect(calls).toHaveLength(4));
    const plan = calls.filter((call) => !call.startsWith("check"));
    expect(plan).toEqual(["assign 0:lunch:1", "move 0:lunch>1:dinner", "assign 0:lunch:2"]);
    expect(calls).toContain("check sal:true");
    await waitFor(() => expect(pendingVariables(queryClient, [PLAN_CHANGE_KEY, WEEK])).toHaveLength(0));
    // Everything was sent, so nothing is left on the device.
    await waitFor(() => expect(localStorage.getItem(STORAGE_KEY)).toBeNull());
  });

  it("rolls a restored change back and tells the user when the server rejects it", async () => {
    await closeOfflineWithThreeChanges();
    vi.spyOn(client, "assignSlot").mockRejectedValue(new ApiError(422, "bad", { code: "recipe_archived" }));
    vi.spyOn(client, "moveSlot").mockResolvedValue(makePlan(WEEK));
    vi.spyOn(client, "setShoppingCheck").mockResolvedValue({ week_start: WEEK, items: [], extras: [] });

    onlineManager.setOnline(true);
    const queryClient = makeTestQueryClient();
    queryClient.setQueryData(weekKey(WEEK), makePlan(WEEK));
    startOfflineEdits(queryClient, { persister: createEditsPersister({ throttleMs: 0 }), locks: undefined });
    const { useNotices } = await import("./notices");
    const { result } = renderHook(() => useNotices(), { wrapper: wrapperFor(queryClient) });

    await waitFor(() => expect(result.current.length).toBeGreaterThan(0));
    await waitFor(() => expect(pendingVariables(queryClient, [PLAN_CHANGE_KEY, WEEK])).toHaveLength(0));
    expect(readWeek(queryClient, WEEK)).toEqual(makePlan(WEEK));
  });

  it("does not restore or send anything in a tab that is not the leader", async () => {
    await closeOfflineWithThreeChanges();
    const assign = vi.spyOn(client, "assignSlot").mockResolvedValue(makePlan(WEEK));
    onlineManager.setOnline(true);
    const queryClient = makeTestQueryClient();
    const never = { request: () => new Promise<void>(() => undefined) } as unknown as LockManager;
    startOfflineEdits(queryClient, { persister: createEditsPersister({ throttleMs: 0 }), locks: never });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(assign).not.toHaveBeenCalled();
    expect(queryClient.getMutationCache().getAll()).toHaveLength(0);
  });

  it("discardWaitingEdits empties the cache and the device", async () => {
    await closeOfflineWithThreeChanges();
    const queryClient = makeTestQueryClient();
    startOfflineEdits(queryClient, { persister: createEditsPersister({ throttleMs: 0 }), locks: undefined });
    await waitFor(() => expect(queryClient.getMutationCache().getAll()).toHaveLength(4));
    discardWaitingEdits(queryClient);
    expect(queryClient.getMutationCache().getAll()).toHaveLength(0);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});

describe("retryAfterSignIn", () => {
  const expired = () => new ApiError(401, "no", { code: "auth_required" });

  it("keeps the request waiting until the user signs in, then sends it again", async () => {
    const run = vi.fn().mockRejectedValueOnce(expired()).mockResolvedValueOnce("done");
    const result = retryAfterSignIn(run);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(run).toHaveBeenCalledTimes(1);
    notifySignedIn();
    await expect(result).resolves.toBe("done");
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("does not hide other failures", async () => {
    const failure = new ApiError(409, "conflict", { code: "x" });
    await expect(retryAfterSignIn(() => Promise.reject(failure))).rejects.toBe(failure);
  });
});

import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "../../api/client";
import { ApiError } from "../../api/client";
import type { HouseholdSettings } from "../../api/types";
import { DEFAULT_HOUSEHOLD } from "./householdLogic";
import { applyHouseholdSaves, householdKey, useHouseholdSettings, useSaveHousehold } from "./useHouseholdSettings";
import { makeTestQueryClient } from "../../test/utils";

const changed: HouseholdSettings = { ...DEFAULT_HOUSEHOLD, min_fish_meals: 0, avoided_properties: ["spicy"] };

function setup() {
  const queryClient = makeTestQueryClient();
  queryClient.setQueryData(householdKey, DEFAULT_HOUSEHOLD);
  queryClient.setQueryData(["week", "2026-10-26"], { marker: true });
  queryClient.setQueryData(["candidates", "2026-10-26", 0, "lunch"], []);
  const onError = vi.fn();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(
    () => ({ save: useSaveHousehold(onError), settings: useHouseholdSettings() }),
    { wrapper },
  );
  return { queryClient, onError, hook: result };
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(client, "getHouseholdSettings").mockResolvedValue(DEFAULT_HOUSEHOLD);
});

describe("useSaveHousehold", () => {
  it("updates the cache at once, sends the full object and refreshes what depends on it", async () => {
    let finish!: (settings: HouseholdSettings) => void;
    const put = vi.spyOn(client, "putHouseholdSettings").mockReturnValue(
      new Promise<HouseholdSettings>((resolve) => {
        finish = resolve;
      }),
    );
    const { queryClient, hook } = setup();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    act(() => hook.current.save(changed));

    // Before the response the settings show the waiting save; the cache still holds the server's.
    await waitFor(() => expect(hook.current.settings.data).toEqual(changed));
    expect(queryClient.getQueryData(householdKey)).toEqual(DEFAULT_HOUSEHOLD);
    expect(put).toHaveBeenCalledWith(changed);
    expect(invalidate).not.toHaveBeenCalled();

    await act(async () => finish(changed));
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["week"] }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: householdKey });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["candidates"] });
  });

  it("rolls back and reports the server's reason when the save is rejected", async () => {
    vi.spyOn(client, "putHouseholdSettings").mockRejectedValue(
      new ApiError(422, "bad", { code: "required_and_avoided" }),
    );
    vi.spyOn(client, "getHouseholdSettings").mockResolvedValue(DEFAULT_HOUSEHOLD);
    const { queryClient, onError, hook } = setup();

    act(() => hook.current.save(changed));

    await waitFor(() => expect(onError).toHaveBeenCalledWith("A property can't be both required and avoided."));
    expect(queryClient.getQueryData(householdKey)).toEqual(DEFAULT_HOUSEHOLD);
    await waitFor(() => expect(hook.current.settings.data).toEqual(DEFAULT_HOUSEHOLD));
  });

  it("sends saves one at a time, in order", async () => {
    const resolvers: ((settings: HouseholdSettings) => void)[] = [];
    const put = vi.spyOn(client, "putHouseholdSettings").mockImplementation(
      () => new Promise<HouseholdSettings>((resolve) => resolvers.push(resolve)),
    );
    const second = { ...changed, min_fish_meals: 5 };
    const { hook } = setup();

    act(() => {
      hook.current.save(changed);
      hook.current.save(second);
    });

    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    await act(async () => resolvers[0]?.(changed));
    await waitFor(() => expect(put).toHaveBeenCalledTimes(2));
    expect(put).toHaveBeenLastCalledWith(second);
  });
});

describe("applyHouseholdSaves", () => {
  it("shows the newest waiting save, or the server's settings when none waits", () => {
    const newest = { ...changed, min_fish_meals: 5 };
    expect(applyHouseholdSaves(DEFAULT_HOUSEHOLD, [changed, newest])).toBe(newest);
    expect(applyHouseholdSaves(DEFAULT_HOUSEHOLD, [])).toBe(DEFAULT_HOUSEHOLD);
  });
});

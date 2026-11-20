import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "../../api/client";
import { ApiError } from "../../api/client";
import type { HouseholdSettings } from "../../api/types";
import { DEFAULT_HOUSEHOLD } from "./householdLogic";
import { householdKey, useSaveHousehold } from "./useHouseholdSettings";

const changed: HouseholdSettings = { ...DEFAULT_HOUSEHOLD, min_fish_meals: 0, avoided_properties: ["spicy"] };

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(householdKey, DEFAULT_HOUSEHOLD);
  queryClient.setQueryData(["week", "2026-10-26"], { marker: true });
  queryClient.setQueryData(["candidates", "2026-10-26", 0, "lunch"], []);
  const onError = vi.fn();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useSaveHousehold(onError), { wrapper });
  return { queryClient, onError, save: result };
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(client, "getHouseholdSettings").mockResolvedValue(changed);
});

describe("useSaveHousehold", () => {
  it("updates the cache at once, sends the full object and refreshes what depends on it", async () => {
    let finish!: (settings: HouseholdSettings) => void;
    const put = vi.spyOn(client, "putHouseholdSettings").mockReturnValue(
      new Promise<HouseholdSettings>((resolve) => {
        finish = resolve;
      }),
    );
    const { queryClient, save } = setup();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    act(() => save.current(changed));

    await waitFor(() => expect(queryClient.getQueryData(householdKey)).toEqual(changed)); // before the response
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
    const { queryClient, onError, save } = setup();

    act(() => save.current(changed));

    await waitFor(() => expect(onError).toHaveBeenCalledWith("A property can't be both required and avoided."));
    expect(queryClient.getQueryData(householdKey)).toEqual(DEFAULT_HOUSEHOLD);
  });

  it("sends saves one at a time, in order", async () => {
    const resolvers: ((settings: HouseholdSettings) => void)[] = [];
    const put = vi.spyOn(client, "putHouseholdSettings").mockImplementation(
      () => new Promise<HouseholdSettings>((resolve) => resolvers.push(resolve)),
    );
    const second = { ...changed, min_fish_meals: 5 };
    const { save } = setup();

    act(() => {
      save.current(changed);
      save.current(second);
    });

    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    await act(async () => resolvers[0]?.(changed));
    await waitFor(() => expect(put).toHaveBeenCalledTimes(2));
    expect(put).toHaveBeenLastCalledWith(second);
  });
});

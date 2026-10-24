import { afterEach, describe, expect, it, vi } from "vitest";
import { assignSlot, clearSlot, getWeek, listRecipes, moveSlot } from "./client";

describe("listRecipes", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("builds the query string from filters", async () => {
    const fetchMock = vi.fn<(url: string) => Promise<Response>>(() =>
      Promise.resolve(new Response("[]", { status: 200 })),
    );
    vi.stubGlobal("fetch", fetchMock);
    await listRecipes({ slot: "lunch", q: " pollo ", properties: ["vegan", "quick"] });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/recipes?slot=lunch&q=pollo&property=vegan&property=quick");
    await listRecipes();
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/recipes");
  });
});

describe("week endpoints", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("calls the assign, clear and move routes", async () => {
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(() =>
      Promise.resolve(new Response("{}", { status: 200 })),
    );
    vi.stubGlobal("fetch", fetchMock);
    await getWeek("2026-10-26");
    await assignSlot("2026-10-26", 2, "dinner", 7);
    await clearSlot("2026-10-26", 2, "dinner");
    await moveSlot("2026-10-26", { from_day: 0, from_slot: "lunch", to_day: 1, to_slot: "dinner" });
    const calls = fetchMock.mock.calls.map(([url, init]) => [url, init?.method ?? "GET", init?.body]);
    expect(calls).toEqual([
      ["/api/weeks/2026-10-26", "GET", undefined],
      ["/api/weeks/2026-10-26/days/2/dinner", "PUT", JSON.stringify({ recipe_id: 7 })],
      ["/api/weeks/2026-10-26/days/2/dinner", "DELETE", undefined],
      [
        "/api/weeks/2026-10-26/move",
        "POST",
        JSON.stringify({ from_day: 0, from_slot: "lunch", to_day: 1, to_slot: "dinner" }),
      ],
    ]);
  });
});

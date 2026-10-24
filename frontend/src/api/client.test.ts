import { afterEach, describe, expect, it, vi } from "vitest";
import { listRecipes } from "./client";

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

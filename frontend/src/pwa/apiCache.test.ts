import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { markSignedOut } from "../features/auth/session";
import { clearApiCache } from "./apiCache";

afterEach(() => vi.unstubAllGlobals());

describe("clearApiCache", () => {
  it("deletes the api cache entry", async () => {
    const del = vi.fn(() => Promise.resolve(true));
    vi.stubGlobal("caches", { delete: del });
    await clearApiCache();
    expect(del).toHaveBeenCalledWith("cociboard-api");
  });

  it("does nothing where Cache Storage is unavailable", async () => {
    vi.stubGlobal("caches", undefined);
    await expect(clearApiCache()).resolves.toBeUndefined();
  });

  it("swallows storage errors", async () => {
    vi.stubGlobal("caches", { delete: () => Promise.reject(new Error("blocked")) });
    await expect(clearApiCache()).resolves.toBeUndefined();
  });

  it("is triggered when the session ends", () => {
    const del = vi.fn(() => Promise.resolve(true));
    vi.stubGlobal("caches", { delete: del });
    markSignedOut(new QueryClient());
    expect(del).toHaveBeenCalledWith("cociboard-api");
  });
});

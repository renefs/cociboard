import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import App from "./App";
import { makeRecipe } from "./test/fixtures";
import { renderWithQuery } from "./test/utils";

function mockFetch(health: () => Promise<Response>) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) =>
      url.startsWith("/api/recipes")
        ? Promise.resolve(new Response(JSON.stringify([makeRecipe()]), { status: 200 }))
        : health(),
    ),
  );
}

describe("App", () => {
  it("renders the header, the recipes and the backend version", async () => {
    mockFetch(() =>
      Promise.resolve(new Response(JSON.stringify({ status: "ok", version: "0.2.0" }), { status: 200 })),
    );
    renderWithQuery(<App />);
    expect(screen.getByRole("heading", { name: "Cociboard" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Weekly planner" })).toBeInTheDocument();
    expect(await screen.findByText("Backend v0.2.0")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Lentejas estofadas" })).toBeInTheDocument();
  });

  it("falls back gracefully when the backend is offline", async () => {
    mockFetch(() => Promise.reject(new TypeError("Failed to fetch")));
    renderWithQuery(<App />);
    expect(await screen.findByText("Backend offline")).toBeInTheDocument();
  });
});

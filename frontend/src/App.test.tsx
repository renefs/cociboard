import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import App from "./App";
import { makePlan, makeRecipe } from "./test/fixtures";
import { renderWithQuery } from "./test/utils";

function mockFetch(health: () => Promise<Response>) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      if (url.startsWith("/api/recipes")) {
        return Promise.resolve(new Response(JSON.stringify([makeRecipe()]), { status: 200 }));
      }
      if (url.startsWith("/api/weeks")) {
        return Promise.resolve(new Response(JSON.stringify(makePlan()), { status: 200 }));
      }
      return health();
    }),
  );
}

describe("App", () => {
  it("renders the header, the recipes and the backend version", async () => {
    mockFetch(() =>
      Promise.resolve(new Response(JSON.stringify({ status: "ok", version: "0.3.0" }), { status: 200 })),
    );
    renderWithQuery(<App />);
    expect(screen.getByRole("heading", { name: "Cociboard" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Weekly planner" })).toBeInTheDocument();
    expect(await screen.findByText("Backend v0.3.0")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Lentejas estofadas" })).toBeInTheDocument();
    expect(await screen.findByRole("group", { name: "Monday lunch" })).toBeInTheDocument();
  });

  it("falls back gracefully when the backend is offline", async () => {
    mockFetch(() => Promise.reject(new TypeError("Failed to fetch")));
    renderWithQuery(<App />);
    expect(await screen.findByText("Backend offline")).toBeInTheDocument();
  });

  it("opens the backup dialog from the header", async () => {
    mockFetch(() =>
      Promise.resolve(new Response(JSON.stringify({ status: "ok", version: "0.11.0" }), { status: 200 })),
    );
    renderWithQuery(<App />);
    await userEvent.setup().click(screen.getByRole("button", { name: /Backup/ }));
    const dialog = await screen.findByRole("dialog", { name: "Backup" });
    expect(dialog).toHaveTextContent("Download backup");
    expect(dialog).toHaveTextContent("Restore from a file");
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import App from "./App";

function mockFetch(impl: () => Promise<Response>) {
  vi.stubGlobal("fetch", vi.fn(impl));
}

describe("App", () => {
  it("renders the header and the backend version", async () => {
    mockFetch(() =>
      Promise.resolve(new Response(JSON.stringify({ status: "ok", version: "0.1.0" }), { status: 200 })),
    );
    render(<App />);
    expect(screen.getByRole("heading", { name: "Cociboard" })).toBeInTheDocument();
    expect(await screen.findByText("Backend v0.1.0")).toBeInTheDocument();
  });

  it("falls back gracefully when the backend is offline", async () => {
    mockFetch(() => Promise.reject(new TypeError("Failed to fetch")));
    render(<App />);
    expect(await screen.findByText("Backend offline")).toBeInTheDocument();
  });
});

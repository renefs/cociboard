import { screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "../../api/client";
import { makeDraft, makeRecipe } from "../../test/fixtures";
import { renderWithQuery } from "../../test/utils";
import { importSession } from "./importSession";
import { RecipePanel } from "./RecipePanel";

vi.mock("../../api/client");

beforeEach(() => {
  importSession.disabled = false;
  vi.mocked(client.listRecipes).mockResolvedValue([makeRecipe()]);
  vi.mocked(client.importRecipe).mockResolvedValue(makeDraft());
});

afterEach(() => window.history.replaceState(null, "", "/"));

describe("share target", () => {
  it("opens the new-recipe form, imports the shared link and cleans the address bar", async () => {
    window.history.replaceState(
      null,
      "",
      "/?week=2026-11-16&view=recipes&share-title=Stew&share-text=" +
        encodeURIComponent("Lentil stew https://example.com/stew"),
    );
    renderWithQuery(<RecipePanel />);

    expect(await screen.findByRole("dialog", { name: "New recipe" })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: /^Name/ })).toHaveValue("Lemon Chicken Traybake"),
    );
    expect(client.importRecipe).toHaveBeenCalledWith("https://example.com/stew");
    expect(window.location.search).toBe("?week=2026-11-16&view=recipes");
  });

  it("does nothing without a shared link, and keeps the other parameters", async () => {
    window.history.replaceState(null, "", "/?week=2026-11-16&share-title=Only%20a%20title");
    renderWithQuery(<RecipePanel />);
    expect(await screen.findByRole("heading", { name: "Fabada asturiana" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(client.importRecipe).not.toHaveBeenCalled();
    expect(window.location.search).toBe("?week=2026-11-16");
  });
});

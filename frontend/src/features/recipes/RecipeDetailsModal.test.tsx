import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "../../api/client";
import { makeRecipe } from "../../test/fixtures";
import { RecipeDetailsModal } from "./RecipeDetailsModal";
import { makeTestQueryClient } from "../../test/utils";

vi.mock("../../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof client>()),
  deleteRecipe: vi.fn(),
  getRecipeHistory: vi.fn(),
  getRecipeUsage: vi.fn(),
  updateRecipe: vi.fn(),
}));

const recipe = makeRecipe({
  id: 7,
  name: "Lentejas estofadas",
  description: "Slow and hearty",
  prep_minutes: 60,
  properties: ["gluten_free", "quick"],
});
const onClose = vi.fn();
const onNotify = vi.fn();

beforeEach(() => {
  onClose.mockReset();
  onNotify.mockReset();
  vi.mocked(client.getRecipeHistory).mockReset();
  vi.mocked(client.getRecipeHistory).mockResolvedValue({
    times_planned: 0,
    last_planned_on: null,
    next_planned_on: null,
    meals: [],
  });
});

function renderModal(shown = recipe) {
  const queryClient = makeTestQueryClient();
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  const { unmount } = render(
    <QueryClientProvider client={queryClient}>
      <RecipeDetailsModal recipe={shown} onClose={onClose} onNotify={onNotify} />
    </QueryClientProvider>,
  );
  return { invalidate, unmount };
}

describe("RecipeDetailsModal", () => {
  it("shows everything about the recipe with labelled properties", () => {
    renderModal();
    const dialog = screen.getByRole("dialog", { name: "Lentejas estofadas" });
    expect(within(dialog).getByText("Slow and hearty")).toBeInTheDocument();
    expect(within(dialog).getByText("60 min", { exact: false })).toBeInTheDocument();
    expect(within(dialog).getByText("Legumes")).toBeInTheDocument();
    const ingredients = within(dialog).getByRole("list", { name: "Ingredients" });
    expect(within(ingredients).getAllByRole("listitem")).toHaveLength(recipe.ingredients.length);
    const properties = within(dialog).getByRole("list", { name: "Properties" });
    expect(within(properties).getByText("Gluten-free")).toBeInTheDocument();
    expect(within(properties).getByText("Quick (30 min or less)")).toBeInTheDocument();
  });

  it("shows servings, numbered steps and a safe source link", () => {
    renderModal(
      makeRecipe({
        name: "Cocido",
        servings: 4,
        steps: ["Soak the chickpeas", "Boil for two hours"],
        source_url: "https://www.example.com/cocido?x=1",
      }),
    );
    const dialog = screen.getByRole("dialog", { name: "Cocido" });
    expect(within(dialog).getByText("Serves 4")).toBeInTheDocument();
    const steps = within(dialog).getByRole("list", { name: "Steps" });
    expect(steps.tagName).toBe("OL");
    expect(within(steps).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Soak the chickpeas",
      "Boil for two hours",
    ]);
    const link = within(dialog).getByRole("link", { name: "View original recipe (example.com)" });
    expect(link).toHaveAttribute("href", "https://www.example.com/cocido?x=1");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("uses the singular for one serving", () => {
    renderModal(makeRecipe({ servings: 1 }));
    expect(screen.getByText("Serves 1")).toBeInTheDocument();
  });

  it("shows no steps, servings or link section for a plain recipe", () => {
    renderModal(makeRecipe());
    expect(screen.queryByRole("list", { name: "Steps" })).not.toBeInTheDocument();
    expect(screen.queryByText("Steps")).not.toBeInTheDocument();
    expect(screen.queryByText(/Serves/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("never renders an unsafe stored link as an anchor", () => {
    for (const bad of ["javascript:alert(1)", "data:text/html,hi", "/relative"]) {
      const { unmount } = renderModal(makeRecipe({ source_url: bad }));
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
      unmount();
    }
  });

  it("explains the impact and recommends archiving when the recipe is planned", async () => {
    const user = userEvent.setup();
    vi.mocked(client.getRecipeUsage).mockResolvedValue({ count: 3 });
    vi.mocked(client.deleteRecipe).mockResolvedValue(undefined);
    const { invalidate } = renderModal();

    await user.click(screen.getByRole("button", { name: "Delete" }));
    const confirm = await screen.findByRole("dialog", { name: "Delete Lentejas estofadas?" });
    const text = await within(confirm).findByText(/planned in/);
    expect(text).toHaveTextContent("planned in 3 meals");
    expect(text).toHaveTextContent("past weeks included");
    expect(within(confirm).getByRole("button", { name: "Archive instead" })).toBeInTheDocument();
    expect(client.deleteRecipe).not.toHaveBeenCalled();

    await user.click(within(confirm).getByRole("button", { name: "Delete permanently" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(client.deleteRecipe).toHaveBeenCalledWith(7);
    expect(onNotify).toHaveBeenCalledWith("info", "Deleted Lentejas estofadas.");
    const keys = invalidate.mock.calls.map(([filters]) => filters?.queryKey?.[0]);
    expect(keys).toEqual(expect.arrayContaining(["recipes", "week"]));
  });

  it("archives instead of deleting from the confirmation", async () => {
    const user = userEvent.setup();
    vi.mocked(client.getRecipeUsage).mockResolvedValue({ count: 2 });
    vi.mocked(client.updateRecipe).mockResolvedValue({ ...recipe, archived: true });
    const { invalidate } = renderModal();
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(await screen.findByRole("button", { name: "Archive instead" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(client.updateRecipe).toHaveBeenCalledWith(7, { archived: true }, undefined);
    expect(client.deleteRecipe).not.toHaveBeenCalled();
    expect(onNotify).toHaveBeenCalledWith("info", expect.stringContaining("Archived Lentejas estofadas"));
    const keys = invalidate.mock.calls.map(([filters]) => filters?.queryKey?.[0]);
    expect(keys).toEqual(expect.arrayContaining(["recipes", "week", "candidates"]));
  });

  it("archives and restores from the details", async () => {
    const user = userEvent.setup();
    vi.mocked(client.updateRecipe).mockResolvedValue({ ...recipe, archived: true });
    const { unmount } = renderModal();
    await user.click(screen.getByRole("button", { name: "Archive" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(client.updateRecipe).toHaveBeenCalledWith(7, { archived: true }, undefined);
    unmount();

    onClose.mockReset();
    vi.mocked(client.updateRecipe).mockResolvedValue({ ...recipe, archived: false });
    renderModal({ ...recipe, archived: true });
    await user.click(screen.getByRole("button", { name: "Restore" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(client.updateRecipe).toHaveBeenLastCalledWith(7, { archived: false }, undefined);
    expect(onNotify).toHaveBeenLastCalledWith("info", "Restored Lentejas estofadas.");
  });

  it("keeps the details open when archiving fails", async () => {
    const user = userEvent.setup();
    vi.mocked(client.updateRecipe).mockRejectedValue(new TypeError("offline"));
    renderModal();
    await user.click(screen.getByRole("button", { name: "Archive" }));
    await waitFor(() => expect(onNotify).toHaveBeenCalledWith("error", expect.stringContaining("Couldn't archive")));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("says so when the recipe is not planned, and Cancel keeps it", async () => {
    const user = userEvent.setup();
    vi.mocked(client.getRecipeUsage).mockResolvedValue({ count: 0 });
    renderModal();
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByText(/not planned in any week/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("dialog", { name: "Lentejas estofadas" })).toBeInTheDocument();
    expect(client.deleteRecipe).not.toHaveBeenCalled();
  });

  it("reports a failed delete and stays open", async () => {
    const user = userEvent.setup();
    vi.mocked(client.getRecipeUsage).mockResolvedValue({ count: 1 });
    vi.mocked(client.deleteRecipe).mockRejectedValue(new TypeError("offline"));
    renderModal();
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await screen.findByText(/planned in/);
    await user.click(screen.getByRole("button", { name: "Delete permanently" }));
    await waitFor(() => expect(onNotify).toHaveBeenCalledWith("error", expect.stringContaining("Couldn't delete")));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("edits the recipe and returns to the updated details", async () => {
    const user = userEvent.setup();
    vi.mocked(client.updateRecipe).mockResolvedValue({ ...recipe, name: "Lentejas ricas" });
    const { invalidate } = renderModal();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const name = await screen.findByRole("textbox", { name: /^Name/ });
    await user.clear(name);
    await user.type(name, "Lentejas ricas");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("dialog", { name: "Lentejas ricas" })).toBeInTheDocument();
    expect(onNotify).toHaveBeenCalledWith("info", "Saved Lentejas ricas.");
    expect(invalidate).toHaveBeenCalled();
  });
});

describe("RecipeDetailsModal history and favourite", () => {
  it("shows the totals, the next meal and the planned meals with upcoming ones marked", async () => {
    vi.mocked(client.getRecipeHistory).mockResolvedValue({
      times_planned: 7,
      last_planned_on: "2026-11-17",
      next_planned_on: "2026-11-26",
      meals: [
        { date: "2026-11-26", week_start: "2026-11-23", day: 3, slot: "lunch", upcoming: true },
        { date: "2026-11-17", week_start: "2026-11-16", day: 1, slot: "dinner", upcoming: false },
      ],
    });
    renderModal();

    expect(await screen.findByText("Planned 7 times · Next: Thu 26 Nov · Lunch")).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Planned meals" });
    const items = within(list).getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual(["Thu 26 Nov · LunchUpcoming", "Tue 17 Nov · Dinner"]);
    expect(client.getRecipeHistory).toHaveBeenCalledWith(7, expect.anything());
  });

  it("says so when the recipe was never planned", async () => {
    renderModal();
    expect(await screen.findByText("Never planned")).toBeInTheDocument();
    expect(screen.getByText("Not planned in any week yet.")).toBeInTheDocument();
  });

  it("shows an error with retry when the history can't be loaded", async () => {
    const user = userEvent.setup();
    vi.mocked(client.getRecipeHistory).mockRejectedValueOnce(new Error("down"));
    renderModal();
    expect(await screen.findByText(/Can't load the history/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Not planned in any week yet.")).toBeInTheDocument();
  });

  it("toggles the favourite from the modal and puts it back when saving fails", async () => {
    const user = userEvent.setup();
    vi.mocked(client.updateRecipe).mockRejectedValue(new Error("down"));
    renderModal();

    await user.click(screen.getByRole("button", { name: "Add Lentejas estofadas to favourites" }));

    expect(client.updateRecipe).toHaveBeenCalledWith(7, { favourite: true });
    await waitFor(() =>
      expect(onNotify).toHaveBeenCalledWith("error", expect.stringContaining("Couldn't update the favourites")),
    );
    expect(screen.getByRole("button", { name: "Add Lentejas estofadas to favourites" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("starts with the recipe's favourite state", () => {
    renderModal(makeRecipe({ id: 7, name: "Lentejas estofadas", favourite: true }));
    expect(screen.getByRole("button", { name: "Remove Lentejas estofadas from favourites" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});

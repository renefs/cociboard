import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "../../api/client";
import { makeRecipe } from "../../test/fixtures";
import { RecipeDetailsModal } from "./RecipeDetailsModal";

vi.mock("../../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof client>()),
  deleteRecipe: vi.fn(),
  getRecipeUsage: vi.fn(),
  updateRecipe: vi.fn(),
}));

const recipe = makeRecipe({
  id: 7,
  name: "Fabada asturiana",
  description: "Slow and hearty",
  prep_minutes: 60,
  properties: ["gluten_free", "quick"],
});
const onClose = vi.fn();
const onNotify = vi.fn();

beforeEach(() => {
  onClose.mockReset();
  onNotify.mockReset();
});

function renderModal(shown = recipe) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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
    const dialog = screen.getByRole("dialog", { name: "Fabada asturiana" });
    expect(within(dialog).getByText("Slow and hearty")).toBeInTheDocument();
    expect(within(dialog).getByText("60 min", { exact: false })).toBeInTheDocument();
    expect(within(dialog).getByText("Legumes")).toBeInTheDocument();
    const ingredients = within(dialog).getByRole("list", { name: "Ingredients" });
    expect(within(ingredients).getAllByRole("listitem")).toHaveLength(recipe.ingredients.length);
    const properties = within(dialog).getByRole("list", { name: "Properties" });
    expect(within(properties).getByText("Gluten-free")).toBeInTheDocument();
    expect(within(properties).getByText("Quick (30 min or less)")).toBeInTheDocument();
  });

  it("explains the impact and recommends archiving when the recipe is planned", async () => {
    const user = userEvent.setup();
    vi.mocked(client.getRecipeUsage).mockResolvedValue({ count: 3 });
    vi.mocked(client.deleteRecipe).mockResolvedValue(undefined);
    const { invalidate } = renderModal();

    await user.click(screen.getByRole("button", { name: "Delete" }));
    const confirm = await screen.findByRole("dialog", { name: "Delete Fabada asturiana?" });
    const text = await within(confirm).findByText(/planned in/);
    expect(text).toHaveTextContent("planned in 3 meals");
    expect(text).toHaveTextContent("past weeks included");
    expect(within(confirm).getByRole("button", { name: "Archive instead" })).toBeInTheDocument();
    expect(client.deleteRecipe).not.toHaveBeenCalled();

    await user.click(within(confirm).getByRole("button", { name: "Delete permanently" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(client.deleteRecipe).toHaveBeenCalledWith(7);
    expect(onNotify).toHaveBeenCalledWith("info", "Deleted Fabada asturiana.");
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
    expect(onNotify).toHaveBeenCalledWith("info", expect.stringContaining("Archived Fabada asturiana"));
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
    expect(onNotify).toHaveBeenLastCalledWith("info", "Restored Fabada asturiana.");
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
    expect(screen.getByRole("dialog", { name: "Fabada asturiana" })).toBeInTheDocument();
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

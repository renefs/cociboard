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
});

function renderModal() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  render(
    <QueryClientProvider client={queryClient}>
      <RecipeDetailsModal recipe={recipe} onClose={onClose} onNotify={onNotify} />
    </QueryClientProvider>,
  );
  return { invalidate };
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

  it("asks for confirmation with the usage count before deleting", async () => {
    const user = userEvent.setup();
    vi.mocked(client.getRecipeUsage).mockResolvedValue({ count: 3 });
    vi.mocked(client.deleteRecipe).mockResolvedValue(undefined);
    const { invalidate } = renderModal();

    await user.click(screen.getByRole("button", { name: "Delete" }));
    const confirm = await screen.findByRole("dialog", { name: "Delete Lentejas estofadas?" });
    expect(await within(confirm).findByText(/planned in/)).toHaveTextContent("planned in 3 meals");
    expect(client.deleteRecipe).not.toHaveBeenCalled();

    await user.click(within(confirm).getByRole("button", { name: "Delete recipe" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(client.deleteRecipe).toHaveBeenCalledWith(7);
    expect(onNotify).toHaveBeenCalledWith("info", "Deleted Lentejas estofadas.");
    const keys = invalidate.mock.calls.map(([filters]) => filters?.queryKey?.[0]);
    expect(keys).toEqual(expect.arrayContaining(["recipes", "week"]));
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
    await user.click(screen.getByRole("button", { name: "Delete recipe" }));
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

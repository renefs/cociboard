import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "../../api/client";
import { makeRecipe } from "../../test/fixtures";
import { renderWithQuery } from "../../test/utils";
import { RecipePanel } from "./RecipePanel";

vi.mock("../../api/client");

const lunch = makeRecipe({ id: 1, name: "Fabada asturiana" });
const dinner = makeRecipe({ id: 2, name: "Tortilla de espinacas", meal_type: "dinner" });

beforeEach(() => {
  vi.mocked(client.listRecipes).mockResolvedValue([lunch, dinner]);
});

function lastFilters() {
  const calls = vi.mocked(client.listRecipes).mock.calls;
  return calls[calls.length - 1]?.[0];
}

describe("RecipePanel", () => {
  it("lists recipes and the legend", async () => {
    renderWithQuery(<RecipePanel />);
    expect(await screen.findByRole("heading", { name: "Fabada asturiana" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Tortilla de espinacas" })).toBeInTheDocument();
    expect(screen.getByText("Legend")).toBeInTheDocument();
    expect(lastFilters()).toEqual({ slot: undefined, q: "", properties: [] });
  });

  it("filters by meal type through the slot parameter", async () => {
    const user = userEvent.setup();
    vi.mocked(client.listRecipes).mockImplementation((filters) =>
      Promise.resolve(filters?.slot === "dinner" ? [dinner] : [lunch, dinner]),
    );
    renderWithQuery(<RecipePanel />);
    await screen.findByRole("heading", { name: "Fabada asturiana" });

    const group = screen.getByRole("group", { name: "Meal type" });
    expect(within(group).getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
    await user.click(within(group).getByRole("button", { name: "Dinner" }));

    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "Fabada asturiana" })).not.toBeInTheDocument(),
    );
    expect(lastFilters()?.slot).toBe("dinner");
    expect(within(group).getByRole("button", { name: "Dinner" })).toHaveAttribute("aria-pressed", "true");
  });

  it("sends the search text", async () => {
    const user = userEvent.setup();
    renderWithQuery(<RecipePanel />);
    await screen.findByRole("heading", { name: "Fabada asturiana" });
    await user.type(screen.getByRole("searchbox", { name: "Search recipes" }), "chorizo");
    await waitFor(() => expect(lastFilters()?.q).toBe("chorizo"));
  });

  it("sends selected properties", async () => {
    const user = userEvent.setup();
    renderWithQuery(<RecipePanel />);
    await screen.findByRole("heading", { name: "Fabada asturiana" });
    await user.click(screen.getByText("Properties", { selector: "summary" }));
    const group = screen.getByRole("group", { name: "Filter by property" });
    await user.click(within(group).getByRole("button", { name: /Vegan/ }));
    await user.click(within(group).getByRole("button", { name: /Quick/ }));
    await waitFor(() => expect(lastFilters()?.properties).toEqual(["vegan", "quick"]));

    await user.click(within(group).getByRole("button", { name: /Vegan/ }));
    await waitFor(() => expect(lastFilters()?.properties).toEqual(["quick"]));
  });

  it("offers to add the first recipe when the catalogue is empty", async () => {
    vi.mocked(client.listRecipes).mockResolvedValue([]);
    renderWithQuery(<RecipePanel />);
    expect(await screen.findByText("Your recipe catalogue is empty.")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Add your first recipe" }));
    expect(await screen.findByRole("dialog", { name: "New recipe" })).toBeInTheDocument();
  });

  it("offers to clear filters when nothing matches", async () => {
    const user = userEvent.setup();
    vi.mocked(client.listRecipes).mockImplementation((filters) =>
      Promise.resolve(filters?.slot === "dinner" ? [] : [lunch, dinner]),
    );
    renderWithQuery(<RecipePanel />);
    await screen.findByRole("heading", { name: "Fabada asturiana" });
    await user.click(within(screen.getByRole("group", { name: "Meal type" })).getByRole("button", { name: "Dinner" }));
    expect(await screen.findByText("No recipes match your search or filters.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(await screen.findByRole("heading", { name: "Fabada asturiana" })).toBeInTheDocument();
    expect(screen.queryByText("No recipes match your search or filters.")).not.toBeInTheDocument();
  });

  it("shows loading skeletons first", () => {
    vi.mocked(client.listRecipes).mockReturnValue(new Promise(() => undefined));
    renderWithQuery(<RecipePanel />);
    expect(screen.getByTestId("recipe-skeleton")).toBeInTheDocument();
  });

  it("shows an error with retry", async () => {
    const user = userEvent.setup();
    vi.mocked(client.listRecipes).mockRejectedValueOnce(new Error("boom"));
    renderWithQuery(<RecipePanel />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Can't load the recipes.");
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("heading", { name: "Fabada asturiana" })).toBeInTheDocument();
  });
});

describe("RecipePanel variety features", () => {
  it("shows usage badges and a 'Best for variety' sort only when usage is provided", async () => {
    const user = userEvent.setup();
    const { unmount } = renderWithQuery(<RecipePanel />);
    await screen.findByRole("heading", { name: "Fabada asturiana" });
    expect(screen.queryByRole("button", { name: "Best for variety" })).not.toBeInTheDocument();
    unmount();

    renderWithQuery(<RecipePanel usage={new Map([[1, 2]])} proteinCounts={{ legumes: 2 }} />);
    await screen.findByRole("heading", { name: "Fabada asturiana" });
    expect(screen.getByTitle("Planned 2 times this week")).toBeInTheDocument();
    const order = () => screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(order()).toEqual(["Fabada asturiana", "Tortilla de espinacas"]);
    await user.click(screen.getByRole("button", { name: "Best for variety" }));
    expect(order()).toEqual(["Tortilla de espinacas", "Fabada asturiana"]);
    await user.click(screen.getByRole("button", { name: "A–Z" }));
    expect(order()).toEqual(["Fabada asturiana", "Tortilla de espinacas"]);
  });
});

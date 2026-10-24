import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "../../api/client";
import { makeRecipe } from "../../test/fixtures";
import { renderWithQuery } from "../../test/utils";
import { RecipePanel } from "./RecipePanel";

vi.mock("../../api/client");

const lunch = makeRecipe({ id: 1, name: "Lentejas estofadas" });
const dinner = makeRecipe({ id: 2, name: "Tortilla de patatas", meal_type: "dinner" });

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
    expect(await screen.findByRole("heading", { name: "Lentejas estofadas" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Tortilla de patatas" })).toBeInTheDocument();
    expect(screen.getByText("Legend")).toBeInTheDocument();
    expect(lastFilters()).toEqual({ slot: undefined, q: "", properties: [] });
  });

  it("filters by meal type through the slot parameter", async () => {
    const user = userEvent.setup();
    vi.mocked(client.listRecipes).mockImplementation((filters) =>
      Promise.resolve(filters?.slot === "dinner" ? [dinner] : [lunch, dinner]),
    );
    renderWithQuery(<RecipePanel />);
    await screen.findByRole("heading", { name: "Lentejas estofadas" });

    const group = screen.getByRole("group", { name: "Meal type" });
    expect(within(group).getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
    await user.click(within(group).getByRole("button", { name: "Dinner" }));

    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "Lentejas estofadas" })).not.toBeInTheDocument(),
    );
    expect(lastFilters()?.slot).toBe("dinner");
    expect(within(group).getByRole("button", { name: "Dinner" })).toHaveAttribute("aria-pressed", "true");
  });

  it("sends the search text", async () => {
    const user = userEvent.setup();
    renderWithQuery(<RecipePanel />);
    await screen.findByRole("heading", { name: "Lentejas estofadas" });
    await user.type(screen.getByRole("searchbox", { name: "Search recipes" }), "chorizo");
    await waitFor(() => expect(lastFilters()?.q).toBe("chorizo"));
  });

  it("sends selected properties", async () => {
    const user = userEvent.setup();
    renderWithQuery(<RecipePanel />);
    await screen.findByRole("heading", { name: "Lentejas estofadas" });
    await user.click(screen.getByText("Properties", { selector: "summary" }));
    const group = screen.getByRole("group", { name: "Filter by property" });
    await user.click(within(group).getByRole("button", { name: /Vegan/ }));
    await user.click(within(group).getByRole("button", { name: /Quick/ }));
    await waitFor(() => expect(lastFilters()?.properties).toEqual(["vegan", "quick"]));

    await user.click(within(group).getByRole("button", { name: /Vegan/ }));
    await waitFor(() => expect(lastFilters()?.properties).toEqual(["quick"]));
  });

  it("shows an empty state", async () => {
    vi.mocked(client.listRecipes).mockResolvedValue([]);
    renderWithQuery(<RecipePanel />);
    expect(await screen.findByText("No recipes match.")).toBeInTheDocument();
  });

  it("shows an error with retry", async () => {
    const user = userEvent.setup();
    vi.mocked(client.listRecipes).mockRejectedValueOnce(new Error("boom"));
    renderWithQuery(<RecipePanel />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load recipes.");
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("heading", { name: "Lentejas estofadas" })).toBeInTheDocument();
  });
});

describe("RecipePanel variety features", () => {
  it("shows usage badges and a 'Best for variety' sort only when usage is provided", async () => {
    const user = userEvent.setup();
    const { unmount } = renderWithQuery(<RecipePanel />);
    await screen.findByRole("heading", { name: "Lentejas estofadas" });
    expect(screen.queryByRole("button", { name: "Best for variety" })).not.toBeInTheDocument();
    unmount();

    renderWithQuery(<RecipePanel usage={new Map([[1, 2]])} proteinCounts={{ legumes: 2 }} />);
    await screen.findByRole("heading", { name: "Lentejas estofadas" });
    expect(screen.getByTitle("Planned 2 times this week")).toBeInTheDocument();
    const order = () => screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(order()).toEqual(["Lentejas estofadas", "Tortilla de patatas"]);
    await user.click(screen.getByRole("button", { name: "Best for variety" }));
    expect(order()).toEqual(["Tortilla de patatas", "Lentejas estofadas"]);
    await user.click(screen.getByRole("button", { name: "A–Z" }));
    expect(order()).toEqual(["Lentejas estofadas", "Tortilla de patatas"]);
  });
});

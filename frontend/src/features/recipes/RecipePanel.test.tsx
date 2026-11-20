import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "../../api/client";
import type { Recipe } from "../../api/types";
import { makeRecipe } from "../../test/fixtures";
import { renderWithQuery } from "../../test/utils";
import { RecipePanel } from "./RecipePanel";

vi.mock("../../api/client");

const lunch = makeRecipe({ id: 1, name: "Fabada asturiana" });
const dinner = makeRecipe({ id: 2, name: "Tortilla de espinacas", meal_type: "dinner" });

const archivedRecipe = makeRecipe({ id: 3, name: "Gazpacho viejo", archived: true });

// Archived recipes come from their own query; the other tests only see the active ones.
function serve(archived: Recipe[] = []) {
  vi.mocked(client.listRecipes).mockImplementation((filters) =>
    Promise.resolve(filters?.archived ? archived : [lunch, dinner]),
  );
}

beforeEach(() => serve());

function lastFilters() {
  const calls = vi.mocked(client.listRecipes).mock.calls.filter(([filters]) => !filters?.archived);
  return calls[calls.length - 1]?.[0];
}

describe("RecipePanel", () => {
  it("lists recipes and the legend", async () => {
    renderWithQuery(<RecipePanel />);
    expect(await screen.findByRole("heading", { name: "Fabada asturiana" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Tortilla de espinacas" })).toBeInTheDocument();
    expect(screen.getByText("Legend")).toBeInTheDocument();
    expect(lastFilters()).toEqual({ slot: undefined, q: "", properties: [], favourite: false });
  });

  it("filters by meal type through the slot parameter", async () => {
    const user = userEvent.setup();
    vi.mocked(client.listRecipes).mockImplementation((filters) =>
      Promise.resolve(filters?.archived ? [] : filters?.slot === "dinner" ? [dinner] : [lunch, dinner]),
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

describe("RecipePanel archived recipes", () => {
  it("hides the archived section when nothing is archived", async () => {
    renderWithQuery(<RecipePanel />);
    await screen.findByRole("heading", { name: "Fabada asturiana" });
    expect(screen.queryByRole("button", { name: /Archived/ })).not.toBeInTheDocument();
  });

  it("shows an Archived (N) toggle that lists archived recipes with Restore, not as cards", async () => {
    const user = userEvent.setup();
    serve([archivedRecipe]);
    vi.mocked(client.updateRecipe).mockResolvedValue({ ...archivedRecipe, archived: false });
    const onNotify = vi.fn();
    renderWithQuery(<RecipePanel onNotify={onNotify} />);
    const toggle = await screen.findByRole("button", { name: "Archived (1)" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Gazpacho viejo")).not.toBeInTheDocument();

    await user.click(toggle);
    const list = await screen.findByRole("list", { name: "Archived recipes" });
    expect(within(list).getByText("Gazpacho viejo")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Gazpacho viejo" })).not.toBeInTheDocument();

    await user.click(within(list).getByRole("button", { name: "Restore Gazpacho viejo" }));
    await waitFor(() => expect(client.updateRecipe).toHaveBeenCalledWith(3, { archived: false }, undefined));
    expect(onNotify).toHaveBeenCalledWith("info", "Restored Gazpacho viejo.");
  });

  it("opens the details of an archived recipe, offering Restore", async () => {
    const user = userEvent.setup();
    serve([archivedRecipe]);
    renderWithQuery(<RecipePanel />);
    await user.click(await screen.findByRole("button", { name: "Archived (1)" }));
    await user.click(await screen.findByRole("button", { name: "Gazpacho viejo" }));
    const dialog = await screen.findByRole("dialog", { name: "Gazpacho viejo" });
    expect(within(dialog).getByRole("note")).toHaveTextContent("Archived");
    expect(within(dialog).getByRole("button", { name: "Restore" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Archive" })).not.toBeInTheDocument();
  });

  it("applies the search to archived recipes", async () => {
    const user = userEvent.setup();
    serve([archivedRecipe]);
    renderWithQuery(<RecipePanel />);
    await user.click(await screen.findByRole("button", { name: "Archived (1)" }));
    await user.type(screen.getByRole("searchbox", { name: "Search recipes" }), "xyz");
    await waitFor(() => {
      const calls = vi.mocked(client.listRecipes).mock.calls;
      expect(calls.some(([f]) => f?.archived && f.q === "xyz")).toBe(true);
    });
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

describe("RecipePanel announcements", () => {
  it("does not make the list a live region, so card changes aren't read out", async () => {
    const { container } = renderWithQuery(<RecipePanel usage={new Map([[1, 1]])} />);
    await screen.findByRole("heading", { name: "Fabada asturiana" });
    const list = container.querySelector(".recipe-list");
    expect(list).not.toBeNull();
    expect(list?.hasAttribute("aria-live")).toBe(false);
    expect(list?.closest("[aria-live]")).toBeNull();
    expect(list?.querySelector("[aria-live], [role='status']")).toBeNull();
  });

  it("announces only the number of results, through a separate status region", async () => {
    const user = userEvent.setup();
    vi.mocked(client.listRecipes).mockImplementation((filters) =>
      Promise.resolve(filters?.archived ? [] : filters?.slot === "dinner" ? [dinner] : [lunch, dinner]),
    );
    renderWithQuery(<RecipePanel />);
    await screen.findByRole("heading", { name: "Fabada asturiana" });
    expect(screen.getByTestId("recipe-results-count")).toHaveTextContent("2 recipes");
    expect(screen.getByTestId("recipe-results-count")).toHaveAttribute("role", "status");

    await user.click(within(screen.getByRole("group", { name: "Meal type" })).getByRole("button", { name: "Dinner" }));
    await waitFor(() => expect(screen.getByTestId("recipe-results-count")).toHaveTextContent("1 recipe"));
  });
});

describe("RecipePanel favourites", () => {
  const starred = makeRecipe({ id: 2, name: "Tortilla de espinacas", meal_type: "dinner", favourite: true });

  it("filters to favourites through the favourite parameter and explains an empty result", async () => {
    const user = userEvent.setup();
    vi.mocked(client.listRecipes).mockImplementation((filters) =>
      Promise.resolve(filters?.archived ? [] : filters?.favourite ? [] : [lunch, starred]),
    );
    renderWithQuery(<RecipePanel />);
    await screen.findByRole("heading", { name: "Fabada asturiana" });
    const chip = screen.getByRole("button", { name: "Favourites" });
    expect(chip).toHaveAttribute("aria-pressed", "false");

    await user.click(chip);

    expect(chip).toHaveAttribute("aria-pressed", "true");
    expect(await screen.findByText(/No favourites yet/)).toBeInTheDocument();
    expect(lastFilters()?.favourite).toBe(true);

    await user.type(screen.getByRole("searchbox"), "zzz");
    expect(await screen.findByText("No recipes match your search or filters.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByRole("button", { name: "Favourites" })).toHaveAttribute("aria-pressed", "false");
  });

  it("combines the favourites filter with the meal-type filter", async () => {
    const user = userEvent.setup();
    renderWithQuery(<RecipePanel />);
    await screen.findByRole("heading", { name: "Fabada asturiana" });
    await user.click(screen.getByRole("button", { name: "Favourites" }));
    await user.click(within(screen.getByRole("group", { name: "Meal type" })).getByRole("button", { name: "Dinner" }));
    await waitFor(() => expect(lastFilters()).toMatchObject({ slot: "dinner", favourite: true }));
  });

  it("stars a recipe at once, sends one PATCH and rolls back with a toast when it fails", async () => {
    const user = userEvent.setup();
    const onNotify = vi.fn();
    let fail!: (reason: Error) => void;
    vi.mocked(client.updateRecipe).mockReturnValue(
      new Promise<Recipe>((_, reject) => {
        fail = reject;
      }),
    );
    renderWithQuery(<RecipePanel onNotify={onNotify} />);
    await screen.findByRole("heading", { name: "Fabada asturiana" });

    await user.click(screen.getByRole("button", { name: "Add Fabada asturiana to favourites" }));

    const pressed = await screen.findByRole("button", { name: "Remove Fabada asturiana from favourites" });
    expect(pressed).toHaveAttribute("aria-pressed", "true"); // before any response
    expect(client.updateRecipe).toHaveBeenCalledWith(1, { favourite: true });

    await act(async () => fail(new Error("offline")));
    expect(await screen.findByRole("button", { name: "Add Fabada asturiana to favourites" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(onNotify).toHaveBeenCalledWith("error", "Couldn't update the favourites. Fabada asturiana was put back as it was.");
  });

  it("sends the toggles one at a time", async () => {
    const user = userEvent.setup();
    const finishers: ((recipe: Recipe) => void)[] = [];
    vi.mocked(client.updateRecipe).mockImplementation(
      () => new Promise<Recipe>((resolve) => finishers.push(resolve)),
    );
    renderWithQuery(<RecipePanel />);
    await screen.findByRole("heading", { name: "Fabada asturiana" });

    await user.click(screen.getByRole("button", { name: "Add Fabada asturiana to favourites" }));
    await user.click(screen.getByRole("button", { name: "Add Tortilla de espinacas to favourites" }));

    await waitFor(() => expect(client.updateRecipe).toHaveBeenCalledTimes(1));
    await act(async () => finishers[0]?.(lunch));
    await waitFor(() => expect(client.updateRecipe).toHaveBeenCalledTimes(2));
    expect(client.updateRecipe).toHaveBeenLastCalledWith(2, { favourite: true });
  });
});

describe("RecipePanel history", () => {
  it("offers 'Not made lately' and sorts never-planned first, then the oldest", async () => {
    const user = userEvent.setup();
    const recent = makeRecipe({ id: 1, name: "Arroz", last_planned_on: "2026-11-18" });
    const old = makeRecipe({ id: 2, name: "Bocata", last_planned_on: "2026-09-01" });
    const never = makeRecipe({ id: 3, name: "Zarzuela" });
    vi.mocked(client.listRecipes).mockImplementation((filters) =>
      Promise.resolve(filters?.archived ? [] : [recent, old, never]),
    );
    renderWithQuery(<RecipePanel />);
    await screen.findByRole("heading", { name: "Arroz" });
    const order = () => screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(order()).toEqual(["Arroz", "Bocata", "Zarzuela"]);

    await user.click(screen.getByRole("button", { name: "Not made lately" }));

    expect(order()).toEqual(["Zarzuela", "Bocata", "Arroz"]);
    expect(screen.getByRole("button", { name: "Not made lately" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Never planned")).toBeInTheDocument();
  });
});

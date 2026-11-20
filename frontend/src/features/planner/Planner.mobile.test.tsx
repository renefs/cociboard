import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "../../api/client";
import type { ShoppingList, WeekPlan } from "../../api/types";
import { makePlan, makeRecipe } from "../../test/fixtures";
import { stubMatchMedia } from "../../test/matchMedia";
import { renderWithQuery } from "../../test/utils";
import { Planner } from "./Planner";

vi.mock("../../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof client>()),
  getWeek: vi.fn(),
  getCandidates: vi.fn(),
  listRecipes: vi.fn(),
  getShoppingList: vi.fn(),
  assignSlot: vi.fn(),
}));

const NOW = new Date(2026, 9, 28); // Wednesday
const SUNDAY = new Date(2026, 10, 1);
const WEEK = "2026-10-26";
const NEXT_WEEK = "2026-11-02";

const lentils = makeRecipe({ id: 1, name: "Lentejas estofadas", meal_type: "lunch", prep_minutes: 60 });
const tortilla = makeRecipe({
  id: 2,
  name: "Tortilla de patatas",
  meal_type: "dinner",
  prep_minutes: 25,
  ingredients: ["Huevos", "Patatas"],
});
const salad = makeRecipe({ id: 3, name: "Ensalada mixta", meal_type: "both", prep_minutes: null, ingredients: ["Tomate"] });

/** The fake server: week start -> plan (weeks without an entry are empty). */
let plans: Record<string, WeekPlan>;

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  plans = { [WEEK]: makePlan(WEEK), [NEXT_WEEK]: makePlan(NEXT_WEEK) };
  vi.mocked(client.getWeek).mockImplementation((week) => Promise.resolve(plans[week] ?? makePlan(week)));
  vi.mocked(client.listRecipes).mockResolvedValue([lentils, tortilla, salad]);
  vi.mocked(client.getCandidates).mockResolvedValue([]);
  const list: ShoppingList = {
    week_start: WEEK,
    items: [{ key: "huevos", name: "Huevos", checked: false, in_pantry: false, meals: [] }],
    extras: [],
  };
  vi.mocked(client.getShoppingList).mockResolvedValue(list);
});

const tabBar = () => screen.getByRole("navigation", { name: "Main sections" });
/** The Today view; recipe names also exist (hidden) in the recipe panel. */
const todayView = () => within(document.querySelector<HTMLElement>('[data-view="today"]') as HTMLElement);
const tab = (name: string) => within(tabBar()).getByRole("button", { name: new RegExp(name) });

describe("Planner on a phone", () => {
  it.each([false, true])("offers the Share menu in the week toolbar (narrow: %s)", async (narrow) => {
    stubMatchMedia({ narrow });
    const user = userEvent.setup();
    renderWithQuery(<Planner now={NOW} />);
    if (narrow) await user.click(tab("Week"));
    // The button is disabled until the week has loaded.
    await waitFor(() => expect(screen.getByRole("button", { name: /Share/ })).toBeEnabled());
    const trigger = screen.getByRole("button", { name: /Share/ });
    expect(within(screen.getByRole("group", { name: "Week actions" })).getByRole("button", { name: /Share/ })).toBe(trigger);
    await user.click(trigger);
    expect(screen.getByRole("button", { name: "Print the menu" })).toBeDisabled();
    expect(screen.getByText(/Plan at least one meal/)).toBeInTheDocument();
  });

  it("has no tab bar on desktop and shows everything", async () => {
    stubMatchMedia({ narrow: false });
    renderWithQuery(<Planner now={NOW} />);
    await screen.findByRole("group", { name: "Wednesday lunch" });
    expect(screen.queryByRole("navigation", { name: "Main sections" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Weekly planner" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Recipes" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Today" })).not.toBeInTheDocument();
  });

  it("ignores ?view= on desktop and does not write it", async () => {
    stubMatchMedia({ narrow: false });
    window.history.replaceState(null, "", "/?view=shopping");
    renderWithQuery(<Planner now={NOW} />);
    await screen.findByRole("group", { name: "Wednesday lunch" });
    expect(screen.getByRole("heading", { name: "Weekly planner" })).toBeVisible();
    expect(window.location.search).toBe("?view=shopping");
  });

  it("renders the tab bar on Today and switches views", async () => {
    stubMatchMedia({ narrow: true });
    const user = userEvent.setup();
    renderWithQuery(<Planner now={NOW} />);

    expect(tab("Today")).toHaveAttribute("aria-current", "page");
    expect(tab("Week")).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("heading", { name: "Today" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Weekly planner" })).not.toBeInTheDocument();

    await user.click(tab("Week"));
    const heading = screen.getByRole("heading", { name: "Weekly planner" });
    expect(heading).toBeVisible();
    expect(heading).toHaveFocus();
    expect(tab("Week")).toHaveAttribute("aria-current", "page");
    expect(tab("Today")).not.toHaveAttribute("aria-current");
    expect(screen.queryByRole("heading", { name: "Today" })).not.toBeInTheDocument();
    expect(window.location.search).toBe("?view=week");

    await user.click(tab("Recipes"));
    expect(screen.getByRole("heading", { name: "Recipes" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Recipes" })).toHaveFocus();
    expect(screen.queryByRole("heading", { name: "Weekly planner" })).not.toBeInTheDocument();
    expect(window.location.search).toBe("?view=recipes");

    await user.click(tab("Today"));
    expect(window.location.search).toBe("");
  });

  it("uses replaceState so tabs do not add history entries, and keeps ?week=", async () => {
    stubMatchMedia({ narrow: true });
    window.history.replaceState(null, "", `/?week=${NEXT_WEEK}`);
    const user = userEvent.setup();
    const before = window.history.length;
    renderWithQuery(<Planner now={NOW} />);
    await user.click(tab("Shopping"));
    expect(window.location.search).toBe(`?week=${NEXT_WEEK}&view=shopping`);
    expect(window.history.length).toBe(before);
  });

  it("opens on the view named in the URL", async () => {
    stubMatchMedia({ narrow: true });
    window.history.replaceState(null, "", "/?view=recipes");
    renderWithQuery(<Planner now={NOW} />);
    expect(tab("Recipes")).toHaveAttribute("aria-current", "page");
    expect(await screen.findByRole("heading", { name: "Lentejas estofadas" })).toBeVisible();
  });

  it("Add on a recipe switches to the Week tab with select mode active", async () => {
    stubMatchMedia({ narrow: true });
    const user = userEvent.setup();
    renderWithQuery(<Planner now={NOW} />);
    await user.click(tab("Recipes"));

    await user.click(await screen.findByRole("button", { name: "Add Tortilla de patatas to the plan" }));

    expect(tab("Week")).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("heading", { name: "Weekly planner" })).toBeVisible();
    expect(screen.getByText(/Choose a slot for/)).toBeVisible();
    await screen.findByRole("group", { name: "Wednesday dinner" });
    expect(document.querySelectorAll("[data-select-target]").length).toBeGreaterThan(0);

    // Cancelling stays on the Week tab.
    const banner = document.querySelector<HTMLElement>(".select-banner") as HTMLElement;
    await user.click(within(banner).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText(/Choose a slot for/)).not.toBeInTheDocument();
    expect(tab("Week")).toHaveAttribute("aria-current", "page");
  });

  it("Add then tapping a slot places the recipe", async () => {
    stubMatchMedia({ narrow: true });
    const user = userEvent.setup();
    vi.mocked(client.assignSlot).mockImplementation(() =>
      Promise.resolve((plans[WEEK] = makePlan(WEEK, { "2:dinner": tortilla }))),
    );
    renderWithQuery(<Planner now={NOW} />);
    await user.click(tab("Recipes"));
    await user.click(await screen.findByRole("button", { name: "Add Tortilla de patatas to the plan" }));
    await user.click(await screen.findByRole("button", { name: "Add dinner on Wednesday" }));
    expect(client.assignSlot).toHaveBeenCalledWith(WEEK, 2, "dinner", { recipe_id: 2, note: null });
  });

  it("the toolbar's Shopping list button switches to the Shopping tab", async () => {
    stubMatchMedia({ narrow: true });
    const user = userEvent.setup();
    renderWithQuery(<Planner now={NOW} />);
    await user.click(tab("Week"));
    await screen.findByRole("group", { name: "Wednesday lunch" });
    await user.click(screen.getByRole("button", { name: /Shopping list/ }));
    expect(tab("Shopping")).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(await screen.findByText("Huevos")).toBeVisible();
  });
});

describe("Today view", () => {
  it("shows today's and tomorrow's meals", async () => {
    stubMatchMedia({ narrow: true });
    plans[WEEK] = makePlan(
      WEEK,
      { "2:lunch": lentils, "3:lunch": salad },
      undefined,
      { specials: { "2:dinner": "eating_out" }, notes: { "2:lunch": "Double batch", "2:dinner": "Ana's birthday" } },
    );
    const user = userEvent.setup();
    renderWithQuery(<Planner now={NOW} />);

    await todayView().findByText("Note: Double batch");
    const lunches = todayView().getAllByRole("heading", { name: "Lunch", level: 3 });
    const lunchCard = within(lunches[0]?.closest("article") as HTMLElement);
    expect(lunchCard.getByText("Lentejas estofadas")).toBeVisible();
    expect(lunchCard.getByText("60 min")).toBeVisible();
    expect(lunchCard.getByRole("list", { name: "Ingredients" })).toHaveTextContent("Chorizo");
    expect(lunchCard.getByText("Note: Double batch")).toBeVisible();

    const dinners = todayView().getAllByRole("heading", { name: "Dinner", level: 3 });
    const todayDinner = within(dinners[0]?.closest("article") as HTMLElement);
    expect(todayDinner.getByText("Eating out")).toBeVisible();
    expect(todayDinner.getByText("Note: Ana's birthday")).toBeVisible();

    // Tomorrow: Ensalada at lunch, nothing for dinner.
    expect(screen.getByRole("heading", { name: /Tomorrow/ })).toBeVisible();
    expect(todayView().getByText("Ensalada mixta")).toBeVisible();
    expect(todayView().getByText("Nothing planned yet.")).toBeVisible();

    // Tapping a recipe opens the details.
    await user.click(todayView().getByRole("button", { name: "View details of Lentejas estofadas" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("shows an empty state with a way to the Week tab", async () => {
    stubMatchMedia({ narrow: true });
    const user = userEvent.setup();
    renderWithQuery(<Planner now={NOW} />);
    expect(await screen.findByText("Nothing planned for today.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Plan the week" }));
    expect(tab("Week")).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("heading", { name: "Weekly planner" })).toHaveFocus();
  });

  it("reads the real current week, not the browsed one", async () => {
    stubMatchMedia({ narrow: true });
    plans[WEEK] = makePlan(WEEK, { "2:lunch": lentils });
    window.history.replaceState(null, "", "/?week=2026-12-07");
    renderWithQuery(<Planner now={NOW} />);
    expect(await todayView().findByText("Lentejas estofadas")).toBeVisible();
    expect(client.getWeek).toHaveBeenCalledWith(WEEK, expect.anything());
  });

  it("shows Monday of next week as tomorrow on a Sunday", async () => {
    stubMatchMedia({ narrow: true });
    plans[WEEK] = makePlan(WEEK, { "6:dinner": tortilla });
    plans[NEXT_WEEK] = makePlan(NEXT_WEEK, { "0:lunch": salad });
    renderWithQuery(<Planner now={SUNDAY} />);
    expect(await todayView().findByText("Tortilla de patatas")).toBeVisible();
    expect(await todayView().findByText("Ensalada mixta")).toBeVisible();
    expect(screen.getByRole("heading", { name: /Tomorrow/ })).toHaveTextContent("Monday");
  });

  it("offers Retry when the week cannot be loaded", async () => {
    stubMatchMedia({ narrow: true });
    vi.mocked(client.getWeek).mockRejectedValueOnce(new Error("offline"));
    vi.mocked(client.getWeek).mockRejectedValueOnce(new Error("offline"));
    const user = userEvent.setup();
    renderWithQuery(<Planner now={NOW} />);
    const alerts = await screen.findAllByRole("alert");
    expect(alerts[0]).toHaveTextContent("Can't load today's meals");
    plans[WEEK] = makePlan(WEEK, { "2:lunch": lentils });
    await user.click(within(alerts[0] as HTMLElement).getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(todayView().getByText("Lentejas estofadas")).toBeVisible());
  });
});

describe("Shopping tab", () => {
  it("renders the list inline, not in a dialog", async () => {
    stubMatchMedia({ narrow: true });
    const user = userEvent.setup();
    renderWithQuery(<Planner now={NOW} />);
    await user.click(tab("Shopping"));
    expect(screen.getByRole("heading", { name: /Shopping list · / })).toHaveFocus();
    expect(await screen.findByRole("checkbox", { name: /Huevos/ })).toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(client.getShoppingList).toHaveBeenCalledWith(WEEK, expect.anything());
  });
});

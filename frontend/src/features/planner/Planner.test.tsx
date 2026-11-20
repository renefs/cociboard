import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "../../api/client";
import type { Candidate, MealSlot, VarietyReport, WeekPlan } from "../../api/types";
import type { Recipe } from "../../api/types";
import { makePlan, makeRecipe } from "../../test/fixtures";
import { renderWithQuery } from "../../test/utils";
import { Planner } from "./Planner";
import { fitsSlot } from "./slots";

vi.mock("../../api/client", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../api/client")>();
  return {
    ...original,
    getWeek: vi.fn(),
    getCandidates: vi.fn(),
    suggestWeek: vi.fn(),
    getHouseholdSettings: vi.fn(),
    copyWeek: vi.fn(),
    clearWeek: vi.fn(),
    replaceWeek: vi.fn(),
    listRecipes: vi.fn(),
    assignSlot: vi.fn(),
    clearSlot: vi.fn(),
    moveSlot: vi.fn(),
    setSlotNote: vi.fn(),
  };
});

const NOW = new Date(2026, 9, 28);
const WEEK = "2026-10-26";
const lentils = makeRecipe({ id: 1, name: "Lentejas estofadas", meal_type: "lunch" });
const tortilla = makeRecipe({ id: 2, name: "Tortilla de patatas", meal_type: "dinner", ingredients: ["Huevos", "Patatas"] });
const salad = makeRecipe({ id: 3, name: "Ensalada mixta", meal_type: "both", ingredients: ["Tomate", "Lechuga"] });

/** A fake server: `serverPlan` is what the next getWeek returns. */
let serverPlan: WeekPlan;

function candidate(recipe: Recipe, extra: Partial<Candidate> = {}): Candidate {
  return {
    recipe,
    score_delta: 0,
    reason: "Fits the week",
    reason_code: "fits_week",
    reason_params: {},
    good_pick: false,
    ...extra,
  };
}

/** Candidates the fake server offers for a slot (everything that fits, in the given order). */
let candidateOrder: (slot: MealSlot) => Candidate[];

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  serverPlan = makePlan(WEEK);
  candidateOrder = (slot) =>
    [lentils, tortilla, salad].filter((r) => fitsSlot(r.meal_type, slot)).map((r) => candidate(r));
  vi.mocked(client.listRecipes).mockResolvedValue([lentils, tortilla, salad]);
  vi.mocked(client.getHouseholdSettings).mockRejectedValue(new Error("no settings in this test"));
  vi.mocked(client.getWeek).mockImplementation(() => Promise.resolve(serverPlan));
  vi.mocked(client.getCandidates).mockImplementation((_week, _day, slot) =>
    Promise.resolve(candidateOrder(slot)),
  );
});

function serverReturns(plan: WeekPlan) {
  serverPlan = plan;
  return plan;
}

/** The toast (the drag-and-drop live region also has role "status"). */
async function findToast(): Promise<HTMLElement> {
  return waitFor(() => {
    const toast = document.querySelector<HTMLElement>(".toast");
    if (!toast) throw new Error("no toast");
    return toast;
  });
}

async function renderPlanner() {
  renderWithQuery(<Planner now={NOW} />);
  await screen.findByRole("group", { name: "Monday lunch" });
}

describe("Planner tap-to-assign", () => {
  it("opens a picker from an empty slot and assigns the chosen recipe", async () => {
    const user = userEvent.setup();
    vi.mocked(client.assignSlot).mockImplementation(() =>
      Promise.resolve(serverReturns(makePlan(WEEK, { "0:lunch": lentils }))),
    );
    await renderPlanner();

    await user.click(screen.getByRole("button", { name: "Add lunch on Monday" }));
    const dialog = await screen.findByRole("dialog", { name: /Add lunch on Monday/ });
    await user.click(await within(dialog).findByRole("button", { name: /Choose Lentejas estofadas/ }));

    expect(client.assignSlot).toHaveBeenCalledWith(WEEK, 0, "lunch", { recipe_id: 1, note: null });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const slot = screen.getByRole("group", { name: "Monday lunch" });
    expect(within(slot).getByText("Lentejas estofadas")).toBeInTheDocument();
  });

  it("only offers recipes that fit the slot and supports search", async () => {
    const user = userEvent.setup();
    await renderPlanner();

    await user.click(screen.getByRole("button", { name: "Add lunch on Monday" }));
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByRole("heading", { name: "Lentejas estofadas" });
    expect(within(dialog).getByRole("heading", { name: "Ensalada mixta" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("heading", { name: "Tortilla de patatas" })).not.toBeInTheDocument();

    await user.type(within(dialog).getByRole("searchbox"), "lechuga");
    expect(within(dialog).queryByRole("heading", { name: "Lentejas estofadas" })).not.toBeInTheDocument();
    expect(within(dialog).getByRole("heading", { name: "Ensalada mixta" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("offers only dinner-compatible recipes for a dinner slot", async () => {
    const user = userEvent.setup();
    await renderPlanner();
    await user.click(screen.getByRole("button", { name: "Add dinner on Friday" }));
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByRole("heading", { name: "Tortilla de patatas" });
    expect(within(dialog).queryByRole("heading", { name: "Lentejas estofadas" })).not.toBeInTheDocument();
  });
});

describe("Planner filled slots", () => {
  beforeEach(() => {
    serverPlan = makePlan(WEEK, { "2:dinner": tortilla });
  });

  it("removes a recipe with the × button, optimistically", async () => {
    const user = userEvent.setup();
    vi.mocked(client.clearSlot).mockImplementation(() => Promise.resolve(serverReturns(makePlan(WEEK))));
    await renderPlanner();
    await user.click(screen.getByRole("button", { name: "Remove Tortilla de patatas from Wednesday dinner" }));
    expect(client.clearSlot).toHaveBeenCalledWith(WEEK, 2, "dinner");
    expect(screen.getByRole("button", { name: "Add dinner on Wednesday" })).toBeInTheDocument();
  });

  it("opens actions on tap: view details, replace and remove", async () => {
    const user = userEvent.setup();
    vi.mocked(client.clearSlot).mockImplementation(() => Promise.resolve(serverReturns(makePlan(WEEK))));
    await renderPlanner();

    await user.click(screen.getByRole("button", { name: /^Tortilla de patatas, Wednesday dinner/ }));
    let dialog = await screen.findByRole("dialog", { name: "Tortilla de patatas" });
    await user.click(within(dialog).getByRole("button", { name: "View details" }));
    expect(within(screen.getByRole("dialog")).getByRole("list", { name: "Ingredients" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Back" }));

    await user.click(screen.getByRole("button", { name: "Replace" }));
    dialog = await screen.findByRole("dialog", { name: /Replace dinner on Wednesday/ });
    await user.click(within(dialog).getByRole("button", { name: "Close" }));

    await user.click(screen.getByRole("button", { name: /^Tortilla de patatas, Wednesday dinner/ }));
    await user.click(await screen.findByRole("button", { name: "Remove" }));
    expect(client.clearSlot).toHaveBeenCalledWith(WEEK, 2, "dinner");
  });
});

describe("Planner select mode", () => {
  it("places a recipe from its Add button by tapping a slot, and Escape cancels", async () => {
    const user = userEvent.setup();
    vi.mocked(client.assignSlot).mockImplementation(() =>
      Promise.resolve(serverReturns(makePlan(WEEK, { "3:dinner": tortilla }))),
    );
    await renderPlanner();

    await user.click(await screen.findByRole("button", { name: "Add Tortilla de patatas to the plan" }));
    expect(screen.getByText(/Choose a slot for/)).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Thursday lunch" })).toHaveClass("slot--blocked");
    await user.click(screen.getByRole("button", { name: "Add dinner on Thursday" }));

    expect(client.assignSlot).toHaveBeenCalledWith(WEEK, 3, "dinner", { recipe_id: 2, note: null });
    expect(screen.queryByText(/Choose a slot for/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add Ensalada mixta to the plan" }));
    expect(screen.getByText(/Choose a slot for/)).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByText(/Choose a slot for/)).not.toBeInTheDocument();
  });
});

describe("Planner optimistic updates", () => {
  it("rolls back and shows an error when saving fails", async () => {
    const user = userEvent.setup();
    vi.mocked(client.assignSlot).mockRejectedValue(new client.ApiError(500, "boom"));
    await renderPlanner();

    await user.click(screen.getByRole("button", { name: "Add lunch on Monday" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(await within(dialog).findByRole("button", { name: /Choose Lentejas estofadas/ }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/undone/);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Add lunch on Monday" })).toBeInTheDocument(),
    );
  });
});

const SAME_RECIPE_VARIETY: VarietyReport = {
  score: 75,
  filled_slots: 2,
  protein_counts: { legumes: 2 },
  issues: [
    {
      kind: "repeated_recipe",
      severity: "warning",
      message: "Lentejas estofadas is planned 2 times this week.",
      params: { recipe: "Lentejas estofadas", count: 2 },
      slots: [
        { day: 0, slot: "lunch" },
        { day: 1, slot: "lunch" },
      ],
    },
  ],
};

describe("Planner week navigation", () => {
  function weekPlans() {
    vi.mocked(client.getWeek).mockImplementation((week) => Promise.resolve(makePlan(week)));
  }

  it("shows the date range and steps to the previous and next week, updating the URL", async () => {
    const user = userEvent.setup();
    weekPlans();
    await renderPlanner();
    expect(screen.getByText("26 Oct – 1 Nov 2026")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "This week" })).toBeDisabled();
    expect(window.location.search).toBe("");

    await user.click(screen.getByRole("button", { name: "Next week" }));
    expect(window.location.search).toBe("?week=2026-11-02");
    expect(screen.getByText("2 Nov – 8 Nov 2026")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: /Monday 2 Nov/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "This week" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Previous week" }));
    await user.click(screen.getByRole("button", { name: "Previous week" }));
    expect(window.location.search).toBe("?week=2026-10-19");

    await user.click(screen.getByRole("button", { name: "This week" }));
    expect(window.location.search).toBe("");
    expect(screen.getByText("26 Oct – 1 Nov 2026")).toBeInTheDocument();
  });

  it("opens the week from the URL, normalising a mid-week date to its Monday", async () => {
    weekPlans();
    window.history.replaceState(null, "", "/?week=2026-11-05");
    await renderPlanner();
    expect(screen.getByText("2 Nov – 8 Nov 2026")).toBeInTheDocument();
    expect(window.location.search).toBe("?week=2026-11-02");
    expect(client.getWeek).toHaveBeenCalledWith("2026-11-02", expect.anything());
  });

  it("ignores an invalid week parameter", async () => {
    weekPlans();
    window.history.replaceState(null, "", "/?week=soon");
    await renderPlanner();
    expect(screen.getByText("26 Oct – 1 Nov 2026")).toBeInTheDocument();
    expect(window.location.search).toBe("");
  });

  it("follows the browser's Back button", async () => {
    const user = userEvent.setup();
    weekPlans();
    await renderPlanner();
    await user.click(screen.getByRole("button", { name: "Next week" }));
    expect(screen.getByText("2 Nov – 8 Nov 2026")).toBeInTheDocument();
    window.history.back();
    await waitFor(() => expect(screen.getByText("26 Oct – 1 Nov 2026")).toBeInTheDocument());
  });

  it("prefetches the neighbouring weeks", async () => {
    weekPlans();
    await renderPlanner();
    await waitFor(() => {
      const weeks = vi.mocked(client.getWeek).mock.calls.map((call) => call[0]);
      expect(weeks).toEqual(expect.arrayContaining(["2026-10-19", "2026-10-26", "2026-11-02"]));
    });
  });
});

describe("Planner suggest, clear and undo", () => {
  it("says when preferences left slots empty, and says nothing extra without preferences", async () => {
    const user = userEvent.setup();
    serverPlan = makePlan(WEEK, { "0:lunch": lentils });
    const filled = makePlan(WEEK, { "0:lunch": lentils, "1:dinner": tortilla });
    vi.mocked(client.suggestWeek).mockResolvedValue(filled);
    vi.mocked(client.getHouseholdSettings).mockResolvedValue({
      required_properties: ["vegan"],
      avoided_properties: [],
      max_meals_per_protein: 4,
      min_vegetarian_meals: 2,
      min_fish_meals: 2,
      lunch_time: "14:00",
      dinner_time: "21:00",
    });
    await renderPlanner();
    await waitFor(() => expect(client.getHouseholdSettings).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));

    await user.click(screen.getByRole("button", { name: "Suggest" }));
    expect(await findToast()).toHaveTextContent(
      "Filled 1 slot. Some slots stayed empty: no recipe matches your household preferences.",
    );
  });

  it("fills empty slots, reports how many, and Undo restores the previous plan", async () => {
    const user = userEvent.setup();
    serverPlan = makePlan(WEEK, { "0:lunch": lentils });
    const filled = makePlan(WEEK, { "0:lunch": lentils, "1:dinner": tortilla, "2:lunch": salad });
    vi.mocked(client.suggestWeek).mockResolvedValue(filled);
    vi.mocked(client.replaceWeek).mockResolvedValue(serverPlan);
    await renderPlanner();

    await user.click(screen.getByRole("button", { name: "Suggest" }));
    expect(client.suggestWeek).toHaveBeenCalledWith(WEEK);
    const toast = await findToast();
    expect(toast).toHaveTextContent("Filled 2 slots");
    expect(within(screen.getByRole("group", { name: "Tuesday dinner" })).getByText("Tortilla de patatas")).toBeInTheDocument();

    await user.click(within(toast).getByRole("button", { name: "Undo" }));
    expect(client.replaceWeek).toHaveBeenCalledWith(WEEK, [{ day: 0, slot: "lunch", recipe_id: 1, special: null, note: null }]);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Add dinner on Tuesday" })).toBeInTheDocument(),
    );
    expect(await screen.findByText("Restored the previous plan.")).toBeInTheDocument();
  });

  it("copies last week into the empty slots and Undo restores the previous plan", async () => {
    const user = userEvent.setup();
    serverPlan = makePlan(WEEK, { "0:lunch": lentils });
    const before = serverPlan;
    const copied = makePlan(WEEK, { "0:lunch": lentils, "1:dinner": tortilla, "2:lunch": salad });
    vi.mocked(client.copyWeek).mockResolvedValue({
      plan: copied,
      copied: 2,
      skipped_archived: 1,
      source_meals: 4,
    });
    vi.mocked(client.replaceWeek).mockResolvedValue(before);
    await renderPlanner();

    await user.click(screen.getByRole("button", { name: "Copy last week" }));
    expect(client.copyWeek).toHaveBeenCalledWith(WEEK, "2026-10-19");
    const toast = await findToast();
    expect(toast).toHaveTextContent("Copied 2 meals from last week.");
    expect(toast).toHaveTextContent("1 was skipped because its recipe is archived.");
    expect(within(screen.getByRole("group", { name: "Tuesday dinner" })).getByText("Tortilla de patatas")).toBeInTheDocument();

    await user.click(within(toast).getByRole("button", { name: "Undo" }));
    expect(client.replaceWeek).toHaveBeenCalledWith(WEEK, [{ day: 0, slot: "lunch", recipe_id: 1, special: null, note: null }]);
    expect(await screen.findByText("Restored the previous plan.")).toBeInTheDocument();
  });

  it.each([
    [{ copied: 0, skipped_archived: 0, source_meals: 0 }, "Last week has no meals."],
    [{ copied: 0, skipped_archived: 0, source_meals: 3 }, "There are no empty slots to copy into."],
    [{ copied: 0, skipped_archived: 2, source_meals: 2 }, "Nothing copied: 2 meals use archived recipes."],
  ])("explains a copy that changed nothing (%j)", async (result, message) => {
    const user = userEvent.setup();
    vi.mocked(client.copyWeek).mockResolvedValue({ plan: makePlan(WEEK), ...result });
    await renderPlanner();
    await user.click(screen.getByRole("button", { name: "Copy last week" }));
    const toast = await findToast();
    expect(toast).toHaveTextContent(message);
    expect(within(toast).queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
  });

  it("shows an error toast when copying fails", async () => {
    const user = userEvent.setup();
    vi.mocked(client.copyWeek).mockRejectedValue(new client.ApiError(500, "boom"));
    await renderPlanner();
    await user.click(screen.getByRole("button", { name: "Copy last week" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Couldn't update the week/);
  });

  it("disables Copy last week when every slot is filled", async () => {
    const placements: Record<string, Recipe> = {};
    for (let day = 0; day < 7; day++) {
      placements[`${day}:lunch`] = salad;
      placements[`${day}:dinner`] = salad;
    }
    serverPlan = makePlan(WEEK, placements);
    await renderPlanner();
    expect(screen.getByRole("button", { name: "Copy last week" })).toBeDisabled();
  });

  it("says so when nothing could be filled", async () => {
    const user = userEvent.setup();
    vi.mocked(client.suggestWeek).mockResolvedValue(makePlan(WEEK));
    await renderPlanner();
    await user.click(screen.getByRole("button", { name: "Suggest" }));
    expect(await screen.findByText("No empty slots could be filled.")).toBeInTheDocument();
  });

  it("disables Clear week when the week is empty and Suggest when it is full", async () => {
    await renderPlanner();
    expect(screen.getByRole("button", { name: "Clear week" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Suggest" })).toBeEnabled();
  });

  it("disables Suggest when every slot is filled", async () => {
    const placements: Record<string, Recipe> = {};
    for (let day = 0; day < 7; day++) {
      placements[`${day}:lunch`] = salad;
      placements[`${day}:dinner`] = salad;
    }
    serverPlan = makePlan(WEEK, placements);
    await renderPlanner();
    expect(screen.getByRole("button", { name: "Suggest" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Clear week" })).toBeEnabled();
  });

  it("asks for confirmation before clearing and supports Undo", async () => {
    const user = userEvent.setup();
    serverPlan = makePlan(WEEK, { "0:lunch": lentils, "2:dinner": tortilla });
    const before = serverPlan;
    vi.mocked(client.clearWeek).mockResolvedValue(makePlan(WEEK));
    vi.mocked(client.replaceWeek).mockResolvedValue(before);
    await renderPlanner();

    await user.click(screen.getByRole("button", { name: "Clear week" }));
    const dialog = await screen.findByRole("dialog", { name: "Clear this week?" });
    expect(dialog).toHaveTextContent("2 meals");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(client.clearWeek).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Clear week" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Clear week" }));
    expect(client.clearWeek).toHaveBeenCalledWith(WEEK);
    const toast = await findToast();
    expect(toast).toHaveTextContent("Cleared 2 meals");
    expect(screen.queryByText("Lentejas estofadas", { selector: ".slot-name" })).not.toBeInTheDocument();

    await user.click(within(toast).getByRole("button", { name: "Undo" }));
    expect(client.replaceWeek).toHaveBeenCalledWith(WEEK, [
      { day: 0, slot: "lunch", recipe_id: 1, special: null, note: null },
      { day: 2, slot: "dinner", recipe_id: 2, special: null, note: null },
    ]);
    expect(await screen.findByText("Lentejas estofadas", { selector: ".slot-name" })).toBeInTheDocument();
  });

  it("shows an error toast when suggesting fails", async () => {
    const user = userEvent.setup();
    vi.mocked(client.suggestWeek).mockRejectedValue(new client.ApiError(500, "boom"));
    await renderPlanner();
    await user.click(screen.getByRole("button", { name: "Suggest" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Couldn't update the week/);
  });
});

describe("Planner variety", () => {
  beforeEach(() => {
    serverPlan = makePlan(WEEK, { "0:lunch": lentils, "1:lunch": lentils }, SAME_RECIPE_VARIETY);
  });

  it("shows the score badge and expands to the issues", async () => {
    const user = userEvent.setup();
    await renderPlanner();
    const badge = screen.getByRole("button", { name: /^75 Variety: 1 warning/ });
    expect(badge).toHaveAttribute("aria-expanded", "false");
    await user.click(badge);
    expect(badge).toHaveAttribute("aria-expanded", "true");
    const panel = screen.getByRole("region", { name: "Variety" });
    expect(within(panel).getByText(/Lentejas estofadas is planned 2 times/)).toBeVisible();
  });

  it("marks warning slots with an accessible indicator and highlights an issue's slots", async () => {
    const user = userEvent.setup();
    await renderPlanner();
    const monday = screen.getByRole("group", { name: "Monday lunch" });
    expect(within(monday).getByText(/Variety warning: Lentejas estofadas is planned 2 times/)).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Wednesday lunch" })).not.toHaveClass("slot--warning");

    await user.click(screen.getByRole("button", { name: /^\d+ Variety/ }));
    const issue = within(screen.getByRole("region", { name: "Variety" })).getByRole("button", {
      name: /Lentejas estofadas is planned 2 times/,
    });
    expect(issue).toHaveAttribute("aria-pressed", "false");
    await user.click(issue);
    expect(issue).toHaveAttribute("aria-pressed", "true");
    expect(monday).toHaveClass("slot--highlight");
    expect(screen.getByRole("group", { name: "Tuesday lunch" })).toHaveClass("slot--highlight");
    expect(screen.getByRole("group", { name: "Wednesday lunch" })).not.toHaveClass("slot--highlight");
    await user.click(issue);
    expect(monday).not.toHaveClass("slot--highlight");
  });

  it("shows usage counts in the recipe panel and sorts by variety on request", async () => {
    const user = userEvent.setup();
    await renderPlanner();
    const card = await screen.findByRole("article", { name: "Lentejas estofadas" });
    expect(within(card).getByTitle("Planned 2 times this week")).toBeInTheDocument();
    expect(within(screen.getByRole("article", { name: "Ensalada mixta" })).queryByTitle(/this week/)).not.toBeInTheDocument();

    const order = () => screen.getAllByRole("article").map((a) => a.getAttribute("aria-label"));
    expect(order()).toEqual(["Lentejas estofadas", "Tortilla de patatas", "Ensalada mixta"]);
    await user.click(screen.getByRole("button", { name: "Best for variety" }));
    expect(order()).toEqual(["Tortilla de patatas", "Ensalada mixta", "Lentejas estofadas"]);
  });
});

describe("Planner picker ordering", () => {
  it("keeps the server's order, shows the reason and marks good picks", async () => {
    const user = userEvent.setup();
    candidateOrder = () => [
      candidate(salad, { score_delta: 4, reason_code: "new_protein", good_pick: true }),
      candidate(lentils, { score_delta: 0 }),
      candidate(tortilla, {
        score_delta: -15,
        reason_code: "twice_in_a_row",
        reason_params: { protein: "eggs" },
      }),
    ];
    await renderPlanner();
    await user.click(screen.getByRole("button", { name: "Add lunch on Monday" }));
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByRole("heading", { name: "Ensalada mixta" });
    expect(client.getCandidates).toHaveBeenCalledWith(WEEK, 0, "lunch", expect.anything());

    const names = within(dialog).getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(names).toEqual(["Ensalada mixta", "Lentejas estofadas", "Tortilla de patatas"]);
    expect(within(dialog).getByText("New protein this week")).toBeInTheDocument();
    expect(within(dialog).getByText("Eggs twice in a row")).toBeInTheDocument();
    expect(within(dialog).getAllByText("Good pick")).toHaveLength(1);
    const first = within(dialog).getByRole("article", { name: "Ensalada mixta" });
    expect(within(first).getByText("Good pick")).toBeInTheDocument();

    // searching keeps the order of what remains
    await user.type(within(dialog).getByRole("searchbox"), "a");
    expect(within(dialog).getAllByRole("heading", { level: 3 })[0]).toHaveTextContent("Ensalada mixta");
  });

  it("marks recipes outside the household preferences and announces only the count", async () => {
    const user = userEvent.setup();
    candidateOrder = () => [
      candidate(salad, { score_delta: 4, good_pick: true }),
      candidate(tortilla, { score_delta: 0, reason_code: "outside_preferences" }),
    ];
    await renderPlanner();
    await user.click(screen.getByRole("button", { name: "Add lunch on Monday" }));
    const dialog = await screen.findByRole("dialog");
    const outside = await within(dialog).findByRole("article", { name: "Tortilla de patatas" });
    expect(within(outside).getByText("Outside your household preferences")).toBeInTheDocument();
    expect(within(outside).queryByText("Good pick")).not.toBeInTheDocument();
    expect(within(dialog).getByTestId("picker-results-count")).toHaveTextContent("2 recipes");
    expect(dialog.querySelector(".picker-list")).not.toHaveAttribute("aria-live");
  });
});

describe("Planner loading and error states", () => {
  it("shows a skeleton grid while the week loads", () => {
    vi.mocked(client.getWeek).mockReturnValue(new Promise(() => undefined));
    renderWithQuery(<Planner now={NOW} />);
    expect(screen.getByTestId("week-skeleton")).toBeInTheDocument();
  });

  it("shows an offline state with Retry that recovers", async () => {
    const user = userEvent.setup();
    let offline = true;
    vi.mocked(client.getWeek).mockImplementation((week) =>
      offline && week === WEEK ? Promise.reject(new TypeError("Failed to fetch")) : Promise.resolve(serverPlan),
    );
    renderWithQuery(<Planner now={NOW} />);
    const alert = await screen.findByText(/Can't load the week/);
    expect(alert).toBeInTheDocument();
    offline = false;
    await user.click(within(alert.closest("[role=alert]") as HTMLElement).getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("group", { name: "Monday lunch" })).toBeInTheDocument();
  });

  it("keeps a polite live region mounted for toasts", async () => {
    await renderPlanner();
    expect(document.querySelector(".toast-region")).toHaveAttribute("aria-live", "polite");
  });
});

describe("Planner special meals and notes", () => {
  it("sets a slot to a special meal from the picker chips", async () => {
    const user = userEvent.setup();
    vi.mocked(client.assignSlot).mockImplementation(() =>
      Promise.resolve(serverReturns(makePlan(WEEK, {}, undefined, { specials: { "0:dinner": "eating_out" } }))),
    );
    await renderPlanner();

    await user.click(screen.getByRole("button", { name: "Add dinner on Monday" }));
    const dialog = await screen.findByRole("dialog", { name: /Add dinner on Monday/ });
    const chips = within(within(dialog).getByRole("group", { name: "Or plan something else" })).getAllByRole("button");
    expect(chips.map((chip) => chip.textContent?.trim())).toEqual([
      expect.stringContaining("Eating out"),
      expect.stringContaining("Leftovers"),
      expect.stringContaining("Free"),
    ]);
    await user.click(within(dialog).getByRole("button", { name: /Eating out/ }));

    expect(client.assignSlot).toHaveBeenCalledWith(WEEK, 0, "dinner", { special: "eating_out", note: null });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const slot = screen.getByRole("group", { name: "Monday dinner" });
    expect(within(slot).getByText("Eating out")).toBeInTheDocument();
    expect(await findToast()).toHaveTextContent("Monday dinner set to Eating out.");
  });

  it("offers the specials when replacing and keeps the slot's note", async () => {
    const user = userEvent.setup();
    serverReturns(makePlan(WEEK, { "0:lunch": lentils }, undefined, { notes: { "0:lunch": "Double batch" } }));
    vi.mocked(client.assignSlot).mockImplementation(() =>
      Promise.resolve(
        serverReturns(makePlan(WEEK, {}, undefined, { specials: { "0:lunch": "leftovers" }, notes: { "0:lunch": "Double batch" } })),
      ),
    );
    await renderPlanner();

    await user.click(screen.getByRole("button", { name: /^Lentejas estofadas, .*Monday lunch/ }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Replace" }));
    await user.click(await screen.findByRole("button", { name: /Leftovers/ }));

    expect(client.assignSlot).toHaveBeenCalledWith(WEEK, 0, "lunch", { special: "leftovers", note: "Double batch" });
  });

  it("shows specials and notes with an accessible name, and lists no recipe details action for a special", async () => {
    const user = userEvent.setup();
    serverReturns(
      makePlan(WEEK, {}, undefined, { specials: { "1:dinner": "free" }, notes: { "1:dinner": "Ana's birthday" } }),
    );
    await renderPlanner();

    const slot = screen.getByRole("group", { name: "Tuesday dinner" });
    expect(within(slot).getByText("Ana's birthday")).toHaveClass("slot-note");
    await user.click(within(slot).getByRole("button", { name: /^Free, Ana's birthday, Tuesday dinner\./ }));
    const dialog = await screen.findByRole("dialog", { name: "Free" });
    expect(within(dialog).queryByRole("button", { name: "View details" })).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Edit note" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Replace" })).toBeInTheDocument();
  });

  it("adds a note to a recipe through the note form", async () => {
    const user = userEvent.setup();
    serverReturns(makePlan(WEEK, { "0:lunch": lentils }));
    vi.mocked(client.setSlotNote).mockImplementation(() =>
      Promise.resolve(serverReturns(makePlan(WEEK, { "0:lunch": lentils }, undefined, { notes: { "0:lunch": "Double batch" } }))),
    );
    await renderPlanner();

    await user.click(screen.getByRole("button", { name: /^Lentejas estofadas, Monday lunch/ }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Add note" }));
    const form = await screen.findByRole("dialog", { name: "Add note" });
    expect(within(form).queryByRole("button", { name: "Remove note" })).not.toBeInTheDocument();
    const input = within(form).getByRole("textbox", { name: /Note/ });
    expect(input).toHaveAttribute("maxlength", "120");
    await user.type(input, "  Double batch ");
    await user.click(within(form).getByRole("button", { name: "Save note" }));

    expect(client.setSlotNote).toHaveBeenCalledWith(WEEK, 0, "lunch", "Double batch");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const slot = screen.getByRole("group", { name: "Monday lunch" });
    expect(within(slot).getByText("Double batch")).toBeInTheDocument();
  });

  it("edits and removes a note", async () => {
    const user = userEvent.setup();
    serverReturns(makePlan(WEEK, {}, undefined, { specials: { "2:lunch": "eating_out" }, notes: { "2:lunch": "Pizza" } }));
    vi.mocked(client.setSlotNote).mockImplementation((_week, _day, _slot, note) =>
      Promise.resolve(
        serverReturns(makePlan(WEEK, {}, undefined, { specials: { "2:lunch": "eating_out" }, ...(note ? { notes: { "2:lunch": note } } : {}) })),
      ),
    );
    await renderPlanner();

    await user.click(screen.getByRole("button", { name: /^Eating out, .*Wednesday lunch/ }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Edit note" }));
    let form = await screen.findByRole("dialog", { name: "Edit note" });
    const input = within(form).getByRole("textbox", { name: /Note/ });
    expect(input).toHaveValue("Pizza");
    await user.clear(input);
    await user.type(input, "Sushi");
    await user.click(within(form).getByRole("button", { name: "Save note" }));
    expect(client.setSlotNote).toHaveBeenLastCalledWith(WEEK, 2, "lunch", "Sushi");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /^Eating out, .*Wednesday lunch/ }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Edit note" }));
    form = await screen.findByRole("dialog", { name: "Edit note" });
    await user.click(within(form).getByRole("button", { name: "Remove note" }));
    expect(client.setSlotNote).toHaveBeenLastCalledWith(WEEK, 2, "lunch", null);
    await waitFor(() => expect(screen.queryByText("Sushi")).not.toBeInTheDocument());
  });

  it("saves a blank note as no note", async () => {
    const user = userEvent.setup();
    serverReturns(makePlan(WEEK, { "0:lunch": lentils }));
    vi.mocked(client.setSlotNote).mockImplementation(() => Promise.resolve(serverPlan));
    await renderPlanner();
    await user.click(screen.getByRole("button", { name: /^Lentejas estofadas, Monday lunch/ }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Add note" }));
    const form = await screen.findByRole("dialog", { name: "Add note" });
    await user.type(within(form).getByRole("textbox", { name: /Note/ }), "   ");
    await user.click(within(form).getByRole("button", { name: "Save note" }));
    expect(client.setSlotNote).toHaveBeenCalledWith(WEEK, 0, "lunch", null);
  });

  it("removes a special meal like a recipe", async () => {
    const user = userEvent.setup();
    serverReturns(makePlan(WEEK, {}, undefined, { specials: { "0:lunch": "free" } }));
    vi.mocked(client.clearSlot).mockImplementation(() => Promise.resolve(serverReturns(makePlan(WEEK))));
    await renderPlanner();
    await user.click(screen.getByRole("button", { name: "Remove Free from Monday lunch" }));
    expect(client.clearSlot).toHaveBeenCalledWith(WEEK, 0, "lunch");
  });

  it("does not let Suggest or Copy run on a full week made of specials, and Undo restores them", async () => {
    const user = userEvent.setup();
    const all: Partial<Record<`${number}:${MealSlot}`, "free">> = {};
    for (let day = 0; day < 7; day++) {
      all[`${day}:lunch`] = "free";
      all[`${day}:dinner`] = "free";
    }
    serverReturns(makePlan(WEEK, {}, undefined, { specials: all, notes: { "0:lunch": "hi" } }));
    vi.mocked(client.clearWeek).mockImplementation(() => Promise.resolve(serverReturns(makePlan(WEEK))));
    const before = makePlan(WEEK, {}, undefined, { specials: all, notes: { "0:lunch": "hi" } });
    vi.mocked(client.replaceWeek).mockResolvedValue(before);
    await renderPlanner();
    expect(screen.getByRole("button", { name: /Suggest/ })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Clear week" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Clear week" }));
    await user.click(within(await findToast()).getByRole("button", { name: "Undo" }));
    const fills = vi.mocked(client.replaceWeek).mock.calls[0]?.[1] ?? [];
    expect(fills).toHaveLength(14);
    expect(fills[0]).toEqual({ day: 0, slot: "lunch", recipe_id: null, special: "free", note: "hi" });
  });
});

describe("Planner leftovers from batch cooking", () => {
  const cocido = makeRecipe({
    id: 4,
    name: "Cocido madrileño",
    meal_type: "both",
    properties: ["batch_cooking"],
  });

  it("plans leftovers with the recipe name as note in the next slot, in one request", async () => {
    const user = userEvent.setup();
    serverReturns(makePlan(WEEK, { "1:dinner": cocido }));
    vi.mocked(client.assignSlot).mockImplementation(() =>
      Promise.resolve(
        serverReturns(
          makePlan(WEEK, { "1:dinner": cocido }, undefined, {
            specials: { "2:lunch": "leftovers" },
            notes: { "2:lunch": "Cocido madrileño" },
          }),
        ),
      ),
    );
    await renderPlanner();

    await user.click(screen.getByRole("button", { name: /^Cocido madrileño, Tuesday dinner/ }));
    const dialog = await screen.findByRole("dialog", { name: "Cocido madrileño" });
    await user.click(within(dialog).getByRole("button", { name: "Save leftovers for the next meal" }));

    expect(client.assignSlot).toHaveBeenCalledTimes(1);
    expect(client.assignSlot).toHaveBeenCalledWith(WEEK, 2, "lunch", {
      special: "leftovers",
      note: "Cocido madrileño",
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await findToast()).toHaveTextContent("Leftovers planned for Wednesday lunch.");
    const slot = screen.getByRole("group", { name: "Wednesday lunch" });
    expect(within(slot).getByText("Cocido madrileño")).toBeInTheDocument();
  });

  const plainLunch = makeRecipe({ id: 5, name: "Gazpacho", meal_type: "both", properties: ["vegan"] });

  it("is not offered when the next slot is taken, for other recipes, or after Sunday dinner", async () => {
    const user = userEvent.setup();
    serverReturns(makePlan(WEEK, { "0:lunch": cocido, "0:dinner": tortilla, "1:lunch": plainLunch, "6:dinner": cocido }));
    await renderPlanner();
    const offered = async (name: RegExp) => {
      await user.click(screen.getByRole("button", { name }));
      const dialog = await screen.findByRole("dialog");
      const found = within(dialog).queryByRole("button", { name: "Save leftovers for the next meal" }) !== null;
      await user.click(within(dialog).getByRole("button", { name: "Close" }));
      return found;
    };
    expect(await offered(/^Cocido madrileño, Monday lunch/)).toBe(false); // Monday dinner is taken
    expect(await offered(/^Gazpacho, Tuesday lunch/)).toBe(false); // not batch cooking
    expect(await offered(/^Cocido madrileño, Sunday dinner/)).toBe(false); // no next slot
  });
});

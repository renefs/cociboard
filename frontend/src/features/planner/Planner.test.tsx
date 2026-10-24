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
    clearWeek: vi.fn(),
    replaceWeek: vi.fn(),
    listRecipes: vi.fn(),
    assignSlot: vi.fn(),
    clearSlot: vi.fn(),
    moveSlot: vi.fn(),
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

    expect(client.assignSlot).toHaveBeenCalledWith(WEEK, 0, "lunch", 1);
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

    expect(client.assignSlot).toHaveBeenCalledWith(WEEK, 3, "dinner", 2);
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
    expect(client.replaceWeek).toHaveBeenCalledWith(WEEK, [{ day: 0, slot: "lunch", recipe_id: 1 }]);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Add dinner on Tuesday" })).toBeInTheDocument(),
    );
    expect(await screen.findByText("Restored the previous plan.")).toBeInTheDocument();
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
      { day: 0, slot: "lunch", recipe_id: 1 },
      { day: 2, slot: "dinner", recipe_id: 2 },
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
    const badge = screen.getByRole("button", { name: /Variety score 75 out of 100. 1 warning/ });
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

    await user.click(screen.getByRole("button", { name: /Variety score/ }));
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

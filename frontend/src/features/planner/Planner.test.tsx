import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "../../api/client";
import type { WeekPlan } from "../../api/types";
import { makePlan, makeRecipe } from "../../test/fixtures";
import { renderWithQuery } from "../../test/utils";
import { Planner } from "./Planner";

vi.mock("../../api/client", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../api/client")>();
  return {
    ...original,
    getWeek: vi.fn(),
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

beforeEach(() => {
  serverPlan = makePlan(WEEK);
  vi.mocked(client.listRecipes).mockResolvedValue([lentils, tortilla, salad]);
  vi.mocked(client.getWeek).mockImplementation(() => Promise.resolve(serverPlan));
});

function serverReturns(plan: WeekPlan) {
  serverPlan = plan;
  return plan;
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

import { DndContext, useSensor, useSensors } from "@dnd-kit/core";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { makePlan, makeRecipe } from "../../test/fixtures";
import { PROTEIN_META } from "../recipes/recipeMeta";
import { MouseAndPenSensor, POINTER_ACTIVATION } from "./sensors";
import { WeekGrid } from "./WeekGrid";

function Harness({ children }: { children: React.ReactNode }) {
  const sensors = useSensors(useSensor(MouseAndPenSensor, { activationConstraint: POINTER_ACTIVATION }));
  return <DndContext sensors={sensors}>{children}</DndContext>;
}

const NOW = new Date(2026, 9, 28); // Wednesday of the week starting 2026-10-26

function renderGrid(plan = makePlan(), props: Partial<React.ComponentProps<typeof WeekGrid>> = {}) {
  const onActivate = vi.fn();
  const onRemove = vi.fn();
  render(
    <Harness>
      <WeekGrid plan={plan} now={NOW} onActivate={onActivate} onRemove={onRemove} {...props} />
    </Harness>,
  );
  return { onActivate, onRemove };
}

describe("WeekGrid", () => {
  it("renders 7 days with a lunch and a dinner slot each (14 slots)", () => {
    renderGrid();
    const slots = screen.getAllByRole("group", { name: /^\w+day (lunch|dinner)$/ });
    expect(slots).toHaveLength(14);
    expect(screen.getByRole("group", { name: "Monday lunch" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Sunday dinner" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Add lunch on / })).toHaveLength(7);
    expect(screen.getAllByRole("button", { name: /^Add dinner on / })).toHaveLength(7);
  });

  it("shows day names with dates and highlights today", () => {
    renderGrid();
    expect(screen.getByRole("heading", { name: /Monday 26 Oct/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Sunday 1 Nov/ })).toBeInTheDocument();
    const today = screen.getByRole("region", { name: "Wednesday 28 Oct" });
    expect(today).toHaveAttribute("aria-current", "date");
    expect(today).toHaveClass("day--today");
    expect(within(today).getByText("Today")).toBeInTheDocument();
    expect(screen.getAllByText("Today")).toHaveLength(1);
  });

  it("shows assigned recipes with a meta line and a remove button", async () => {
    const user = userEvent.setup();
    const recipe = makeRecipe({ name: "Fabada asturiana" });
    const { onRemove, onActivate } = renderGrid(makePlan("2026-10-26", { "1:lunch": recipe }));
    const slot = screen.getByRole("group", { name: "Tuesday lunch" });
    expect(within(slot).getByText("Fabada asturiana")).toBeInTheDocument();
    expect(within(slot).queryByRole("img")).not.toBeInTheDocument();
    expect(within(slot).queryByRole("button", { name: /^Add lunch/ })).not.toBeInTheDocument();

    await user.click(within(slot).getByRole("button", { name: "Remove Fabada asturiana from Tuesday lunch" }));
    expect(onRemove).toHaveBeenCalledWith(1, "lunch");
    expect(onActivate).not.toHaveBeenCalled();

    await user.click(within(slot).getByRole("button", { name: /^Fabada asturiana, Tuesday lunch/ }));
    expect(onActivate).toHaveBeenCalledWith(1, "lunch");
  });

  it("marks planned archived recipes, which still open their actions", async () => {
    const user = userEvent.setup();
    const recipe = makeRecipe({ name: "Gazpacho viejo", archived: true });
    const { onActivate } = renderGrid(makePlan("2026-10-26", { "1:lunch": recipe }));
    const slot = screen.getByRole("group", { name: "Tuesday lunch" });
    expect(within(slot).getByText("Archived")).toBeInTheDocument();
    const body = within(slot).getByRole("button", { name: /^Gazpacho viejo, archived, Tuesday lunch/ });
    await user.click(body);
    expect(onActivate).toHaveBeenCalledWith(1, "lunch");
    const plain = makeRecipe({ id: 2, name: "Tortilla" });
    renderGrid(makePlan("2026-10-26", { "2:lunch": plain }));
    expect(within(screen.getAllByRole("group", { name: "Wednesday lunch" })[1]!).queryByText("Archived")).not.toBeInTheDocument();
  });

  it("keeps the visible text first in the accessible name: name, Archived mark, note (WCAG 2.5.3)", () => {
    const archived = makeRecipe({ id: 1, name: "Gazpacho viejo", archived: true, meal_type: "both" });
    renderGrid(
      makePlan("2026-10-26", { "0:lunch": archived }, undefined, {
        notes: { "0:lunch": "last of it", "0:dinner": "Pizza place" },
        specials: { "0:dinner": "eating_out" },
      }),
    );
    expect(
      within(screen.getByRole("group", { name: "Monday lunch" })).getByRole("button", {
        name: /^Gazpacho viejo, archived, last of it, Monday lunch\./,
      }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("group", { name: "Monday dinner" })).getByRole("button", {
        name: /^Eating out, Pizza place, Monday dinner\./,
      }),
    ).toBeInTheDocument();
  });

  it("dims incompatible slots with a hint while a recipe is being placed", () => {
    renderGrid(makePlan(), { selecting: makeRecipe({ meal_type: "dinner" }) });
    const lunch = screen.getByRole("group", { name: "Monday lunch" });
    expect(lunch).toHaveClass("slot--blocked");
    expect(within(lunch).getByText("Not for lunch")).toBeInTheDocument();
    const dinner = screen.getByRole("group", { name: "Monday dinner" });
    expect(dinner).toHaveClass("slot--pulse");
    // An empty target is marked "empty" so select mode scrolls to it before filled ones.
    expect(dinner).toHaveAttribute("data-select-target", "empty");
  });

  it("marks a filled compatible slot as a replace target", () => {
    const plan = makePlan("2026-10-26", { "0:dinner": makeRecipe({ id: 2, name: "Tortilla", meal_type: "dinner" }) });
    renderGrid(plan, { selecting: makeRecipe({ meal_type: "dinner" }) });
    expect(screen.getAllByRole("group", { name: "Monday dinner" })[0]).toHaveAttribute("data-select-target", "true");
  });
});

describe("WeekGrid layout", () => {
  it("shows the protein as a coloured dot with its name, and the prep time, instead of emoji", () => {
    const recipe = makeRecipe({ name: "Merluza a la vasca", protein: "fish", prep_minutes: 35, properties: ["quick"] });
    renderGrid(makePlan("2026-10-26", { "1:lunch": recipe }));
    const slot = screen.getByRole("group", { name: "Tuesday lunch" });
    const meta = slot.querySelector(".slot-meta") as HTMLElement;
    expect(within(meta).getByText("Fish")).toBeInTheDocument();
    expect(within(meta).getByText("35 min")).toBeInTheDocument();
    const dot = meta.querySelector<HTMLElement>(".protein-dot");
    expect(dot).toHaveAttribute("aria-hidden", "true");
    expect(dot?.style.getPropertyValue("--protein-color")).toBe(PROTEIN_META.fish.color);
    expect(dot?.style.getPropertyValue("--protein-color-dark")).toBe(PROTEIN_META.fish.darkColor);
    // Meal-type and property emoji stay in the recipe details only.
    expect(slot).not.toHaveTextContent("⚡");
    expect(slot).not.toHaveTextContent("☀");
  });

  it("uses the short protein label on the slot card, with the full one as its tooltip", () => {
    const recipe = makeRecipe({ name: "Risotto", protein: "none" });
    renderGrid(makePlan("2026-10-26", { "1:lunch": recipe }));
    const meta = screen.getByRole("group", { name: "Tuesday lunch" }).querySelector(".slot-meta") as HTMLElement;
    const label = within(meta).getByText("No protein");
    expect(label).toHaveAttribute("title", "No main protein");
    expect(within(meta).queryByText("No main protein")).not.toBeInTheDocument();
  });

  it("leaves the time out when the recipe has none, and keeps the meta line out of the button name", () => {
    const recipe = makeRecipe({ name: "Gazpacho", prep_minutes: null });
    renderGrid(makePlan("2026-10-26", { "1:lunch": recipe }));
    const slot = screen.getByRole("group", { name: "Tuesday lunch" });
    expect(slot.querySelector(".slot-time")).toBeNull();
    const button = within(slot).getByRole("button", { name: /^Gazpacho, Tuesday lunch/ });
    expect(button).not.toHaveTextContent("Legumes");
  });

  it("shows no meta line for a special meal", () => {
    renderGrid(makePlan("2026-10-26", {}, undefined, { specials: { "0:dinner": "eating_out" } }));
    expect(screen.getByRole("group", { name: "Monday dinner" }).querySelector(".slot-meta")).toBeNull();
  });

  it("has a presentational row-label column, aria-hidden, with Lunch and Dinner", () => {
    const { container } = render(
      <Harness>
        <WeekGrid plan={makePlan()} now={NOW} onActivate={vi.fn()} onRemove={vi.fn()} />
      </Harness>,
    );
    const rows = container.querySelector(".week-rows");
    expect(rows).toHaveAttribute("aria-hidden", "true");
    expect(rows).toHaveTextContent("Lunch");
    expect(rows).toHaveTextContent("Dinner");
  });

  it("keeps the day section order: row labels first, then each day with its lunch and dinner", () => {
    const { container } = render(
      <Harness>
        <WeekGrid plan={makePlan()} now={NOW} onActivate={vi.fn()} onRemove={vi.fn()} />
      </Harness>,
    );
    const grid = container.querySelector(".week-grid") as HTMLElement;
    expect(Array.from(grid.children).map((child) => child.tagName)).toEqual(["DIV", ...Array(7).fill("SECTION")]);
    const first = grid.querySelector("section") as HTMLElement;
    expect(Array.from(first.children).map((child) => child.tagName + "." + child.className.split(" ")[0])).toEqual([
      "H3.day-head",
      "DIV.slot",
      "DIV.slot",
    ]);
  });

  it("gives the day heading an abbreviated weekday and the day number for the phone list, hidden from assistive technology", () => {
    renderGrid();
    const heading = screen.getByRole("heading", { name: /Wednesday 28 Oct/ });
    expect(heading.querySelector(".day-abbr")).toHaveTextContent("Wed");
    expect(heading.querySelector(".day-abbr")).toHaveAttribute("aria-hidden", "true");
    expect(heading.querySelector(".day-num")).toHaveTextContent("28");
    expect(heading.querySelector(".day-num")).toHaveAttribute("aria-hidden", "true");
  });

  it("marks a slot with a Sun or Moon icon for the phone list", () => {
    renderGrid();
    const lunch = screen.getByRole("group", { name: "Monday lunch" });
    expect(lunch.querySelector(".slot-icon")).toHaveAttribute("aria-hidden", "true");
    expect(lunch).toHaveClass("slot--lunch");
    expect(screen.getByRole("group", { name: "Monday dinner" })).toHaveClass("slot--dinner");
  });

  it("shows a variety warning as an icon with the same accessible text, inside the card", () => {
    const recipe = makeRecipe({ name: "Paella" });
    const warnings = new Map([["0:lunch", ["Meat three days in a row."]]]);
    renderGrid(makePlan("2026-10-26", { "0:lunch": recipe }), { warnings });
    const slot = screen.getByRole("group", { name: "Monday lunch" });
    expect(slot).toHaveClass("slot--warning");
    const marker = slot.querySelector(".slot-warning") as HTMLElement;
    expect(marker).toHaveAttribute("title", "Meat three days in a row.");
    expect(marker).toHaveTextContent("Variety warning: Meat three days in a row.");
    expect(marker.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(slot.querySelector(".slot-recipe")).toContainElement(marker);
  });
});

describe("WeekGrid special meals and notes", () => {
  it("renders a special meal with its icon, label and a remove button", async () => {
    const user = userEvent.setup();
    const { onRemove, onActivate } = renderGrid(
      makePlan("2026-10-26", {}, undefined, { specials: { "2:dinner": "leftovers" } }),
    );
    const slot = screen.getByRole("group", { name: "Wednesday dinner" });
    expect(slot).toHaveClass("slot--special", "slot--filled");
    expect(within(slot).getByText("Leftovers")).toBeInTheDocument();
    expect(within(slot).queryByRole("button", { name: /^Add dinner/ })).not.toBeInTheDocument();
    await user.click(within(slot).getByRole("button", { name: /^Leftovers, Wednesday dinner/ }));
    expect(onActivate).toHaveBeenCalledWith(2, "dinner");
    await user.click(within(slot).getByRole("button", { name: "Remove Leftovers from Wednesday dinner" }));
    expect(onRemove).toHaveBeenCalledWith(2, "dinner");
  });

  it("shows a note as a muted truncated line with the full text in the accessible name", () => {
    const long = "Bring the big pot and the good wine for Ana's birthday dinner with everyone";
    renderGrid(
      makePlan("2026-10-26", { "0:lunch": makeRecipe({ id: 1, name: "Paella", meal_type: "both" }) }, undefined, {
        notes: { "0:lunch": long },
      }),
    );
    const slot = screen.getByRole("group", { name: "Monday lunch" });
    expect(within(slot).getByText(long)).toHaveClass("slot-note");
    expect(within(slot).getByRole("button", { name: new RegExp(`^Paella, ${long}, Monday lunch\\.`) })).toBeInTheDocument();
  });

  it("shows no warning marker on a special slot and no note line when there is no note", () => {
    renderGrid(makePlan("2026-10-26", {}, undefined, { specials: { "0:lunch": "free" } }));
    const slot = screen.getByRole("group", { name: "Monday lunch" });
    expect(slot.querySelector(".slot-note")).toBeNull();
    expect(slot.querySelector(".slot-warning")).toBeNull();
  });
});

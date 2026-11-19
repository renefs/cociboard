import { DndContext, useSensor, useSensors } from "@dnd-kit/core";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { makePlan, makeRecipe } from "../../test/fixtures";
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

  it("shows assigned recipes with icons and a remove button", async () => {
    const user = userEvent.setup();
    const recipe = makeRecipe({ name: "Lentejas estofadas" });
    const { onRemove, onActivate } = renderGrid(makePlan("2026-10-26", { "1:lunch": recipe }));
    const slot = screen.getByRole("group", { name: "Tuesday lunch" });
    expect(within(slot).getByText("Lentejas estofadas")).toBeInTheDocument();
    expect(within(slot).getByRole("img", { name: "Batch cooking" })).toBeInTheDocument();
    expect(within(slot).queryByRole("button", { name: /^Add lunch/ })).not.toBeInTheDocument();

    await user.click(within(slot).getByRole("button", { name: "Remove Lentejas estofadas from Tuesday lunch" }));
    expect(onRemove).toHaveBeenCalledWith(1, "lunch");
    expect(onActivate).not.toHaveBeenCalled();

    await user.click(within(slot).getByRole("button", { name: /^Lentejas estofadas, Tuesday lunch/ }));
    expect(onActivate).toHaveBeenCalledWith(1, "lunch");
  });

  it("marks planned archived recipes, which still open their actions", async () => {
    const user = userEvent.setup();
    const recipe = makeRecipe({ name: "Gazpacho viejo", archived: true });
    const { onActivate } = renderGrid(makePlan("2026-10-26", { "1:lunch": recipe }));
    const slot = screen.getByRole("group", { name: "Tuesday lunch" });
    expect(within(slot).getByText("Archived")).toBeInTheDocument();
    const body = within(slot).getByRole("button", { name: /^Gazpacho viejo \(archived recipe\), Tuesday lunch/ });
    await user.click(body);
    expect(onActivate).toHaveBeenCalledWith(1, "lunch");
    const plain = makeRecipe({ id: 2, name: "Tortilla" });
    renderGrid(makePlan("2026-10-26", { "2:lunch": plain }));
    expect(within(screen.getAllByRole("group", { name: "Wednesday lunch" })[1]!).queryByText("Archived")).not.toBeInTheDocument();
  });

  it("dims incompatible slots with a hint while a recipe is being placed", () => {
    renderGrid(makePlan(), { selecting: makeRecipe({ meal_type: "dinner" }) });
    const lunch = screen.getByRole("group", { name: "Monday lunch" });
    expect(lunch).toHaveClass("slot--blocked");
    expect(within(lunch).getByText("Not for lunch")).toBeInTheDocument();
    const dinner = screen.getByRole("group", { name: "Monday dinner" });
    expect(dinner).toHaveClass("slot--pulse");
    expect(dinner).toHaveAttribute("data-select-target", "true");
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
    expect(within(slot).getByRole("button", { name: new RegExp(`^Paella, Monday lunch.*Note: ${long}\\.$`) })).toBeInTheDocument();
  });

  it("shows no warning marker on a special slot and no note line when there is no note", () => {
    renderGrid(makePlan("2026-10-26", {}, undefined, { specials: { "0:lunch": "free" } }));
    const slot = screen.getByRole("group", { name: "Monday lunch" });
    expect(slot.querySelector(".slot-note")).toBeNull();
    expect(slot.querySelector(".slot-warning")).toBeNull();
  });
});

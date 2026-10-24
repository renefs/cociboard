import i18n from "../../i18n";
import { describe, expect, it } from "vitest";
import { makePlan, makeRecipe } from "../../test/fixtures";
import {
  announceCancel,
  announceEnd,
  announceOver,
  announceStart,
  canDrop,
  handleDragEnd,
  isDragSource,
  isDropTarget,
  resolveDrop,
  type DragSource,
} from "./dragLogic";

const lunchOnly = makeRecipe({ id: 1, name: "Lentejas", meal_type: "lunch" });
const dinnerOnly = makeRecipe({ id: 2, name: "Tortilla", meal_type: "dinner" });
const both = makeRecipe({ id: 3, name: "Ensalada", meal_type: "both" });

const fromPanel = (recipe = both): DragSource => ({ kind: "recipe", recipe });
const fromSlot = (recipe = both, day = 0, slot: "lunch" | "dinner" = "lunch"): DragSource => ({
  kind: "slot",
  recipe,
  from: { day, slot },
});

describe("resolveDrop", () => {
  const plan = makePlan("2026-10-26", { "0:lunch": both, "1:dinner": dinnerOnly });

  it("assigns a panel recipe to a compatible slot", () => {
    expect(resolveDrop(plan, fromPanel(lunchOnly), { kind: "slot", day: 2, slot: "lunch" })).toEqual({
      type: "assign",
      to: { day: 2, slot: "lunch" },
      recipe: lunchOnly,
    });
  });

  it("refuses an incompatible slot", () => {
    expect(resolveDrop(plan, fromPanel(lunchOnly), { kind: "slot", day: 2, slot: "dinner" })).toBeNull();
    expect(resolveDrop(plan, fromPanel(dinnerOnly), { kind: "slot", day: 2, slot: "lunch" })).toBeNull();
  });

  it("allows replacing an occupied slot from the panel", () => {
    expect(resolveDrop(plan, fromPanel(both), { kind: "slot", day: 1, slot: "dinner" })?.type).toBe("assign");
  });

  it("moves a slot recipe to an empty slot", () => {
    expect(resolveDrop(plan, fromSlot(both, 0, "lunch"), { kind: "slot", day: 5, slot: "dinner" })).toEqual({
      type: "move",
      from: { day: 0, slot: "lunch" },
      to: { day: 5, slot: "dinner" },
    });
  });

  it("swaps only when both recipes fit their new slots", () => {
    // `both` (day 0 lunch) onto dinner-only occupant of day 1 dinner: dinner-only cannot go to lunch.
    expect(resolveDrop(plan, fromSlot(both, 0, "lunch"), { kind: "slot", day: 1, slot: "dinner" })).toBeNull();
    const swappable = makePlan("2026-10-26", { "0:lunch": both, "1:dinner": makeRecipe({ id: 8, meal_type: "both" }) });
    expect(resolveDrop(swappable, fromSlot(both, 0, "lunch"), { kind: "slot", day: 1, slot: "dinner" })?.type).toBe("move");
  });

  it("treats dropping on the own slot as a no-op", () => {
    expect(resolveDrop(plan, fromSlot(both, 0, "lunch"), { kind: "slot", day: 0, slot: "lunch" })).toBeNull();
  });

  it("removes a slot recipe dropped on the panel, ignores panel recipes", () => {
    expect(resolveDrop(plan, fromSlot(both, 0, "lunch"), { kind: "panel" })).toEqual({
      type: "remove",
      from: { day: 0, slot: "lunch" },
    });
    expect(resolveDrop(plan, fromPanel(), { kind: "panel" })).toBeNull();
  });

  it("canDrop mirrors resolveDrop", () => {
    expect(canDrop(plan, fromPanel(lunchOnly), { kind: "slot", day: 0, slot: "dinner" })).toBe(false);
    expect(canDrop(plan, fromPanel(lunchOnly), { kind: "slot", day: 0, slot: "lunch" })).toBe(true);
  });
});

describe("handleDragEnd", () => {
  const plan = makePlan();
  it("does nothing without a source or a drop target", () => {
    expect(handleDragEnd(plan, null, { kind: "panel" })).toBeNull();
    expect(handleDragEnd(plan, fromPanel(), null)).toBeNull();
  });

  it("returns the action for a valid drop", () => {
    expect(handleDragEnd(plan, fromPanel(), { kind: "slot", day: 6, slot: "dinner" })?.type).toBe("assign");
  });
});

describe("type guards", () => {
  it("validate dnd-kit data", () => {
    expect(isDragSource(fromPanel())).toBe(true);
    expect(isDragSource({ kind: "other" })).toBe(false);
    expect(isDragSource(undefined)).toBe(false);
    expect(isDropTarget({ kind: "panel" })).toBe(true);
    expect(isDropTarget(null)).toBe(false);
  });
});

describe("announcements", () => {
  const plan = makePlan("2026-10-26", { "0:lunch": both });
  const en = { t: i18n.getFixedT("en"), locale: "en" };
  const es = { t: i18n.getFixedT("es"), locale: "es" };
  it("describes pick-up, hover, drop and cancel in English", () => {
    expect(announceStart(en, fromPanel(lunchOnly))).toBe("Picked up Lentejas.");
    expect(announceOver(en, plan, fromPanel(lunchOnly), { kind: "slot", day: 1, slot: "lunch" })).toBe(
      "Lentejas is over Tuesday lunch.",
    );
    expect(announceOver(en, plan, fromPanel(lunchOnly), { kind: "slot", day: 1, slot: "dinner" })).toBe(
      "Lentejas cannot be dropped on Tuesday dinner.",
    );
    expect(announceOver(en, plan, fromSlot(both), { kind: "panel" })).toContain("remove it from the plan");
    expect(announceEnd(en, plan, fromPanel(lunchOnly), { kind: "slot", day: 1, slot: "lunch" })).toBe(
      "Lentejas was added to Tuesday lunch.",
    );
    expect(announceEnd(en, plan, fromSlot(both), { kind: "panel" })).toBe(
      "Ensalada was removed from Monday lunch.",
    );
    expect(announceEnd(en, plan, fromPanel(lunchOnly), null)).toBe("Lentejas was not moved.");
    expect(announceCancel(en, fromPanel(lunchOnly))).toContain("cancelled");
  });

  it("describes the same events in Spanish with proper gender and articles", () => {
    expect(announceStart(es, fromPanel(lunchOnly))).toBe("Has cogido Lentejas.");
    expect(announceOver(es, plan, fromPanel(lunchOnly), { kind: "slot", day: 1, slot: "lunch" })).toBe(
      "Lentejas está sobre la comida del martes.",
    );
    expect(announceOver(es, plan, fromPanel(lunchOnly), { kind: "slot", day: 1, slot: "dinner" })).toBe(
      "Lentejas no se puede soltar en la cena del martes.",
    );
    expect(announceEnd(es, plan, fromSlot(both), { kind: "panel" })).toBe(
      "Ensalada se ha quitado de la comida del lunes.",
    );
    expect(announceEnd(es, plan, fromPanel(lunchOnly), null)).toBe("Lentejas no se ha movido.");
  });
});

import i18n from "../../i18n";
import { describe, expect, it } from "vitest";
import { makePlan, makeRecipe } from "../../test/fixtures";
import type { ClientRect, DroppableContainer } from "@dnd-kit/core";
import { collisionDetection } from "./sensors";
import {
  acceptsDrop,
  announceCancel,
  announceEnd,
  announceOver,
  announceStart,
  canDrop,
  handleDragEnd,
  isDragSource,
  isDropTarget,
  resolveDrop,
  slotDropId,
  type DragSource,
  type DropTarget,
} from "./dragLogic";

const lunchOnly = makeRecipe({ id: 1, name: "Lentejas", meal_type: "lunch" });
const dinnerOnly = makeRecipe({ id: 2, name: "Tortilla", meal_type: "dinner" });
const both = makeRecipe({ id: 3, name: "Ensalada", meal_type: "both" });

const fromPanel = (recipe = both): DragSource => ({ kind: "recipe", recipe });
const fromSlot = (recipe = both, day = 0, slot: "lunch" | "dinner" = "lunch"): DragSource => ({
  kind: "slot",
  meal: { kind: "recipe", recipe, note: null },
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

describe("acceptsDrop", () => {
  const plan = makePlan("2026-10-26", { "0:lunch": both, "1:dinner": dinnerOnly });

  it("keeps every slot enabled when nothing is dragged", () => {
    expect(acceptsDrop(plan, null, { kind: "slot", day: 0, slot: "dinner" })).toBe(true);
  });

  it("enables valid targets and disables refused ones", () => {
    expect(acceptsDrop(plan, fromPanel(lunchOnly), { kind: "slot", day: 2, slot: "lunch" })).toBe(true);
    expect(acceptsDrop(plan, fromPanel(lunchOnly), { kind: "slot", day: 2, slot: "dinner" })).toBe(false);
  });

  it("keeps the dragged meal's own slot enabled, where a drop does nothing", () => {
    const own: DropTarget = { kind: "slot", day: 0, slot: "lunch" };
    expect(acceptsDrop(plan, fromSlot(both, 0, "lunch"), own)).toBe(true);
    expect(handleDragEnd(plan, fromSlot(both, 0, "lunch"), own)).toBeNull();
  });
});

describe("keyboard pick-up from a filled slot", () => {
  // Wednesday dinner holds the meal; Tuesday and Thursday dinner are empty neighbours.
  const plan = makePlan("2026-10-26", { "2:dinner": dinnerOnly });
  const source = fromSlot(dinnerOnly, 2, "dinner");
  const en = { t: i18n.getFixedT("en"), locale: "en" };
  const rectOf = (day: number): ClientRect => {
    const left = day * 120;
    return { left, top: 300, width: 110, height: 80, right: left + 110, bottom: 380 };
  };

  // What dnd-kit hands the collision detection right after Space: no pointer, and the
  // dragged meal's rect still where it was. Only enabled droppables take part.
  function firstTargetOnPickUp(): DropTarget | null {
    const containers: DroppableContainer[] = [];
    const rects = new Map<string, ClientRect>();
    for (const day of [1, 2, 3]) {
      const target: DropTarget = { kind: "slot", day, slot: "dinner" };
      if (!acceptsDrop(plan, source, target)) continue;
      const id = slotDropId({ day, slot: "dinner" });
      rects.set(id, rectOf(day));
      containers.push({
        id,
        key: id,
        data: { current: target },
        disabled: false,
        node: { current: null },
        rect: { current: rectOf(day) },
      });
    }
    const collisions = collisionDetection({
      active: { id: "slot-item:2:dinner", data: { current: source }, rect: { current: { initial: rectOf(2), translated: rectOf(2) } } },
      collisionRect: rectOf(2),
      droppableRects: rects,
      droppableContainers: containers,
      pointerCoordinates: null,
    });
    const first = containers.find((container) => container.id === collisions[0]?.id);
    const data: unknown = first?.data.current;
    return isDropTarget(data) ? data : null;
  }

  it("starts over the meal's own slot, not a neighbour", () => {
    expect(firstTargetOnPickUp()).toEqual({ kind: "slot", day: 2, slot: "dinner" });
  });

  it("dropping straight away leaves the meal in place and says so", () => {
    const target = firstTargetOnPickUp();
    expect(handleDragEnd(plan, source, target)).toBeNull();
    expect(announceEnd(en, plan, source, target)).toBe("Tortilla was not moved.");
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

describe("special meals as drag sources", () => {
  const fromSpecial = (special: "eating_out" | "leftovers" | "free" = "free", day = 0, slot: "lunch" | "dinner" = "lunch"): DragSource => ({
    kind: "slot",
    meal: { kind: "special", special, note: null },
    from: { day, slot },
  });
  const plan = makePlan("2026-10-26", { "1:dinner": dinnerOnly, "2:lunch": lunchOnly }, undefined, {
    specials: { "0:lunch": "free" },
  });

  it("moves to an empty slot of either kind: specials fit anywhere", () => {
    expect(resolveDrop(plan, fromSpecial(), { kind: "slot", day: 5, slot: "dinner" })).toEqual({
      type: "move",
      from: { day: 0, slot: "lunch" },
      to: { day: 5, slot: "dinner" },
    });
    expect(resolveDrop(plan, fromSpecial(), { kind: "slot", day: 5, slot: "lunch" })?.type).toBe("move");
  });

  it("swaps with a recipe only when the recipe fits the special's slot", () => {
    // The dinner-only recipe would end up in the lunch slot.
    expect(resolveDrop(plan, fromSpecial(), { kind: "slot", day: 1, slot: "dinner" })).toBeNull();
    // The lunch-only recipe may take the lunch slot... from a dinner slot it may not.
    expect(resolveDrop(plan, fromSpecial("free", 0, "dinner"), { kind: "slot", day: 2, slot: "lunch" })).toBeNull();
    expect(resolveDrop(plan, fromSpecial(), { kind: "slot", day: 2, slot: "lunch" })?.type).toBe("move");
  });

  it("is refused on its own slot and removed on the recipe panel", () => {
    expect(resolveDrop(plan, fromSpecial(), { kind: "slot", day: 0, slot: "lunch" })).toBeNull();
    expect(resolveDrop(plan, fromSpecial(), { kind: "panel" })).toEqual({
      type: "remove",
      from: { day: 0, slot: "lunch" },
    });
  });

  it("is announced by its label, in both languages", () => {
    const en = { t: i18n.getFixedT("en"), locale: "en" };
    const es = { t: i18n.getFixedT("es"), locale: "es" };
    const target = { kind: "slot", day: 5, slot: "dinner" } as const;
    expect(announceStart(en, fromSpecial("eating_out"))).toBe("Picked up Eating out.");
    expect(announceStart(es, fromSpecial("eating_out"))).toContain("Comemos fuera");
    expect(announceOver(en, plan, fromSpecial("leftovers"), target)).toContain("Leftovers is over Saturday dinner");
    expect(announceEnd(en, plan, fromSpecial("free"), target)).toBe("Free was moved to Saturday dinner.");
    expect(announceEnd(es, plan, fromSpecial("free"), { kind: "slot", day: 1, slot: "dinner" })).toContain("Libre");
    expect(announceCancel(en, fromSpecial("free"))).toContain("Free");
  });

  it("isDragSource accepts a special slot source", () => {
    expect(isDragSource(fromSpecial())).toBe(true);
  });
});

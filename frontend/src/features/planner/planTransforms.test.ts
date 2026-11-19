import { describe, expect, it } from "vitest";
import { makePlan, makeRecipe } from "../../test/fixtures";
import {
  assignInPlan,
  assignSpecialInPlan,
  clearInPlan,
  countFilled,
  moveInPlan,
  planToFills,
  setNoteInPlan,
} from "./planTransforms";
import { mealAt, recipeAt } from "./slots";

const lunchOnly = makeRecipe({ id: 1, name: "L", meal_type: "lunch" });
const dinnerOnly = makeRecipe({ id: 2, name: "D", meal_type: "dinner" });
const both = makeRecipe({ id: 3, name: "B", meal_type: "both" });

describe("planTransforms", () => {
  it("assigns and replaces without mutating the input", () => {
    const plan = makePlan();
    const next = assignInPlan(plan, { day: 1, slot: "lunch" }, both);
    expect(recipeAt(next, { day: 1, slot: "lunch" })).toBe(both);
    expect(recipeAt(plan, { day: 1, slot: "lunch" })).toBeNull();
    const replaced = assignInPlan(next, { day: 1, slot: "lunch" }, lunchOnly);
    expect(recipeAt(replaced, { day: 1, slot: "lunch" })).toBe(lunchOnly);
  });

  it("refuses incompatible assignments", () => {
    const plan = makePlan();
    expect(assignInPlan(plan, { day: 0, slot: "lunch" }, dinnerOnly)).toBe(plan);
  });

  it("clears a slot", () => {
    const plan = makePlan("2026-10-26", { "0:lunch": both });
    expect(recipeAt(clearInPlan(plan, { day: 0, slot: "lunch" }), { day: 0, slot: "lunch" })).toBeNull();
  });

  it("moves to an empty slot", () => {
    const plan = makePlan("2026-10-26", { "0:lunch": both });
    const next = moveInPlan(plan, { day: 0, slot: "lunch" }, { day: 4, slot: "dinner" });
    expect(recipeAt(next, { day: 0, slot: "lunch" })).toBeNull();
    expect(recipeAt(next, { day: 4, slot: "dinner" })).toBe(both);
  });

  it("refuses a swap when the displaced recipe would not fit", () => {
    const plan = makePlan("2026-10-26", { "0:lunch": both, "1:dinner": dinnerOnly });
    expect(moveInPlan(plan, { day: 1, slot: "dinner" }, { day: 0, slot: "lunch" })).toBe(plan);
    expect(moveInPlan(plan, { day: 0, slot: "lunch" }, { day: 1, slot: "dinner" })).toBe(plan);
  });

  it("swaps two compatible recipes", () => {
    const plan = makePlan("2026-10-26", { "0:lunch": both, "1:dinner": makeRecipe({ id: 9, meal_type: "both" }) });
    const next = moveInPlan(plan, { day: 0, slot: "lunch" }, { day: 1, slot: "dinner" });
    expect(recipeAt(next, { day: 0, slot: "lunch" })?.id).toBe(9);
    expect(recipeAt(next, { day: 1, slot: "dinner" })?.id).toBe(3);
  });

  it("ignores no-op and empty-source moves", () => {
    const plan = makePlan("2026-10-26", { "0:lunch": both });
    expect(moveInPlan(plan, { day: 0, slot: "lunch" }, { day: 0, slot: "lunch" })).toBe(plan);
    expect(moveInPlan(plan, { day: 2, slot: "lunch" }, { day: 3, slot: "lunch" })).toBe(plan);
  });
});

describe("whole-week helpers", () => {
  it("counts filled slots", () => {
    expect(countFilled(makePlan())).toBe(0);
    expect(countFilled(makePlan("2026-10-26", { "0:lunch": lunchOnly, "6:dinner": both }))).toBe(2);
  });

  it("turns a plan into assignments in reading order", () => {
    const plan = makePlan("2026-10-26", { "3:dinner": dinnerOnly, "0:lunch": lunchOnly, "3:lunch": both });
    expect(planToFills(plan)).toEqual([
      { day: 0, slot: "lunch", recipe_id: 1, special: null, note: null },
      { day: 3, slot: "lunch", recipe_id: 3, special: null, note: null },
      { day: 3, slot: "dinner", recipe_id: 2, special: null, note: null },
    ]);
    expect(planToFills(makePlan())).toEqual([]);
  });
});

describe("special meals and notes", () => {
  const ref = (day: number, slot: "lunch" | "dinner") => ({ day, slot });

  it("assigns a special meal to any slot and replaces a recipe with it", () => {
    const plan = makePlan("2026-10-26", { "0:lunch": lunchOnly });
    const next = assignSpecialInPlan(plan, ref(0, "lunch"), "eating_out", "Ana");
    expect(mealAt(next, ref(0, "lunch"))).toEqual({ kind: "special", special: "eating_out", note: "Ana" });
    expect(recipeAt(next, ref(0, "lunch"))).toBeNull();
    expect(mealAt(assignSpecialInPlan(plan, ref(4, "dinner"), "free"), ref(4, "dinner"))).toEqual({
      kind: "special",
      special: "free",
      note: null,
    });
  });

  it("replaces a special with a recipe, storing the note it is given", () => {
    const plan = makePlan("2026-10-26", {}, undefined, { specials: { "0:dinner": "free" }, notes: { "0:dinner": "x" } });
    const next = assignInPlan(plan, ref(0, "dinner"), both, "x");
    expect(mealAt(next, ref(0, "dinner"))).toEqual({ kind: "recipe", recipe: both, note: "x" });
    expect(next.days[0]?.dinner_special).toBeNull();
    expect(mealAt(assignInPlan(plan, ref(0, "dinner"), both), ref(0, "dinner"))?.note).toBeNull();
  });

  it("sets and clears a note on a filled slot only", () => {
    const plan = makePlan("2026-10-26", { "0:lunch": both });
    const noted = setNoteInPlan(plan, ref(0, "lunch"), "Double batch");
    expect(mealAt(noted, ref(0, "lunch"))).toEqual({ kind: "recipe", recipe: both, note: "Double batch" });
    expect(mealAt(setNoteInPlan(noted, ref(0, "lunch"), null), ref(0, "lunch"))?.note).toBeNull();
    expect(setNoteInPlan(plan, ref(3, "dinner"), "nothing here")).toBe(plan);
  });

  it("clearing a slot removes its special meal and note", () => {
    const plan = makePlan("2026-10-26", {}, undefined, { specials: { "0:lunch": "free" }, notes: { "0:lunch": "x" } });
    const next = clearInPlan(plan, ref(0, "lunch"));
    expect(mealAt(next, ref(0, "lunch"))).toBeNull();
    expect(next.days[0]?.lunch_note).toBeNull();
  });

  it("moves a special with its note, and moves into the occupied slot by swapping", () => {
    const plan = makePlan("2026-10-26", { "1:dinner": both }, undefined, {
      specials: { "0:lunch": "leftovers" },
      notes: { "0:lunch": "from Sunday", "1:dinner": "batch" },
    });
    const moved = moveInPlan(plan, ref(0, "lunch"), ref(5, "dinner"));
    expect(mealAt(moved, ref(5, "dinner"))).toEqual({ kind: "special", special: "leftovers", note: "from Sunday" });
    expect(mealAt(moved, ref(0, "lunch"))).toBeNull();

    const swapped = moveInPlan(plan, ref(0, "lunch"), ref(1, "dinner"));
    expect(mealAt(swapped, ref(1, "dinner"))).toEqual({ kind: "special", special: "leftovers", note: "from Sunday" });
    expect(mealAt(swapped, ref(0, "lunch"))).toEqual({ kind: "recipe", recipe: both, note: "batch" });
  });

  it("checks the meal type of recipes only", () => {
    const plan = makePlan("2026-10-26", { "0:dinner": dinnerOnly }, undefined, { specials: { "0:lunch": "free" } });
    // The dinner-only recipe would land in a lunch slot: refused.
    expect(moveInPlan(plan, ref(0, "lunch"), ref(0, "dinner"))).toBe(plan);
    const roomy = makePlan("2026-10-26", { "0:dinner": dinnerOnly }, undefined, { specials: { "2:dinner": "free" } });
    expect(mealAt(moveInPlan(roomy, ref(2, "dinner"), ref(0, "lunch")), ref(0, "lunch"))?.kind).toBe("special");
  });

  it("counts special meals as filled and carries them and their notes into Undo fills", () => {
    const plan = makePlan("2026-10-26", { "0:lunch": both }, undefined, {
      specials: { "0:dinner": "eating_out", "6:lunch": "free" },
      notes: { "0:lunch": "batch", "6:lunch": "Ana" },
    });
    expect(countFilled(plan)).toBe(3);
    expect(planToFills(plan)).toEqual([
      { day: 0, slot: "lunch", recipe_id: 3, special: null, note: "batch" },
      { day: 0, slot: "dinner", recipe_id: null, special: "eating_out", note: null },
      { day: 6, slot: "lunch", recipe_id: null, special: "free", note: "Ana" },
    ]);
  });
});

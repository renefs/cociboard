import { describe, expect, it } from "vitest";
import { makePlan, makeRecipe } from "../../test/fixtures";
import { assignInPlan, clearInPlan, countFilled, moveInPlan, planToFills } from "./planTransforms";
import { recipeAt } from "./slots";

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
      { day: 0, slot: "lunch", recipe_id: 1 },
      { day: 3, slot: "lunch", recipe_id: 3 },
      { day: 3, slot: "dinner", recipe_id: 2 },
    ]);
    expect(planToFills(makePlan())).toEqual([]);
  });
});

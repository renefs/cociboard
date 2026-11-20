import { describe, expect, it } from "vitest";
import { makePlan, makeRecipe } from "../../test/fixtures";
import { applyPlanChanges, type PlanMutationVariables } from "./planChanges";
import { recipeAt } from "./slots";

const WEEK = "2026-10-26";
const soup = makeRecipe({ id: 1, name: "Soup", meal_type: "both" });
const stew = makeRecipe({ id: 2, name: "Stew", meal_type: "both" });
const monday = { day: 0, slot: "lunch" } as const;
const tuesday = { day: 1, slot: "lunch" } as const;

describe("applyPlanChanges", () => {
  it("applies the waiting changes in order", () => {
    const waiting: PlanMutationVariables[] = [
      { weekStart: WEEK, change: { type: "assign", to: monday, recipe: soup, note: null } },
      { weekStart: WEEK, change: { type: "move", from: monday, to: tuesday } },
      { weekStart: WEEK, change: { type: "assign", to: monday, recipe: stew, note: null } },
    ];
    const plan = applyPlanChanges(makePlan(WEEK), waiting);
    expect(recipeAt(plan, monday)?.name).toBe("Stew");
    expect(recipeAt(plan, tuesday)?.name).toBe("Soup");
  });

  it("ignores changes of other weeks and leaves the input alone", () => {
    const base = makePlan(WEEK);
    const waiting: PlanMutationVariables[] = [
      { weekStart: "2026-11-02", change: { type: "assign", to: monday, recipe: soup, note: null } },
    ];
    expect(applyPlanChanges(base, waiting)).toBe(base);
  });

  it("returns the same plan when nothing waits", () => {
    const base = makePlan(WEEK);
    expect(applyPlanChanges(base, [])).toBe(base);
  });
});

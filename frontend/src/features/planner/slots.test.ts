import { describe, expect, it } from "vitest";
import type { MealSlot, MealType } from "../../api/types";
import { makeRecipe } from "../../test/fixtures";
import { allSlots, describeSlot, filterRecipes, fitsSlot, recipeAt, slotHint } from "./slots";
import { makePlan } from "../../test/fixtures";

describe("fitsSlot", () => {
  const cases: [MealType, MealSlot, boolean][] = [
    ["lunch", "lunch", true],
    ["lunch", "dinner", false],
    ["dinner", "dinner", true],
    ["dinner", "lunch", false],
    ["both", "lunch", true],
    ["both", "dinner", true],
  ];
  it.each(cases)("%s recipe in %s slot -> %s", (mealType, slot, expected) => {
    expect(fitsSlot(mealType, slot)).toBe(expected);
  });
});

describe("slot helpers", () => {
  it("lists 14 slots in reading order", () => {
    const slots = allSlots();
    expect(slots).toHaveLength(14);
    expect(slots[0]).toEqual({ day: 0, slot: "lunch" });
    expect(slots[13]).toEqual({ day: 6, slot: "dinner" });
  });

  it("describes slots and hints", () => {
    expect(describeSlot({ day: 2, slot: "dinner" })).toBe("Wednesday dinner");
    expect(slotHint(makeRecipe({ meal_type: "dinner" }), "lunch")).toBe("Not for lunch");
    expect(slotHint(makeRecipe({ meal_type: "both" }), "lunch")).toBeNull();
  });

  it("reads a recipe from the plan", () => {
    const recipe = makeRecipe();
    const plan = makePlan("2026-10-26", { "3:dinner": recipe });
    expect(recipeAt(plan, { day: 3, slot: "dinner" })).toBe(recipe);
    expect(recipeAt(plan, { day: 3, slot: "lunch" })).toBeNull();
  });

  it("filters by slot and by name or ingredient", () => {
    const lentils = makeRecipe({ id: 1, name: "Lentejas", meal_type: "lunch", ingredients: ["Chorizo"] });
    const tortilla = makeRecipe({ id: 2, name: "Tortilla", meal_type: "dinner", ingredients: ["Huevos"] });
    const salad = makeRecipe({ id: 3, name: "Ensalada", meal_type: "both", ingredients: ["Tomate"] });
    const all = [lentils, tortilla, salad];
    expect(filterRecipes(all, { slot: "lunch" })).toEqual([lentils, salad]);
    expect(filterRecipes(all, { slot: "dinner" })).toEqual([tortilla, salad]);
    expect(filterRecipes(all, { slot: "lunch", query: " CHORI " })).toEqual([lentils]);
    expect(filterRecipes(all, { slot: "lunch", query: "huevos" })).toEqual([]);
    expect(filterRecipes(all, {})).toEqual(all);
  });
});

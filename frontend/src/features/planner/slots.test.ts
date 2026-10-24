import i18n from "../../i18n";
import { describe, expect, it } from "vitest";
import type { MealSlot, MealType } from "../../api/types";
import { makeRecipe } from "../../test/fixtures";
import { allSlots, capitalizeFirst, slotLabel, describeSlot, filterRecipes, fitsSlot, recipeAt, slotHint } from "./slots";
import { makePlan } from "../../test/fixtures";

const en = i18n.getFixedT("en");
const es = i18n.getFixedT("es");

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
    expect(describeSlot({ day: 2, slot: "dinner" }, en, "en")).toBe("Wednesday dinner");
    expect(slotHint(makeRecipe({ meal_type: "dinner" }), "lunch", en)).toBe("Not for lunch");
    expect(slotHint(makeRecipe({ meal_type: "both" }), "lunch", en)).toBeNull();
  });

  it("describes slots and hints in Spanish", () => {
    expect(describeSlot({ day: 2, slot: "dinner" }, es, "es")).toBe("cena del miércoles");
    expect(describeSlot({ day: 0, slot: "lunch" }, es, "es")).toBe("comida del lunes");
    expect(slotHint(makeRecipe({ meal_type: "dinner" }), "lunch", es)).toBe("No es para la comida");
    expect(slotLabel("dinner", es)).toBe("Cena");
    expect(capitalizeFirst(describeSlot({ day: 0, slot: "lunch" }, es, "es"), "es")).toBe(
      "Comida del lunes",
    );
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

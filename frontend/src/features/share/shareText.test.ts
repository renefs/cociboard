import { describe, expect, it } from "vitest";
import i18n from "../../i18n";
import { makeRecipe } from "../../test/fixtures";
import { makePlan } from "../../test/fixtures";
import type { ShoppingList } from "../../api/types";
import { hasMeals, shoppingAsText, weekAsText } from "./shareText";

const en = i18n.getFixedT("en");
const es = i18n.getFixedT("es");
const lentils = makeRecipe({ id: 1, name: "Lentejas" });
const tortilla = makeRecipe({ id: 2, name: "Tortilla", meal_type: "both" });

describe("weekAsText", () => {
  const plan = makePlan("2026-11-16", { "0:lunch": lentils, "0:dinner": tortilla }, undefined, {
    specials: { "1:lunch": "eating_out" },
    notes: { "0:dinner": "no onion", "1:lunch": "with Ana" },
  });

  it("starts with the title and lists each day with an indented lunch and dinner", () => {
    const lines = weekAsText(plan, en, "en").split("\n");
    expect(lines.slice(0, 8)).toEqual([
      "Weekly menu: 16 Nov – 22 Nov 2026",
      "",
      "Monday 16 Nov",
      "  Lunch: Lentejas",
      "  Dinner: Tortilla (no onion)",
      "",
      "Tuesday 17 Nov",
      "  Lunch: Eating out (with Ana)",
    ]);
  });

  it("writes a dash for empty slots", () => {
    expect(weekAsText(plan, en, "en")).toContain("Tuesday 17 Nov\n  Lunch: Eating out (with Ana)\n  Dinner: —");
  });

  it("is translated, with Spanish day names and slot words", () => {
    const text = weekAsText(plan, es, "es");
    expect(text).toContain("Lunes 16 nov");
    expect(text).toContain("  Comida: Lentejas");
    expect(text).toContain("  Cena: Tortilla (no onion)");
    expect(text).toContain("  Comida: Comemos fuera (with Ana)");
  });
});

describe("hasMeals", () => {
  it("is false for an empty week and true once a recipe or a special meal is planned", () => {
    expect(hasMeals(makePlan("2026-11-16"))).toBe(false);
    expect(hasMeals(makePlan("2026-11-16", { "3:dinner": tortilla }))).toBe(true);
    expect(hasMeals(makePlan("2026-11-16", {}, undefined, { specials: { "6:lunch": "free" } }))).toBe(true);
  });
});

describe("shoppingAsText", () => {
  const list: ShoppingList = {
    week_start: "2026-11-16",
    items: [
      { key: "aceite", name: "Aceite", checked: false, in_pantry: false, meals: [] },
      { key: "sal", name: "Sal", checked: false, in_pantry: true, meals: [] },
      { key: "huevos", name: "Huevos", checked: true, in_pantry: false, meals: [] },
    ],
    extras: [
      { id: 1, name: "Leche", checked: false },
      { id: 2, name: "Pan", checked: true },
    ],
  };

  it("lists unchecked items then unchecked extras, leaving out the basket", () => {
    expect(shoppingAsText(list, en, "en")).toBe(
      "Shopping list (16 Nov – 22 November 2026)\n\n- Aceite\n- Leche\n\nAlso check at home: Sal",
    );
  });

  it("says so when nothing is left", () => {
    const done: ShoppingList = { ...list, items: [], extras: [] };
    expect(shoppingAsText(done, en, "en")).toBe("Shopping list (16 Nov – 22 November 2026)\n\nNothing left to buy.");
  });
});

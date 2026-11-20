import { describe, expect, it } from "vitest";
import type { Pantry, ShoppingList } from "../../api/types";
import {
  addPantryItem,
  cleanPantryName,
  confirmPantryItem,
  ingredientKey,
  isPendingPantryId,
  removePantryKey,
  setInPantry,
} from "./pantryLogic";

const PANTRY: Pantry = {
  items: [{ id: 1, key: "sal", name: "Sal" }],
  suggestions: [
    { key: "ajo", name: "Ajo", recipe_count: 5 },
    { key: "pan", name: "Pan", recipe_count: 3 },
  ],
};

describe("ingredientKey", () => {
  it("folds case, accents and whitespace like the server", () => {
    expect(ingredientKey("  Aceite   de OLIVA ")).toBe("aceite de oliva");
    expect(ingredientKey("Cebollín")).toBe("cebollin");
    expect(ingredientKey("Aceite de oliva virgen extra")).not.toBe(ingredientKey("Aceite de oliva"));
    expect(ingredientKey("   ")).toBe("");
  });
});

describe("addPantryItem", () => {
  it("adds a pending item in key order and drops the suggestion", () => {
    const next = addPantryItem(PANTRY, " Ajo ");
    expect(next.items.map((i) => i.key)).toEqual(["ajo", "sal"]);
    expect(next.items[0]).toMatchObject({ name: "Ajo" });
    expect(isPendingPantryId(next.items[0]?.id ?? 0)).toBe(true);
    expect(next.suggestions.map((s) => s.key)).toEqual(["pan"]);
    expect(PANTRY.items).toHaveLength(1);
  });

  it("gives each pending item its own id", () => {
    const next = addPantryItem(addPantryItem(PANTRY, "Ajo"), "Pan");
    const ids = next.items.map((i) => i.id);
    expect(new Set(ids).size).toBe(3);
  });

  it("ignores a key that is already there and empty names", () => {
    expect(addPantryItem(PANTRY, "sal")).toBe(PANTRY);
    expect(addPantryItem(PANTRY, "  ")).toBe(PANTRY);
  });
});

describe("removePantryKey and confirmPantryItem", () => {
  it("removes by key", () => {
    expect(removePantryKey(PANTRY, "sal").items).toEqual([]);
  });

  it("swaps the pending copy for the saved item", () => {
    const pending = addPantryItem(PANTRY, "Ajo");
    const saved = confirmPantryItem(pending, { id: 9, key: "ajo", name: "Ajo" });
    expect(saved.items).toEqual([
      { id: 9, key: "ajo", name: "Ajo" },
      { id: 1, key: "sal", name: "Sal" },
    ]);
  });
});

describe("setInPantry", () => {
  const list: ShoppingList = {
    week_start: "2026-10-26",
    items: [
      { key: "sal", name: "Sal", checked: false, in_pantry: false, meals: [] },
      { key: "pan", name: "Pan", checked: false, in_pantry: false, meals: [] },
    ],
    extras: [{ id: 1, name: "Sal", checked: false }],
  };

  it("flags only the generated items with that key", () => {
    const next = setInPantry(list, "sal", true);
    expect(next.items.map((i) => i.in_pantry)).toEqual([true, false]);
    expect(next.extras).toEqual(list.extras);
    expect(list.items[0]?.in_pantry).toBe(false);
  });
});

describe("cleanPantryName", () => {
  it("trims and collapses spaces, and ignores empty input", () => {
    expect(cleanPantryName("  Aceite   de oliva ")).toBe("Aceite de oliva");
    expect(cleanPantryName("  ")).toBeNull();
  });
});

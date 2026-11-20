import { describe, expect, it } from "vitest";
import type { Pantry, ShoppingList } from "../../api/types";
import {
  applyPantryChanges,
  applyShoppingChange,
  applyShoppingOverlay,
  type PantryChange,
  type ShoppingMutationVariables,
} from "./shoppingChanges";

const WEEK = "2026-10-26";

function list(): ShoppingList {
  return {
    week_start: WEEK,
    items: [
      { key: "aceite", name: "Aceite", checked: false, in_pantry: false, meals: [] },
      { key: "sal", name: "Sal", checked: false, in_pantry: false, meals: [] },
    ],
    extras: [{ id: 5, name: "Pan", checked: false }],
  };
}

describe("applyShoppingChange", () => {
  it("covers every kind of change", () => {
    let current = applyShoppingChange(list(), { type: "item", key: "sal", checked: true });
    current = applyShoppingChange(current, { type: "extra-check", id: 5, checked: true });
    current = applyShoppingChange(current, { type: "rename", id: 5, name: "Pan integral" });
    current = applyShoppingChange(current, { type: "add", name: "Leche" });
    expect(current.items.map((item) => item.checked)).toEqual([false, true]);
    expect(current.extras.map((extra) => [extra.name, extra.checked])).toEqual([
      ["Pan integral", true],
      ["Leche", false],
    ]);
    expect(applyShoppingChange(current, { type: "remove", id: 5 }).extras).toHaveLength(1);
    const cleared = applyShoppingChange(current, { type: "uncheck-all" });
    expect(cleared.items.some((item) => item.checked)).toBe(false);
  });
});

describe("applyShoppingOverlay", () => {
  it("applies waiting changes in order, only for its own week, then the pantry flags", () => {
    const shopping: ShoppingMutationVariables[] = [
      { weekStart: WEEK, change: { type: "item", key: "sal", checked: true } },
      { weekStart: WEEK, change: { type: "item", key: "sal", checked: false } },
      { weekStart: "2026-11-02", change: { type: "item", key: "aceite", checked: true } },
    ];
    const pantry: PantryChange[] = [{ type: "add", name: "ACEITE" }];
    const shown = applyShoppingOverlay(list(), shopping, pantry);
    expect(shown.items.map((item) => [item.key, item.checked, item.in_pantry])).toEqual([
      ["aceite", false, true],
      ["sal", false, false],
    ]);
  });

  it("returns an equal list when nothing waits", () => {
    expect(applyShoppingOverlay(list(), [], [])).toEqual(list());
  });
});

describe("applyPantryChanges", () => {
  it("adds and removes staples in order", () => {
    const pantry: Pantry = { items: [{ id: 1, key: "sal", name: "Sal" }], suggestions: [] };
    const next = applyPantryChanges(pantry, [
      { type: "add", name: "Aceite" },
      { type: "remove", key: "sal", id: 1 },
    ]);
    expect(next.items.map((item) => item.key)).toEqual(["aceite"]);
  });
});

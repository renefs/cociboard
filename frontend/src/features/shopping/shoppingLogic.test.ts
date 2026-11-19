import type { TFunction } from "i18next";
import { describe, expect, it } from "vitest";
import type { ShoppingList } from "../../api/types";
import en from "../../i18n/locales/en";
import {
  appendExtra,
  cleanExtraName,
  isEmptyList,
  isPendingExtraId,
  progressOf,
  removeExtra,
  renameExtra,
  setExtraChecked,
  setItemChecked,
  shoppingListText,
  shoppingRows,
  splitList,
  uncheckAll,
} from "./shoppingLogic";

const meal = (day: number, slot: "lunch" | "dinner", id: number, name: string) => ({
  day,
  slot,
  recipe_id: id,
  recipe_name: name,
});

const LIST: ShoppingList = {
  week_start: "2026-10-26",
  items: [
    {
      key: "aceite",
      name: "Aceite",
      checked: false,
      meals: [meal(0, "lunch", 1, "Lentejas"), meal(1, "lunch", 1, "Lentejas"), meal(2, "dinner", 2, "Tortilla")],
    },
    { key: "huevos", name: "Huevos", checked: true, meals: [meal(2, "dinner", 2, "Tortilla")] },
  ],
  extras: [
    { id: 5, name: "Leche", checked: false },
    { id: 6, name: "Pan", checked: true },
  ],
};

/** A `t` that resolves the English catalogue with simple {{param}} interpolation. */
const t = ((key: string, params: Record<string, unknown> = {}) => {
  const value = key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], en);
  return String(value).replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(params[name]));
}) as unknown as TFunction;

describe("shoppingRows", () => {
  it("lists items then extras, deduplicating recipe names and counting meals", () => {
    const rows = shoppingRows(LIST);
    expect(rows.map((r) => r.id)).toEqual(["item:aceite", "item:huevos", "extra:5", "extra:6"]);
    expect(rows[0]).toMatchObject({ recipes: ["Lentejas", "Tortilla"], mealCount: 3 });
    expect(rows[2]).toMatchObject({ kind: "extra", recipes: [], mealCount: 0 });
  });
});

describe("splitList and progressOf", () => {
  it("splits checked rows into the basket", () => {
    const { toBuy, basket } = splitList(LIST);
    expect(toBuy.map((r) => r.name)).toEqual(["Aceite", "Leche"]);
    expect(basket.map((r) => r.name)).toEqual(["Huevos", "Pan"]);
  });

  it("counts generated items and extras together", () => {
    expect(progressOf(LIST)).toEqual({ done: 2, total: 4 });
    expect(progressOf({ ...LIST, items: [], extras: [] })).toEqual({ done: 0, total: 0 });
  });

  it("knows when the list is empty", () => {
    expect(isEmptyList(LIST)).toBe(false);
    expect(isEmptyList({ ...LIST, items: [], extras: [] })).toBe(true);
  });
});

describe("optimistic transforms", () => {
  it("toggle an item or an extra without mutating the input", () => {
    const next = setItemChecked(LIST, "aceite", true);
    expect(next.items[0]?.checked).toBe(true);
    expect(LIST.items[0]?.checked).toBe(false);
    expect(setExtraChecked(LIST, 5, true).extras[0]?.checked).toBe(true);
  });

  it("rename, remove and append extras", () => {
    expect(renameExtra(LIST, 5, "Leche entera").extras[0]?.name).toBe("Leche entera");
    expect(removeExtra(LIST, 5).extras.map((e) => e.id)).toEqual([6]);
    const added = appendExtra(LIST, "Sal");
    expect(added.extras.at(-1)).toMatchObject({ name: "Sal", checked: false });
  });

  it("gives each pending extra its own negative id", () => {
    const twice = appendExtra(appendExtra(LIST, "Sal"), "Pan");
    const [first, second] = twice.extras.slice(-2).map((extra) => extra.id) as [number, number];
    const ids = [first, second] as const;
    expect(ids[0]).toBeLessThan(0);
    expect(ids[1]).toBeLessThan(0);
    expect(ids[0]).not.toBe(ids[1]);
    expect(isPendingExtraId(ids[1])).toBe(true);
    expect(isPendingExtraId(1)).toBe(false);
  });

  it("uncheck everything", () => {
    expect(progressOf(uncheckAll(LIST)).done).toBe(0);
  });
});

describe("cleanExtraName", () => {
  it("trims, collapses spaces and ignores empty input", () => {
    expect(cleanExtraName("  Leche   entera ")).toBe("Leche entera");
    expect(cleanExtraName("   ")).toBeNull();
  });
});

describe("shoppingListText", () => {
  it("lists only what is still to buy, one dash line each, under a titled week range", () => {
    expect(shoppingListText(LIST, t, "en")).toBe(
      "Shopping list (26 Oct – 1 November 2026)\n\n- Aceite\n- Leche",
    );
  });

  it("says so when nothing is left", () => {
    const done = setItemChecked(setItemChecked(LIST, "aceite", true), "huevos", true);
    const text = shoppingListText({ ...done, extras: [] }, t, "en");
    expect(text).toBe("Shopping list (26 Oct – 1 November 2026)\n\nNothing left to buy.");
  });
});

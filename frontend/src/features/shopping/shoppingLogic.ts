// Pure logic for the shopping list: grouping rows, progress, optimistic transforms and the
// plain-text export. No React, no I/O.
import type { TFunction } from "i18next";
import type { ShoppingList } from "../../api/types";
import { formatWeekRange } from "../planner/weekMath";

/** One line of the list: a generated ingredient or an item added by hand. */
export interface ShoppingRow {
  /** Unique within a list: `item:<key>` or `extra:<id>`. */
  id: string;
  kind: "item" | "extra";
  name: string;
  checked: boolean;
  /** Key of a generated item. */
  key?: string;
  /** A generated item whose key is in the pantry (extras never are). */
  inPantry: boolean;
  /** Id of an extra; negative while the server has not confirmed it yet. */
  extraId?: number;
  /** Names of the recipes that use a generated item (deduplicated, in plan order). */
  recipes: string[];
  /** Number of planned meals that use a generated item. */
  mealCount: number;
}

/** Whether an extra is still being created: those get negative ids until the server answers. */
export function isPendingExtraId(id: number): boolean {
  return id < 0;
}

/** All rows: generated items first (sorted by the server), then extras in creation order. */
export function shoppingRows(list: ShoppingList): ShoppingRow[] {
  const items = list.items.map<ShoppingRow>((item) => ({
    id: `item:${item.key}`,
    kind: "item",
    name: item.name,
    checked: item.checked,
    key: item.key,
    inPantry: item.in_pantry,
    recipes: [...new Set(item.meals.map((meal) => meal.recipe_name))],
    mealCount: item.meals.length,
  }));
  const extras = list.extras.map<ShoppingRow>((extra) => ({
    id: `extra:${extra.id}`,
    kind: "extra",
    name: extra.name,
    checked: extra.checked,
    extraId: extra.id,
    inPantry: false,
    recipes: [],
    mealCount: 0,
  }));
  return [...items, ...extras];
}

export interface SplitList {
  toBuy: ShoppingRow[];
  basket: ShoppingRow[];
  /** Pantry staples: neither to buy nor in the basket, whether or not they were ticked. */
  pantry: ShoppingRow[];
}

/** Split into what is still to buy, what is already in the basket and the pantry staples. */
export function splitList(list: ShoppingList): SplitList {
  const rows = shoppingRows(list);
  const buyable = rows.filter((row) => !row.inPantry);
  return {
    toBuy: buyable.filter((row) => !row.checked),
    basket: buyable.filter((row) => row.checked),
    pantry: rows.filter((row) => row.inPantry),
  };
}

export interface Progress {
  done: number;
  total: number;
}

/** Bought versus to buy; pantry staples are not counted. */
export function progressOf(list: ShoppingList): Progress {
  const rows = shoppingRows(list).filter((row) => !row.inPantry);
  return { done: rows.filter((row) => row.checked).length, total: rows.length };
}

export function isEmptyList(list: ShoppingList): boolean {
  return list.items.length === 0 && list.extras.length === 0;
}

// Optimistic transforms: each returns a new list and leaves the input untouched.

export function setItemChecked(list: ShoppingList, key: string, checked: boolean): ShoppingList {
  return {
    ...list,
    items: list.items.map((item) => (item.key === key ? { ...item, checked } : item)),
  };
}

export function setExtraChecked(list: ShoppingList, id: number, checked: boolean): ShoppingList {
  return {
    ...list,
    extras: list.extras.map((extra) => (extra.id === id ? { ...extra, checked } : extra)),
  };
}

export function renameExtra(list: ShoppingList, id: number, name: string): ShoppingList {
  return {
    ...list,
    extras: list.extras.map((extra) => (extra.id === id ? { ...extra, name } : extra)),
  };
}

export function removeExtra(list: ShoppingList, id: number): ShoppingList {
  return { ...list, extras: list.extras.filter((extra) => extra.id !== id) };
}

export function appendExtra(list: ShoppingList, name: string): ShoppingList {
  // Each pending extra gets its own negative id, so quick consecutive adds keep unique keys.
  const id = Math.min(0, ...list.extras.map((extra) => extra.id)) - 1;
  return {
    ...list,
    extras: [...list.extras, { id, name, checked: false }],
  };
}

export function uncheckAll(list: ShoppingList): ShoppingList {
  return {
    ...list,
    items: list.items.map((item) => ({ ...item, checked: false })),
    extras: list.extras.map((extra) => ({ ...extra, checked: false })),
  };
}

/** Trimmed name of a new item, or null when it is empty (the form ignores those). */
export function cleanExtraName(input: string): string | null {
  const name = input.trim().replace(/\s+/g, " ");
  return name === "" ? null : name;
}

/**
 * Plain-text list of what is still to buy, ready to paste into a chat or a notes app. Pantry
 * staples are left out of the list; a last line names them so they can still be checked.
 */
export function shoppingListText(list: ShoppingList, t: TFunction, locale = "en"): string {
  const title = t("shopping.textTitle", { range: formatWeekRange(list.week_start, locale) });
  const { toBuy, pantry } = splitList(list);
  const lines = toBuy.length > 0 ? toBuy.map((row) => `- ${row.name}`) : [t("shopping.textNothing")];
  const check =
    pantry.length > 0
      ? ["", t("shopping.textPantry", { items: pantry.map((row) => row.name).join(", ") })]
      : [];
  return [title, "", ...lines, ...check].join("\n");
}

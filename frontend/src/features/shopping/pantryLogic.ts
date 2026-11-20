// Pure logic for the pantry: key matching and the optimistic transforms of the pantry query
// and of the cached shopping lists. No React, no I/O.
import type { Pantry, PantryItem, ShoppingList } from "../../api/types";

/**
 * The grouping key of an ingredient name, as the server computes it: case and accents folded,
 * whitespace collapsed. Matching is exact on this key, not fuzzy.
 */
export function ingredientKey(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
}

/** Whether a pantry item with this id is still waiting for the server to confirm it. */
export function isPendingPantryId(id: number): boolean {
  return id < 0;
}

/** Add a staple: no-op when its key is there already; it also leaves the suggestions. */
export function addPantryItem(pantry: Pantry, name: string): Pantry {
  const key = ingredientKey(name);
  if (key === "" || pantry.items.some((item) => item.key === key)) return pantry;
  // Each pending item gets its own negative id, so quick consecutive adds stay distinct.
  const id = Math.min(0, ...pantry.items.map((item) => item.id)) - 1;
  const added: PantryItem = { id, key, name: name.trim().replace(/\s+/g, " ") };
  return {
    items: [...pantry.items, added].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)),
    suggestions: pantry.suggestions.filter((suggestion) => suggestion.key !== key),
  };
}

export function removePantryKey(pantry: Pantry, key: string): Pantry {
  return { ...pantry, items: pantry.items.filter((item) => item.key !== key) };
}

/** Replace the optimistic copy of an added staple with the server's item. */
export function confirmPantryItem(pantry: Pantry, saved: PantryItem): Pantry {
  const items = pantry.items.filter((item) => item.key !== saved.key);
  return {
    ...pantry,
    items: [...items, saved].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)),
  };
}

/** Flag the generated items with this key as in or out of the pantry. */
export function setInPantry(list: ShoppingList, key: string, inPantry: boolean): ShoppingList {
  return {
    ...list,
    items: list.items.map((item) => (item.key === key ? { ...item, in_pantry: inPantry } : item)),
  };
}

/** Trimmed name of a pantry item, or null when empty. */
export function cleanPantryName(input: string): string | null {
  const name = input.trim().replace(/\s+/g, " ");
  return name === "" ? null : name;
}

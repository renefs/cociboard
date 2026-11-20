// The changes a user makes to a shopping list and to the pantry, as plain data. They are the
// variables of the `shopping-change` and `pantry-change` mutations, so they must stay JSON
// (they are stored on the device while they wait, ADR-0029). The `apply…` functions overlay
// the waiting ones on the server's data.
import type { Pantry, ShoppingList } from "../../api/types";
import {
  addPantryItem,
  ingredientKey,
  removePantryKey,
  setInPantry,
} from "./pantryLogic";
import {
  appendExtra,
  removeExtra,
  renameExtra,
  setExtraChecked,
  setItemChecked,
  uncheckAll,
} from "./shoppingLogic";

export type ShoppingChange =
  | { type: "item"; key: string; checked: boolean }
  | { type: "extra-check"; id: number; checked: boolean }
  | { type: "add"; name: string }
  | { type: "rename"; id: number; name: string }
  | { type: "remove"; id: number }
  | { type: "uncheck-all" };

export interface ShoppingMutationVariables {
  weekStart: string;
  change: ShoppingChange;
}

export function applyShoppingChange(list: ShoppingList, change: ShoppingChange): ShoppingList {
  switch (change.type) {
    case "item":
      return setItemChecked(list, change.key, change.checked);
    case "extra-check":
      return setExtraChecked(list, change.id, change.checked);
    case "add":
      return appendExtra(list, change.name);
    case "rename":
      return renameExtra(list, change.id, change.name);
    case "remove":
      return removeExtra(list, change.id);
    case "uncheck-all":
      return uncheckAll(list);
  }
}

export type PantryChange = { type: "add"; name: string } | { type: "remove"; key: string; id?: number | undefined };

export function applyPantryChange(pantry: Pantry, change: PantryChange): Pantry {
  return change.type === "add" ? addPantryItem(pantry, change.name) : removePantryKey(pantry, change.key);
}

export function applyPantryChanges(pantry: Pantry, waiting: readonly PantryChange[]): Pantry {
  return waiting.reduce(applyPantryChange, pantry);
}

/** The shopping list with its waiting changes, then the waiting pantry changes (the `in_pantry` flags). */
export function applyShoppingOverlay(
  list: ShoppingList,
  shopping: readonly ShoppingMutationVariables[],
  pantry: readonly PantryChange[],
): ShoppingList {
  const checked = shopping.reduce(
    (current, { weekStart, change }) => (weekStart === list.week_start ? applyShoppingChange(current, change) : current),
    list,
  );
  return pantry.reduce(
    (current, change) =>
      setInPantry(current, change.type === "add" ? ingredientKey(change.name) : change.key, change.type === "add"),
    checked,
  );
}

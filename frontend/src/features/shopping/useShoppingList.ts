import { useMutation, useQuery, type MutationOptions, type QueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  addShoppingExtra,
  deleteShoppingExtra,
  getShoppingList,
  setShoppingCheck,
  uncheckShoppingList,
  updateShoppingExtra,
} from "../../api/client";
import type { ShoppingExtraUpdate, ShoppingList } from "../../api/types";
import i18n from "../../i18n";
import { retryAfterSignIn } from "../../offline/authRetry";
import { PANTRY_CHANGE_KEY, SHOPPING_CHANGE_KEY } from "../../offline/keys";
import { pushNotice } from "../../offline/notices";
import { usePendingVariables } from "../../offline/pending";
import {
  applyShoppingOverlay,
  type PantryChange,
  type ShoppingChange,
  type ShoppingMutationVariables,
} from "./shoppingChanges";

/** Prefix of every cached shopping list (one per week). */
export const shoppingRootKey = ["shopping"] as const;
export const shoppingKey = (weekStart: string) => ["shopping", weekStart] as const;

/** The list as the user sees it: the server's list with the waiting changes (and pantry changes) laid over it. */
export function useShoppingList(weekStart: string) {
  const shopping = usePendingVariables<ShoppingMutationVariables>([SHOPPING_CHANGE_KEY, weekStart]);
  const pantry = usePendingVariables<PantryChange>([PANTRY_CHANGE_KEY]);
  const select = useCallback(
    (list: ShoppingList) => applyShoppingOverlay(list, shopping, pantry),
    [shopping, pantry],
  );
  return useQuery({
    queryKey: shoppingKey(weekStart),
    queryFn: ({ signal }) => getShoppingList(weekStart, signal),
    select,
  });
}

export interface ShoppingActions {
  toggleItem: (key: string, checked: boolean) => void;
  toggleExtra: (id: number, checked: boolean) => void;
  addExtra: (name: string) => void;
  renameExtra: (id: number, name: string) => void;
  removeExtra: (id: number) => void;
  uncheckAll: () => void;
}

/** Changes of one week reach the server one at a time, in order (a check-then-uncheck must not arrive reversed). */
export const shoppingScope = (weekStart: string) => ({ id: `shopping-${weekStart}` });

function send(weekStart: string, change: ShoppingChange): Promise<ShoppingList> {
  switch (change.type) {
    case "item":
      return setShoppingCheck(weekStart, change.key, change.checked);
    case "extra-check": {
      const changes: ShoppingExtraUpdate = { checked: change.checked };
      return updateShoppingExtra(weekStart, change.id, changes);
    }
    case "add":
      return addShoppingExtra(weekStart, change.name);
    case "rename":
      return updateShoppingExtra(weekStart, change.id, { name: change.name });
    case "remove":
      return deleteShoppingExtra(weekStart, change.id);
    case "uncheck-all":
      return uncheckShoppingList(weekStart);
  }
}

/**
 * What a shopping change does, in this page or restored from the device (see
 * `registerMutationDefaults`). A success stores the server's list as the base the waiting
 * changes are overlaid on; the list is refetched once the last change of the week settles.
 */
export function shoppingMutationDefaults(
  queryClient: QueryClient,
): MutationOptions<ShoppingList, unknown, ShoppingMutationVariables> {
  return {
    mutationFn: ({ weekStart, change }) => retryAfterSignIn(() => send(weekStart, change)),
    onSuccess: (list, { weekStart }) => {
      queryClient.setQueryData<ShoppingList>(shoppingKey(weekStart), list);
    },
    onError: () => pushNotice(i18n.t("shopping.updateFailed")),
    onSettled: (_list, _error, { weekStart }) => {
      if (queryClient.isMutating({ mutationKey: [SHOPPING_CHANGE_KEY, weekStart] }) <= 1) {
        void queryClient.invalidateQueries({ queryKey: shoppingKey(weekStart) });
      }
    },
  };
}

/**
 * Shopping list mutations. A change shows at once (`useShoppingList` overlays the waiting
 * changes on the server's list), is sent in order, waits for the connection and survives
 * closing the app. A failure drops the overlay and is reported through `onError`.
 */
export function useShoppingActions(
  weekStart: string,
  onError: (message: string) => void,
): ShoppingActions {
  const { t } = useTranslation();

  const { mutate } = useMutation<ShoppingList, unknown, ShoppingMutationVariables>({
    mutationKey: [SHOPPING_CHANGE_KEY, weekStart],
    scope: shoppingScope(weekStart),
    onError: () => onError(t("shopping.updateFailed")),
  });
  const submit = (change: ShoppingChange) => mutate({ weekStart, change });

  return {
    toggleItem: (itemKey, checked) => submit({ type: "item", key: itemKey, checked }),
    toggleExtra: (id, checked) => submit({ type: "extra-check", id, checked }),
    addExtra: (name) => submit({ type: "add", name }),
    renameExtra: (id, name) => submit({ type: "rename", id, name }),
    removeExtra: (id) => submit({ type: "remove", id }),
    uncheckAll: () => submit({ type: "uncheck-all" }),
  };
}

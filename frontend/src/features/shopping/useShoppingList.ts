import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import {
  appendExtra,
  removeExtra,
  renameExtra,
  setExtraChecked,
  setItemChecked,
  uncheckAll,
} from "./shoppingLogic";

export const shoppingKey = (weekStart: string) => ["shopping", weekStart] as const;

export function useShoppingList(weekStart: string) {
  return useQuery({
    queryKey: shoppingKey(weekStart),
    queryFn: ({ signal }) => getShoppingList(weekStart, signal),
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

type Change =
  | { type: "item"; key: string; checked: boolean }
  | { type: "extra-check"; id: number; checked: boolean }
  | { type: "add"; name: string }
  | { type: "rename"; id: number; name: string }
  | { type: "remove"; id: number }
  | { type: "uncheck-all" };

function applyChange(list: ShoppingList, change: Change): ShoppingList {
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

function send(weekStart: string, change: Change): Promise<ShoppingList> {
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
 * Shopping list mutations with optimistic updates. A failed change is rolled back to the
 * snapshot taken before it and reported through `onError`; the list is refetched once the
 * last in-flight change settles, so the server stays the source of truth.
 */
export function useShoppingActions(
  weekStart: string,
  onError: (message: string) => void,
): ShoppingActions {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const key = shoppingKey(weekStart);
  const mutationKey = ["shopping-change", weekStart];

  const { mutate } = useMutation<ShoppingList, unknown, Change, { previous: ShoppingList | undefined }>({
    mutationKey,
    // Changes of one week reach the server one at a time, in order, like plan changes:
    // a quick check-then-uncheck must not arrive reversed.
    scope: { id: `shopping-${weekStart}` },
    mutationFn: (change) => send(weekStart, change),
    onMutate: async (change) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ShoppingList>(key);
      if (previous) queryClient.setQueryData<ShoppingList>(key, applyChange(previous, change));
      return { previous };
    },
    onError: (_error, _change, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      onError(t("shopping.updateFailed"));
    },
    onSettled: () => {
      if (queryClient.isMutating({ mutationKey }) <= 1) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    },
  });

  return {
    toggleItem: (itemKey, checked) => mutate({ type: "item", key: itemKey, checked }),
    toggleExtra: (id, checked) => mutate({ type: "extra-check", id, checked }),
    addExtra: (name) => mutate({ type: "add", name }),
    renameExtra: (id, name) => mutate({ type: "rename", id, name }),
    removeExtra: (id) => mutate({ type: "remove", id }),
    uncheckAll: () => mutate({ type: "uncheck-all" }),
  };
}

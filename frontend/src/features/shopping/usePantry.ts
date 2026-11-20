import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { addToPantry, getPantry, removeFromPantry } from "../../api/client";
import type { Pantry, PantryItem, ShoppingList } from "../../api/types";
import {
  addPantryItem,
  confirmPantryItem,
  ingredientKey,
  isPendingPantryId,
  removePantryKey,
  setInPantry,
} from "./pantryLogic";
import { shoppingRootKey } from "./useShoppingList";

export const pantryKey = ["pantry"] as const;

export function usePantry() {
  return useQuery({
    queryKey: pantryKey,
    queryFn: ({ signal }) => getPantry(signal),
  });
}

export interface PantryActions {
  /** Add a staple by name. */
  add: (name: string) => void;
  /** Remove the staple with this key; `id` is its server id when known. */
  remove: (key: string, id?: number) => void;
}

type Change = { type: "add"; name: string } | { type: "remove"; key: string; id?: number | undefined };

interface Snapshot {
  pantry: Pantry | undefined;
  lists: [readonly unknown[], ShoppingList | undefined][];
}

/** Id of the staple with this key on the server, when the client does not know a real one. */
async function serverId(key: string): Promise<number | undefined> {
  const pantry = await getPantry();
  return pantry.items.find((item) => item.key === key)?.id;
}

async function send(change: Change): Promise<PantryItem | null> {
  if (change.type === "add") return addToPantry(change.name);
  const id = change.id !== undefined && !isPendingPantryId(change.id) ? change.id : await serverId(change.key);
  if (id !== undefined) await removeFromPantry(id);
  return null;
}

/**
 * Pantry mutations. They are optimistic across the pantry query and every cached shopping
 * list (the `in_pantry` flags), so an item moves between sections at once. Requests are sent
 * one at a time (scope `pantry`) and pause offline like the other mutations. A failure rolls
 * everything back and is reported through `onError`; the queries are refetched once the last
 * change settles.
 */
export function usePantryActions(onError: (message: string) => void): PantryActions {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const mutationKey = ["pantry-change"];

  const { mutate } = useMutation<PantryItem | null, unknown, Change, Snapshot>({
    mutationKey,
    scope: { id: "pantry" },
    mutationFn: send,
    onMutate: async (change) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: pantryKey }),
        queryClient.cancelQueries({ queryKey: shoppingRootKey }),
      ]);
      const snapshot: Snapshot = {
        pantry: queryClient.getQueryData<Pantry>(pantryKey),
        lists: queryClient.getQueriesData<ShoppingList>({ queryKey: shoppingRootKey }),
      };
      const key = change.type === "add" ? ingredientKey(change.name) : change.key;
      const inPantry = change.type === "add";
      if (snapshot.pantry) {
        queryClient.setQueryData<Pantry>(
          pantryKey,
          change.type === "add"
            ? addPantryItem(snapshot.pantry, change.name)
            : removePantryKey(snapshot.pantry, change.key),
        );
      }
      for (const [listKey, list] of snapshot.lists) {
        if (list) queryClient.setQueryData<ShoppingList>(listKey, setInPantry(list, key, inPantry));
      }
      return snapshot;
    },
    onSuccess: (saved) => {
      // Swap the optimistic copy (temporary id) for the server's item, so it can be removed.
      if (saved) {
        queryClient.setQueryData<Pantry>(pantryKey, (pantry) =>
          pantry ? confirmPantryItem(pantry, saved) : pantry,
        );
      }
    },
    onError: (_error, _change, snapshot) => {
      if (snapshot) {
        queryClient.setQueryData(pantryKey, snapshot.pantry);
        for (const [listKey, list] of snapshot.lists) queryClient.setQueryData(listKey, list);
      }
      onError(t("pantry.updateFailed"));
    },
    onSettled: () => {
      if (queryClient.isMutating({ mutationKey }) <= 1) {
        void queryClient.invalidateQueries({ queryKey: pantryKey });
        void queryClient.invalidateQueries({ queryKey: shoppingRootKey });
      }
    },
  });

  return {
    add: (name) => mutate({ type: "add", name }),
    remove: (key, id) => mutate({ type: "remove", key, id }),
  };
}

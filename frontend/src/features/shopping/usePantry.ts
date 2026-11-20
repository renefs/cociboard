import { useMutation, useQuery, type MutationOptions, type QueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { addToPantry, getPantry, removeFromPantry } from "../../api/client";
import type { Pantry, PantryItem, ShoppingList } from "../../api/types";
import i18n from "../../i18n";
import { retryAfterSignIn } from "../../offline/authRetry";
import { PANTRY_CHANGE_KEY } from "../../offline/keys";
import { pushNotice } from "../../offline/notices";
import { usePendingVariables } from "../../offline/pending";
import { applyPantryChanges, type PantryChange } from "./shoppingChanges";
import {
  confirmPantryItem,
  ingredientKey,
  isPendingPantryId,
  removePantryKey,
  setInPantry,
} from "./pantryLogic";
import { shoppingRootKey } from "./useShoppingList";

export const pantryKey = ["pantry"] as const;

/** The pantry as the user sees it: the server's pantry with the waiting changes laid over it. */
export function usePantry() {
  const waiting = usePendingVariables<PantryChange>([PANTRY_CHANGE_KEY]);
  const select = useCallback((pantry: Pantry) => applyPantryChanges(pantry, waiting), [waiting]);
  return useQuery({
    queryKey: pantryKey,
    queryFn: ({ signal }) => getPantry(signal),
    select,
  });
}

export interface PantryActions {
  /** Add a staple by name. */
  add: (name: string) => void;
  /** Remove the staple with this key; `id` is its server id when known. */
  remove: (key: string, id?: number) => void;
}

/** Id of the staple with this key on the server, when the client does not know a real one. */
async function serverId(key: string): Promise<number | undefined> {
  const pantry = await getPantry();
  return pantry.items.find((item) => item.key === key)?.id;
}

async function send(change: PantryChange): Promise<PantryItem | null> {
  if (change.type === "add") return addToPantry(change.name);
  const id = change.id !== undefined && !isPendingPantryId(change.id) ? change.id : await serverId(change.key);
  if (id !== undefined) await removeFromPantry(id);
  return null;
}

/** Pantry requests are sent one at a time, in order. */
export const PANTRY_SCOPE = { id: "pantry" };

/**
 * What a pantry change does, in this page or restored from the device (see
 * `registerMutationDefaults`). A success applies the same change to the stored pantry and
 * shopping lists, which are the base the waiting changes are overlaid on; the queries are
 * refetched once the last change settles.
 */
export function pantryMutationDefaults(
  queryClient: QueryClient,
): MutationOptions<PantryItem | null, unknown, PantryChange> {
  return {
    mutationFn: (change) => retryAfterSignIn(() => send(change)),
    onSuccess: (saved, change) => {
      const key = change.type === "add" ? ingredientKey(change.name) : change.key;
      queryClient.setQueryData<Pantry>(pantryKey, (pantry) => {
        if (!pantry) return pantry;
        if (change.type === "remove") return removePantryKey(pantry, change.key);
        // The server's item (real id) takes the place of the name that was sent.
        const confirmed = saved ? confirmPantryItem(pantry, saved) : pantry;
        return { ...confirmed, suggestions: confirmed.suggestions.filter((suggestion) => suggestion.key !== key) };
      });
      for (const [listKey, list] of queryClient.getQueriesData<ShoppingList>({ queryKey: shoppingRootKey })) {
        if (list) queryClient.setQueryData<ShoppingList>(listKey, setInPantry(list, key, change.type === "add"));
      }
    },
    onError: () => pushNotice(i18n.t("pantry.updateFailed")),
    onSettled: () => {
      if (queryClient.isMutating({ mutationKey: [PANTRY_CHANGE_KEY] }) <= 1) {
        void queryClient.invalidateQueries({ queryKey: pantryKey });
        void queryClient.invalidateQueries({ queryKey: shoppingRootKey });
      }
    },
  };
}

/**
 * Pantry mutations. The pantry and every cached shopping list (the `in_pantry` flags) show a
 * change at once because their hooks overlay the waiting ones, so an item moves between
 * sections immediately. Requests are sent one at a time (scope `pantry`), wait for the
 * connection and survive closing the app. A failure drops the overlay and is reported through
 * `onError`.
 */
export function usePantryActions(onError: (message: string) => void): PantryActions {
  const { t } = useTranslation();
  const { mutate } = useMutation<PantryItem | null, unknown, PantryChange>({
    mutationKey: [PANTRY_CHANGE_KEY],
    scope: PANTRY_SCOPE,
    onError: () => onError(t("pantry.updateFailed")),
  });

  return {
    add: (name) => mutate({ type: "add", name }),
    remove: (key, id) => mutate({ type: "remove", key, id }),
  };
}

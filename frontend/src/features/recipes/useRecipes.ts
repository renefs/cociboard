import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { listRecipes } from "../../api/client";
import type { Recipe, RecipeFilters } from "../../api/types";
import { FAVOURITE_CHANGE_KEY } from "../../offline/keys";
import { usePendingVariables } from "../../offline/pending";
import { applyFavouriteToggles } from "./favouriteLogic";
import type { FavouriteInput } from "./useRecipeMutations";

/** The recipes as the user sees them: the server's list with the waiting favourite toggles laid over it. */
export function useRecipes(filters: RecipeFilters, enabled = true) {
  const waiting = usePendingVariables<FavouriteInput>([FAVOURITE_CHANGE_KEY]);
  const onlyFavourites = filters.favourite ?? false;
  const select = useCallback(
    (list: Recipe[]) => applyFavouriteToggles(list, waiting, onlyFavourites),
    [waiting, onlyFavourites],
  );
  return useQuery({
    queryKey: [
      "recipes",
      filters.slot ?? null,
      filters.q ?? "",
      [...(filters.properties ?? [])],
      filters.archived ?? false,
      filters.favourite ?? false,
    ],
    enabled,
    queryFn: ({ signal }) => listRecipes(filters, signal),
    placeholderData: keepPreviousData,
    select,
  });
}

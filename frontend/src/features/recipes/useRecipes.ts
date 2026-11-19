import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { listRecipes } from "../../api/client";
import type { RecipeFilters } from "../../api/types";

export function useRecipes(filters: RecipeFilters, enabled = true) {
  return useQuery({
    queryKey: [
      "recipes",
      filters.slot ?? null,
      filters.q ?? "",
      [...(filters.properties ?? [])],
      filters.archived ?? false,
    ],
    enabled,
    queryFn: ({ signal }) => listRecipes(filters, signal),
    placeholderData: keepPreviousData,
  });
}

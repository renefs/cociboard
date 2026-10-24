import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { listRecipes } from "../../api/client";
import type { RecipeFilters } from "../../api/types";

export function useRecipes(filters: RecipeFilters) {
  return useQuery({
    queryKey: ["recipes", filters.slot ?? null, filters.q ?? "", [...(filters.properties ?? [])]],
    queryFn: ({ signal }) => listRecipes(filters, signal),
    placeholderData: keepPreviousData,
  });
}

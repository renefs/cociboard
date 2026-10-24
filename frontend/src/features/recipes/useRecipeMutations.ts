import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createRecipe, deleteRecipe, getRecipeUsage, updateRecipe } from "../../api/client";
import type { Recipe, RecipeCreate, RecipeUpdate } from "../../api/types";

/**
 * Recipes appear in the catalogue, in week plans and in slot candidates. The refetches run
 * in the background so the dialog can close at once; they are not awaited on purpose.
 */
function useInvalidateRecipeData(): () => void {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["recipes"] });
    void queryClient.invalidateQueries({ queryKey: ["week"] });
    void queryClient.invalidateQueries({ queryKey: ["candidates"] });
  };
}

export function useCreateRecipe() {
  const invalidate = useInvalidateRecipeData();
  return useMutation<Recipe, unknown, RecipeCreate>({
    mutationFn: (recipe) => createRecipe(recipe),
    onSuccess: invalidate,
  });
}

export interface UpdateRecipeInput {
  id: number;
  changes: RecipeUpdate;
  /** Remove planned meals that no longer fit a changed meal type. */
  force?: boolean;
}

export function useUpdateRecipe() {
  const invalidate = useInvalidateRecipeData();
  return useMutation<Recipe, unknown, UpdateRecipeInput>({
    mutationFn: ({ id, changes, force }) => updateRecipe(id, changes, force),
    onSuccess: invalidate,
  });
}

export function useDeleteRecipe() {
  const invalidate = useInvalidateRecipeData();
  return useMutation<void, unknown, number>({
    mutationFn: (id) => deleteRecipe(id),
    onSuccess: invalidate,
  });
}

/** How many planned slots (all weeks) use the recipe. Always fresh. */
export function useRecipeUsage(recipeId: number, enabled = true) {
  return useQuery({
    queryKey: ["recipe-usage", recipeId],
    retry: false,
    queryFn: ({ signal }) => getRecipeUsage(recipeId, signal),
    enabled,
    gcTime: 0,
  });
}

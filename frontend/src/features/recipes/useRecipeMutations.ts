import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  createRecipe,
  deleteRecipe,
  getRecipeHistory,
  getRecipeUsage,
  updateRecipe,
} from "../../api/client";
import { isFavouritesKey, withFavourite } from "./favouriteLogic";
import type { Recipe, RecipeCreate, RecipeUpdate } from "../../api/types";

/**
 * Recipes appear in the catalogue, in week plans, in slot candidates and in shopping lists. The refetches run
 * in the background so the dialog can close at once; they are not awaited on purpose.
 */
function useInvalidateRecipeData(): () => void {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["recipes"] });
    void queryClient.invalidateQueries({ queryKey: ["week"] });
    void queryClient.invalidateQueries({ queryKey: ["candidates"] });
    void queryClient.invalidateQueries({ queryKey: ["shopping"] });
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

/** The planned meals of a recipe (past and upcoming). Refetched when plans change, see `usePlanActions`. */
export function useRecipeHistory(recipeId: number) {
  return useQuery({
    queryKey: recipeHistoryKey(recipeId),
    queryFn: ({ signal }) => getRecipeHistory(recipeId, signal),
  });
}

export const recipeHistoryKey = (recipeId: number) => ["recipe-history", recipeId] as const;

export interface FavouriteInput {
  recipe: Pick<Recipe, "id" | "name">;
  favourite: boolean;
}

function patchCachedRecipes(queryClient: QueryClient, id: number, favourite: boolean): void {
  for (const [key, list] of queryClient.getQueriesData<Recipe[]>({ queryKey: ["recipes"] })) {
    if (list) queryClient.setQueryData(key, withFavourite(list, id, favourite, isFavouritesKey(key)));
  }
}

/**
 * Starring a recipe. Every cached recipe list changes at once; requests are sent one at a
 * time (scope `recipe-favourite`) and pause offline like the other mutations. A failure puts
 * that one recipe back (not a snapshot, so a later toggle of another recipe survives) and is
 * reported through `onError`. Once the last toggle settles the lists are refetched, which also
 * brings a newly starred recipe into a favourites-only list.
 */
export function useToggleFavourite(onError: (message: string, input: FavouriteInput) => void) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const mutationKey = ["favourite-change"];

  const { mutate } = useMutation<Recipe, unknown, FavouriteInput>({
    mutationKey,
    scope: { id: "recipe-favourite" },
    mutationFn: ({ recipe, favourite }) => updateRecipe(recipe.id, { favourite }),
    onMutate: async ({ recipe, favourite }) => {
      await queryClient.cancelQueries({ queryKey: ["recipes"] });
      patchCachedRecipes(queryClient, recipe.id, favourite);
    },
    onError: (_error, input) => {
      const { recipe, favourite } = input;
      patchCachedRecipes(queryClient, recipe.id, !favourite);
      onError(t("recipes.favourite.failed", { name: recipe.name }), input);
    },
    onSettled: () => {
      if (queryClient.isMutating({ mutationKey }) <= 1) {
        void queryClient.invalidateQueries({ queryKey: ["recipes"] });
        // The slot picker shows the star too.
        void queryClient.invalidateQueries({ queryKey: ["candidates"] });
      }
    },
  });

  return (recipe: FavouriteInput["recipe"], favourite: boolean) => mutate({ recipe, favourite });
}

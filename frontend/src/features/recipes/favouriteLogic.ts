import type { Recipe } from "../../api/types";

/**
 * A cached recipe list with one recipe's favourite flag changed. In a list that holds only
 * favourites a recipe that stops being one is removed; one that becomes a favourite can't be
 * added (the list doesn't have it), so the refetch after the change brings it in.
 */
export function withFavourite(
  list: readonly Recipe[],
  id: number,
  favourite: boolean,
  onlyFavourites: boolean,
): Recipe[] {
  if (onlyFavourites && !favourite) return list.filter((recipe) => recipe.id !== id);
  return list.map((recipe) => (recipe.id === id ? { ...recipe, favourite } : recipe));
}

/** Position of the "favourites only" flag in the `["recipes", ...]` query keys (see `useRecipes`). */
const FAVOURITE_KEY_INDEX = 5;

/** Whether a `["recipes", ...]` query key is the favourites-only list. */
export function isFavouritesKey(key: readonly unknown[]): boolean {
  return key[FAVOURITE_KEY_INDEX] === true;
}

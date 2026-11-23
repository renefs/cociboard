import type { RecipeProperty } from "../../api/types";

export type SortMode = "name" | "variety" | "lately";

/**
 * How many filters hide inside the "Filters" panel: a sort other than A–Z counts as one, and
 * every selected property as one. (Search, meal type and favourites are visible in the bar.)
 */
export function activeFilterCount(sort: SortMode, properties: readonly RecipeProperty[]): number {
  return (sort === "name" ? 0 : 1) + properties.length;
}

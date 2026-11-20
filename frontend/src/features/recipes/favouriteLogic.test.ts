import { describe, expect, it } from "vitest";
import { makeRecipe } from "../../test/fixtures";
import { isFavouritesKey, withFavourite } from "./favouriteLogic";

const a = makeRecipe({ id: 1, name: "A", favourite: true });
const b = makeRecipe({ id: 2, name: "B" });

describe("withFavourite", () => {
  it("changes only the one recipe and keeps the order", () => {
    const result = withFavourite([a, b], 2, true, false);
    expect(result.map((r) => [r.id, r.favourite])).toEqual([
      [1, true],
      [2, true],
    ]);
  });

  it("does not mutate the list", () => {
    withFavourite([a, b], 1, false, false);
    expect(a.favourite).toBe(true);
  });

  it("removes an unstarred recipe from a favourites-only list", () => {
    expect(withFavourite([a], 1, false, true)).toEqual([]);
  });

  it("leaves a favourites-only list alone when a recipe it lacks is starred", () => {
    expect(withFavourite([a], 2, true, true)).toEqual([a]);
  });
});

describe("isFavouritesKey", () => {
  it("reads the favourite flag of a recipes query key", () => {
    expect(isFavouritesKey(["recipes", null, "", [], false, true])).toBe(true);
    expect(isFavouritesKey(["recipes", null, "", [], false, false])).toBe(false);
  });
});

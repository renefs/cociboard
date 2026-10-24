import { describe, expect, it } from "vitest";
import { MEAL_TYPES, PROTEINS, RECIPE_PROPERTIES } from "../../api/types";
import { MEAL_TYPE_META, PROPERTY_META, PROTEIN_META, type Meta } from "./recipeMeta";

function expectComplete(map: Record<string, Meta>, values: readonly string[]) {
  expect(Object.keys(map).sort()).toEqual([...values].sort());
  for (const value of values) {
    const meta = map[value];
    expect(meta?.icon, value).toBeTruthy();
    expect(meta?.label, value).toBeTruthy();
    expect(meta?.color, value).toMatch(/^#[0-9a-f]{6}$/i);
  }
}

describe("recipeMeta", () => {
  it("covers every meal type", () => expectComplete(MEAL_TYPE_META, MEAL_TYPES));
  it("covers every protein", () => expectComplete(PROTEIN_META, PROTEINS));
  it("covers every property", () => expectComplete(PROPERTY_META, RECIPE_PROPERTIES));

  it("uses unique labels and icons within each group", () => {
    for (const map of [MEAL_TYPE_META, PROTEIN_META, PROPERTY_META]) {
      const metas = Object.values(map);
      expect(new Set(metas.map((m) => m.label)).size).toBe(metas.length);
      expect(new Set(metas.map((m) => m.icon)).size).toBe(metas.length);
    }
  });
});

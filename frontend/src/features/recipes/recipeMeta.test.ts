import i18n from "../../i18n";
import { describe, expect, it } from "vitest";
import { MEAL_TYPES, PROTEINS, RECIPE_PROPERTIES } from "../../api/types";
import { MEAL_TYPE_META, PROPERTY_META, PROTEIN_META, type Meta, type MetaLabelKey } from "./recipeMeta";

function expectComplete(map: Record<string, Meta>, values: readonly string[]) {
  expect(Object.keys(map).sort()).toEqual([...values].sort());
  for (const value of values) {
    const meta = map[value];
    expect(meta?.icon, value).toBeTruthy();
    expect(meta?.labelKey, value).toBeTruthy();
    expect(i18n.t(meta?.labelKey as MetaLabelKey), value).not.toBe(meta?.labelKey);
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
      expect(new Set(metas.map((m) => i18n.t(m.labelKey))).size).toBe(metas.length);
      expect(new Set(metas.map((m) => m.icon)).size).toBe(metas.length);
    }
  });
});

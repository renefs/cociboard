import i18n from "../../i18n";
import { describe, expect, it } from "vitest";
import { SPECIAL_MEALS } from "../../api/types";
import { SPECIAL_META } from "./specialMeta";

describe("specialMeta", () => {
  it("covers every special meal with an icon and a translated label", () => {
    expect(Object.keys(SPECIAL_META).sort()).toEqual([...SPECIAL_MEALS].sort());
    for (const special of SPECIAL_MEALS) {
      const meta = SPECIAL_META[special];
      expect(meta.icon).toBeTruthy();
      expect(i18n.getFixedT("en")(meta.labelKey)).not.toBe(meta.labelKey);
      expect(i18n.getFixedT("es")(meta.labelKey)).not.toBe(meta.labelKey);
    }
  });

  it("has the agreed labels", () => {
    const en = i18n.getFixedT("en");
    const es = i18n.getFixedT("es");
    expect(SPECIAL_MEALS.map((s) => en(SPECIAL_META[s].labelKey))).toEqual(["Eating out", "Leftovers", "Free"]);
    expect(SPECIAL_MEALS.map((s) => es(SPECIAL_META[s].labelKey))).toEqual(["Comemos fuera", "Sobras", "Libre"]);
  });

  it("uses distinct icons that clash with no recipe meta", async () => {
    const { MEAL_TYPE_META, PROPERTY_META, PROTEIN_META } = await import("../recipes/recipeMeta");
    const recipeIcons = new Set(
      [MEAL_TYPE_META, PROTEIN_META, PROPERTY_META].flatMap((map) => Object.values(map).map((m) => m.icon)),
    );
    const icons = SPECIAL_MEALS.map((s) => SPECIAL_META[s].icon);
    expect(new Set(icons).size).toBe(icons.length);
    for (const icon of icons) expect(recipeIcons.has(icon)).toBe(false);
  });
});

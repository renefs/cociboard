import { describe, expect, it } from "vitest";
import { MEAL_TYPE_META, PROPERTY_META, PROTEIN_META } from "./recipeMeta";

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r = 0, g = 0, b = 0] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const BACKGROUNDS = ["#ffffff", "#fff8f0", "#fbf1e4", "#fff1e0"]; // surface, page, slot, chip
const AA = 4.5;

describe("colour contrast (WCAG AA)", () => {
  const metas = { ...MEAL_TYPE_META, ...PROTEIN_META, ...PROPERTY_META };
  for (const [key, meta] of Object.entries(metas)) {
    it(`${key} accent colour is readable as text`, () => {
      for (const background of BACKGROUNDS) {
        expect(contrast(meta.color, background)).toBeGreaterThanOrEqual(AA);
      }
    });
  }

  it("muted text and the primary colour pass on every background", () => {
    for (const background of BACKGROUNDS) {
      expect(contrast("#7a6455", background)).toBeGreaterThanOrEqual(AA);
      expect(contrast("#b9461f", background)).toBeGreaterThanOrEqual(AA);
    }
    expect(contrast("#ffffff", "#b9461f")).toBeGreaterThanOrEqual(AA);
  });
});

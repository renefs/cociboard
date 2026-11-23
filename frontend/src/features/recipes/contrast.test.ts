import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MEAL_TYPE_META, PROPERTY_META, PROTEIN_META } from "./recipeMeta";

const css = readFileSync(resolve(process.cwd(), "src/styles/tokens.css"), "utf8");

/** The `--name: value;` declarations of a block, with `var(--other)` aliases resolved. */
function parseTokens(block: string): Record<string, string> {
  const tokens: Record<string, string> = {};
  for (const [, name, value] of block.matchAll(/(--[\w-]+):\s*([^;]+);/g)) tokens[name as string] = (value as string).trim();
  return tokens;
}

const darkStart = css.indexOf("@media screen and (prefers-color-scheme: dark)");
const light = parseTokens(css.slice(0, darkStart));
const dark = { ...light, ...parseTokens(css.slice(darkStart)) };

function token(tokens: Record<string, string>, name: string): string {
  let value = tokens[name];
  const alias = /^var\((--[\w-]+)\)$/;
  while (value !== undefined && alias.test(value)) value = tokens[(alias.exec(value) as RegExpExecArray)[1] as string];
  if (value === undefined || !/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`${name} is not a hex colour: ${value}`);
  return value;
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r = 0, g = 0, b = 0] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const AA = 4.5;
const SURFACES = ["--color-bg", "--color-surface", "--color-surface-sunken", "--color-primary-tint"] as const;
const THEMES = { light, dark } as const;

describe("tokens.css", () => {
  it("defines the dark theme for screens only, so paper stays light", () => {
    expect(darkStart).toBeGreaterThan(0);
    expect(css).toContain("color-scheme: light");
    expect(css).toContain("color-scheme: dark");
  });
});

describe.each(Object.entries(THEMES))("colour contrast (WCAG AA), %s theme", (_name, tokens) => {
  const colour = (name: string) => token(tokens, name);

  it.each(["--color-text", "--color-text-muted", "--color-primary"])("%s is readable on every surface", (name) => {
    for (const surface of SURFACES) {
      expect(contrast(colour(name), colour(surface)), `${name} on ${surface}`).toBeGreaterThanOrEqual(AA);
    }
  });

  it("the text on a primary fill is readable", () => {
    expect(contrast(colour("--color-primary-contrast"), colour("--color-primary"))).toBeGreaterThanOrEqual(AA);
  });

  it.each(["--color-ok", "--color-danger", "--color-warning"])("%s is readable on the surfaces", (name) => {
    for (const surface of ["--color-bg", "--color-surface", "--color-surface-sunken"]) {
      expect(contrast(colour(name), colour(surface)), `${name} on ${surface}`).toBeGreaterThanOrEqual(AA);
    }
  });

  it("status text is readable on its tint", () => {
    expect(contrast(colour("--color-ok"), colour("--color-ok-tint"))).toBeGreaterThanOrEqual(AA);
    expect(contrast(colour("--color-danger"), colour("--color-danger-tint"))).toBeGreaterThanOrEqual(AA);
    expect(contrast(colour("--color-text"), colour("--color-today"))).toBeGreaterThanOrEqual(AA);
  });

  it.each(["good", "fair", "poor"])("the %s variety badge is readable", (verdict) => {
    expect(contrast(colour(`--variety-${verdict}-text`), colour(`--variety-${verdict}-bg`))).toBeGreaterThanOrEqual(AA);
    expect(contrast(colour("--color-on-strong"), colour(`--variety-${verdict}-strong`))).toBeGreaterThanOrEqual(AA);
  });

  it("the focus ring is visible against the surfaces (3:1)", () => {
    for (const surface of ["--color-bg", "--color-surface"]) {
      expect(contrast(colour("--color-focus"), colour(surface))).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("recipe accent colours", () => {
  const lightSurfaces = SURFACES.map((name) => token(light, name));
  const darkSurfaces = ["--color-bg", "--color-surface", "--color-surface-sunken"].map((name) => token(dark, name));

  for (const [key, meta] of Object.entries({ ...MEAL_TYPE_META, ...PROTEIN_META, ...PROPERTY_META })) {
    it(`${key} is readable as text on the light surfaces`, () => {
      for (const surface of lightSurfaces) expect(contrast(meta.color, surface)).toBeGreaterThanOrEqual(AA);
    });
  }

  for (const [key, meta] of Object.entries(MEAL_TYPE_META)) {
    it(`${key} has a dark-theme colour readable on the dark surfaces`, () => {
      for (const surface of darkSurfaces) expect(contrast(meta.darkColor, surface)).toBeGreaterThanOrEqual(AA);
    });
  }
});

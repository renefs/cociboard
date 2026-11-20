import { describe, expect, it } from "vitest";
import { ApiError } from "../../api/client";
import i18n from "../../i18n";
import { makeDraft } from "../../test/fixtures";
import {
  applyDraft,
  describeImportError,
  describeWarnings,
  hasTypedContent,
  importedHost,
  isImportDisabled,
  normalizeImportUrl,
} from "./importLogic";
import { emptyValues } from "./recipeFormLogic";

const t = i18n.getFixedT("en");
const failure = (status: number, detail: unknown) => new ApiError(status, "failed", detail);

describe("normalizeImportUrl", () => {
  it("trims, keeps full links and adds https to a bare host", () => {
    expect(normalizeImportUrl("  https://example.com/r?x=1 ")).toBe("https://example.com/r?x=1");
    expect(normalizeImportUrl("http://example.com")).toBe("http://example.com");
    expect(normalizeImportUrl("example.com/recipe")).toBe("https://example.com/recipe");
  });

  it("rejects anything that is not a web link", () => {
    for (const bad of ["", "   ", "lentils", "ftp://example.com", "javascript:alert(1)", "https://", "a b.com", "https://x.com/" + "a".repeat(2000)]) {
      expect(normalizeImportUrl(bad)).toBeNull();
    }
  });
});

describe("hasTypedContent and applyDraft", () => {
  it("an untouched form has no content; meal type and protein alone do not count", () => {
    expect(hasTypedContent(emptyValues())).toBe(false);
    expect(hasTypedContent({ ...emptyValues(), mealType: "dinner", protein: "fish" })).toBe(false);
    expect(hasTypedContent({ ...emptyValues(), ingredients: ["  "], steps: [""] })).toBe(false);
  });

  it.each([
    { name: "x" },
    { description: "x" },
    { prepMinutes: "5" },
    { servings: "2" },
    { sourceUrl: "https://a.b" },
    { ingredients: ["salt"] },
    { steps: ["boil"] },
  ])("any typed field counts: %o", (change) => {
    expect(hasTypedContent({ ...emptyValues(), ...change })).toBe(true);
  });

  it("fills the form but keeps the meal type, protein and properties", () => {
    const current = { ...emptyValues(), mealType: "dinner" as const, protein: "fish" as const, properties: ["vegan" as const] };
    const next = applyDraft(current, makeDraft());
    expect(next).toMatchObject({
      name: "Lemon Chicken Traybake",
      description: "A simple weeknight dinner.",
      prepMinutes: "60",
      servings: "4",
      ingredients: ["8 chicken thighs", "2 lemons"],
      steps: ["Heat the oven.", "Roast."],
      sourceUrl: "https://www.example.com/final",
      mealType: "dinner",
      protein: "fish",
      properties: ["vegan"],
    });
  });

  it("maps missing fields to empty ones, keeping one blank ingredient row", () => {
    const next = applyDraft(
      emptyValues(),
      makeDraft({ description: null, servings: null, prep_minutes: null, ingredients: [], steps: [], source_url: null }),
    );
    expect(next).toMatchObject({ description: "", servings: "", prepMinutes: "", ingredients: [""], steps: [], sourceUrl: "" });
  });
});

describe("messages", () => {
  it("names the site without www", () => {
    expect(importedHost(makeDraft(), "https://short.example/x")).toBe("example.com");
    expect(importedHost(makeDraft({ source_url: null }), "https://www.short.example/x")).toBe("short.example");
  });

  it("translates every warning code", () => {
    const warnings = [
      "name_truncated",
      "steps_truncated",
      "ingredients_truncated",
      "servings_unknown",
      "time_unknown",
      "no_ingredients",
      "no_steps",
      "name_exists",
    ] as const;
    const lines = describeWarnings(makeDraft({ warnings: [...warnings] }), t);
    expect(lines).toHaveLength(warnings.length);
    expect(lines[0]).toBe("The name was too long and was shortened.");
    expect(lines[7]).toBe("A recipe with this name already exists.");
    for (const line of lines) expect(line).not.toContain("recipeForm.");
  });

  it.each([
    [422, "invalid_url", "Enter a full link starting with http:// or https://."],
    [422, "blocked_address", "This address can't be imported."],
    [502, "fetch_failed", "Cociboard couldn't get that page."],
    [504, "timeout", "The website took too long to answer."],
    [413, "too_large", "That page is too large to import."],
    [415, "not_html", "That link isn't a web page."],
    [422, "no_recipe_found", "This page doesn't contain a recipe Cociboard can read."],
    [429, "busy", "Other imports are running. Try again in a moment."],
  ])("describes %i %s", (status, code, message) => {
    expect(describeImportError(failure(status, { code }), t)).toBe(message);
  });

  it("includes the remote status, and handles unknown and network errors", () => {
    expect(describeImportError(failure(502, { code: "fetch_failed", status: 404 }), t)).toBe(
      "The website answered with error 404.",
    );
    expect(describeImportError(failure(500, undefined), t)).toBe("The import didn't work. Try again later.");
    expect(describeImportError(new TypeError("Failed to fetch"), t)).toContain("Couldn't reach Cociboard");
  });

  it("recognises a disabled import", () => {
    expect(isImportDisabled(failure(404, { code: "import_disabled" }))).toBe(true);
    expect(isImportDisabled(failure(404, { code: "other" }))).toBe(false);
    expect(isImportDisabled(new Error("x"))).toBe(false);
  });
});

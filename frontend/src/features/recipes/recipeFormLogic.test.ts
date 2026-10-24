import i18n from "../../i18n";
import { describe, expect, it } from "vitest";
import { ApiError } from "../../api/client";
import { makeRecipe } from "../../test/fixtures";
import {
  asMealTypeConflict,
  cleanIngredients,
  describeConflict,
  emptyValues,
  isDuplicateNameError,
  mapValidationErrors,
  splitPastedIngredients,
  toPayload,
  validateValues,
  valuesFromRecipe,
} from "./recipeFormLogic";

const en = i18n.getFixedT("en");
const es = i18n.getFixedT("es");
const valid = { ...emptyValues(), name: "Gazpacho", ingredients: ["Tomate"] };

describe("validateValues", () => {
  it("accepts a minimal recipe", () => {
    expect(validateValues(valid, en)).toEqual({});
  });

  it("requires a name of 1-80 characters", () => {
    expect(validateValues({ ...valid, name: "   " }, en).name).toBeDefined();
    expect(validateValues({ ...valid, name: "x".repeat(80) }, en).name).toBeUndefined();
    expect(validateValues({ ...valid, name: "x".repeat(81) }, en).name).toMatch(/80/);
  });

  it("requires one non-empty ingredient", () => {
    expect(validateValues({ ...valid, ingredients: ["", "  "] }, en).ingredients).toBeDefined();
    expect(validateValues({ ...valid, ingredients: ["", "sal"] }, en).ingredients).toBeUndefined();
  });

  it("checks prep minutes", () => {
    expect(validateValues({ ...valid, prepMinutes: "" }, en).prepMinutes).toBeUndefined();
    expect(validateValues({ ...valid, prepMinutes: "0" }, en).prepMinutes).toBeDefined();
    expect(validateValues({ ...valid, prepMinutes: "-5" }, en).prepMinutes).toBeDefined();
    expect(validateValues({ ...valid, prepMinutes: "1.5" }, en).prepMinutes).toBeDefined();
    expect(validateValues({ ...valid, prepMinutes: "45" }, en).prepMinutes).toBeUndefined();
  });
});

describe("payload and values", () => {
  it("trims, drops empty rows and nulls empty optionals", () => {
    expect(
      toPayload({ ...valid, name: "  Gazpacho ", ingredients: [" Tomate ", "", "Pepino"], description: " " }),
    ).toEqual({
      name: "Gazpacho",
      description: null,
      meal_type: "both",
      protein: "none",
      prep_minutes: null,
      ingredients: ["Tomate", "Pepino"],
      properties: [],
    });
  });

  it("round-trips a recipe", () => {
    const recipe = makeRecipe({ description: "Hearty", prep_minutes: 60 });
    const values = valuesFromRecipe(recipe);
    expect(values.prepMinutes).toBe("60");
    expect(toPayload(values)).toMatchObject({ name: recipe.name, prep_minutes: 60, description: "Hearty" });
  });

  it("cleanIngredients keeps order", () => {
    expect(cleanIngredients(["b", " ", "a "])).toEqual(["b", "a"]);
  });
});

describe("splitPastedIngredients", () => {
  it("returns null for a single line", () => {
    expect(splitPastedIngredients("Tomate")).toBeNull();
    expect(splitPastedIngredients("Tomate\n\n")).toBeNull();
  });

  it("splits lines and strips bullets and numbering", () => {
    expect(splitPastedIngredients("- Tomate\r\n* Pepino\n\n3) Aceite\n• Sal\n2 huevos")).toEqual([
      "Tomate",
      "Pepino",
      "Aceite",
      "Sal",
      "2 huevos",
    ]);
  });
});

describe("server errors", () => {
  it("maps 422 locations to translated field messages, never the server text", () => {
    const detail = [
      { loc: ["body", "name"], type: "string_too_long", msg: "String should have at most 80 characters" },
      { loc: ["body", "ingredients", 0], type: "value_error", msg: "Value error, bad" },
      { loc: ["body", "protein"], type: "enum", msg: "Input should be 'meat'" },
      { loc: ["body"], type: "x", msg: "Something else" },
    ];
    expect(mapValidationErrors(detail, en)).toEqual({
      fields: {
        name: "Use at most 80 characters.",
        ingredients: "Add at least one ingredient.",
        protein: "Invalid value.",
      },
      other: ["Invalid value."],
    });
    expect(mapValidationErrors(detail, es).fields.name).toBe("Usa como máximo 80 caracteres.");
  });

  it("maps prep minutes and missing names by type", () => {
    const detail = [
      { loc: ["body", "prep_minutes"], type: "greater_than", msg: "x" },
      { loc: ["body", "name"], type: "missing", msg: "Field required" },
    ];
    expect(mapValidationErrors(detail, en).fields).toEqual({
      prepMinutes: "Prep time must be at least 1 minute.",
      name: "Enter a name.",
    });
  });

  it("tells duplicate names from meal-type conflicts", () => {
    const duplicate = new ApiError(409, "x", "A recipe named 'a' already exists");
    const conflict = new ApiError(409, "x", {
      code: "meal_type_conflict",
      message: "m",
      conflicts: [{ week_start: "2026-10-26", day: 1, slot: "dinner" }],
    });
    expect(isDuplicateNameError(duplicate)).toBe(true);
    expect(isDuplicateNameError(conflict)).toBe(false);
    expect(asMealTypeConflict(duplicate)).toBeNull();
    expect(asMealTypeConflict(conflict)?.conflicts).toHaveLength(1);
    expect(asMealTypeConflict(new Error("x"))).toBeNull();
  });

  it("describes a conflicting slot", () => {
    const conflict = { week_start: "2026-10-26", day: 1, slot: "dinner" } as const;
    expect(describeConflict(conflict, en, "en")).toBe("Tuesday dinner (week of 26 Oct)");
    expect(describeConflict(conflict, es, "es")).toBe("cena del martes (semana del 26 oct)");
  });
});

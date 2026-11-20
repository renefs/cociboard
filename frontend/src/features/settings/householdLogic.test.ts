import { describe, expect, it } from "vitest";
import i18n from "../../i18n";
import { ApiError } from "../../api/client";
import {
  DEFAULT_HOUSEHOLD,
  describeSaveError,
  draftToSettings,
  hasRecipePreferences,
  isChanged,
  isValidTime,
  parseTarget,
  stepTarget,
  toDraft,
  toggleAvoided,
  toggleRequired,
  validateDraft,
} from "./householdLogic";

const en = i18n.getFixedT("en");

describe("parseTarget", () => {
  it("accepts whole numbers inside the range of the field", () => {
    expect(parseTarget("max_meals_per_protein", "4")).toBe(4);
    expect(parseTarget("min_fish_meals", "0")).toBe(0);
    expect(parseTarget("min_fish_meals", "14")).toBe(14);
  });

  it("rejects empty, fractional, negative and out-of-range text", () => {
    expect(parseTarget("min_fish_meals", "")).toBeNull();
    expect(parseTarget("min_fish_meals", "1.5")).toBeNull();
    expect(parseTarget("min_fish_meals", "-1")).toBeNull();
    expect(parseTarget("min_fish_meals", "15")).toBeNull();
    expect(parseTarget("max_meals_per_protein", "0")).toBeNull(); // 0 is only for the minimums
  });
});

describe("times", () => {
  it("accepts 24-hour HH:MM only", () => {
    expect(["00:00", "14:00", "23:59"].every(isValidTime)).toBe(true);
    expect(["", "24:00", "9:00", "12:60", "14:00:00"].some(isValidTime)).toBe(false);
  });
});

describe("validateDraft / draftToSettings", () => {
  it("has no errors for the defaults and round-trips them", () => {
    const draft = toDraft(DEFAULT_HOUSEHOLD);
    expect(validateDraft(draft)).toEqual({});
    expect(draftToSettings(draft)).toEqual(DEFAULT_HOUSEHOLD);
  });

  it("reports each bad field and gives no settings", () => {
    const draft = { ...toDraft(DEFAULT_HOUSEHOLD), max_meals_per_protein: "0", min_fish_meals: "", lunch_time: "" };
    expect(validateDraft(draft)).toEqual({ max_meals_per_protein: "range", min_fish_meals: "range", lunch_time: "time" });
    expect(draftToSettings(draft)).toBeNull();
  });
});

describe("isChanged", () => {
  it("is false for an untouched draft and ignores the order of properties", () => {
    const saved = { ...DEFAULT_HOUSEHOLD, avoided_properties: ["spicy", "light"] as const };
    const draft = toDraft({ ...saved, avoided_properties: ["light", "spicy"] });
    expect(isChanged(draft, { ...saved, avoided_properties: ["spicy", "light"] })).toBe(false);
  });

  it("is true after any edit, and for an invalid draft", () => {
    const draft = toDraft(DEFAULT_HOUSEHOLD);
    expect(isChanged({ ...draft, min_fish_meals: "0" }, DEFAULT_HOUSEHOLD)).toBe(true);
    expect(isChanged({ ...draft, dinner_time: "22:00" }, DEFAULT_HOUSEHOLD)).toBe(true);
    expect(isChanged({ ...draft, min_fish_meals: "" }, DEFAULT_HOUSEHOLD)).toBe(true);
  });
});

describe("toggles", () => {
  it("requiring a property drops it from the avoided list, and it can't be avoided meanwhile", () => {
    let draft = toggleAvoided(toDraft(DEFAULT_HOUSEHOLD), "vegan");
    expect(draft.avoided).toEqual(["vegan"]);
    draft = toggleRequired(draft, "vegan");
    expect(draft.required).toEqual(["vegan"]);
    expect(draft.avoided).toEqual([]);
    expect(toggleAvoided(draft, "vegan")).toBe(draft);
    expect(toggleRequired(draft, "vegan").required).toEqual([]);
  });
});

describe("stepTarget", () => {
  it("steps within the limits", () => {
    expect(stepTarget("min_fish_meals", "2", 1)).toBe("3");
    expect(stepTarget("min_fish_meals", "0", -1)).toBe("0");
    expect(stepTarget("min_fish_meals", "14", 1)).toBe("14");
    expect(stepTarget("max_meals_per_protein", "1", -1)).toBe("1");
  });

  it("starts from the limit when the text is not a number", () => {
    expect(stepTarget("min_fish_meals", "", 1)).toBe("0");
    expect(stepTarget("min_fish_meals", "", -1)).toBe("14");
  });
});

describe("hasRecipePreferences", () => {
  it("is true only when something is required or avoided", () => {
    expect(hasRecipePreferences(undefined)).toBe(false);
    expect(hasRecipePreferences(DEFAULT_HOUSEHOLD)).toBe(false);
    expect(hasRecipePreferences({ ...DEFAULT_HOUSEHOLD, avoided_properties: ["spicy"] })).toBe(true);
  });
});

describe("describeSaveError", () => {
  it("translates the server codes and falls back to a generic sentence", () => {
    expect(describeSaveError(new ApiError(422, "x", { code: "required_and_avoided" }), en)).toBe(
      "A property can't be both required and avoided.",
    );
    expect(describeSaveError(new ApiError(422, "x", { code: "other" }), en)).toContain("Couldn't save");
    expect(describeSaveError(new TypeError("offline"), en)).toContain("Couldn't save");
  });
});

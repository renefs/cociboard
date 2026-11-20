import { describe, expect, it } from "vitest";
import { makePlan } from "../../test/fixtures";
import { makeRecipe } from "../../test/fixtures";
import { leftoversTarget, nextSlotInWeek } from "./leftovers";

const batch = makeRecipe({ id: 1, name: "Cocido", meal_type: "both", properties: ["batch_cooking"] });
const plain = makeRecipe({ id: 2, name: "Ensalada", meal_type: "both", properties: [] });

describe("nextSlotInWeek", () => {
  it("goes from lunch to dinner of the same day", () => {
    expect(nextSlotInWeek({ day: 2, slot: "lunch" })).toEqual({ day: 2, slot: "dinner" });
  });
  it("goes from dinner to the next day's lunch", () => {
    expect(nextSlotInWeek({ day: 2, slot: "dinner" })).toEqual({ day: 3, slot: "lunch" });
    expect(nextSlotInWeek({ day: 5, slot: "dinner" })).toEqual({ day: 6, slot: "lunch" });
  });
  it("has none after Sunday dinner", () => {
    expect(nextSlotInWeek({ day: 6, slot: "dinner" })).toBeNull();
    expect(nextSlotInWeek({ day: 6, slot: "lunch" })).toEqual({ day: 6, slot: "dinner" });
  });
});

describe("leftoversTarget", () => {
  it("offers the next empty slot for a batch-cooking recipe", () => {
    const plan = makePlan("2026-10-26", { "1:dinner": batch });
    expect(leftoversTarget(plan, { day: 1, slot: "dinner" })).toEqual({ day: 2, slot: "lunch" });
  });
  it("is not offered for recipes without batch_cooking", () => {
    const plan = makePlan("2026-10-26", { "1:lunch": plain });
    expect(leftoversTarget(plan, { day: 1, slot: "lunch" })).toBeNull();
  });
  it("is not offered when the next slot is taken, by a recipe or a special meal", () => {
    const withRecipe = makePlan("2026-10-26", { "1:lunch": batch, "1:dinner": plain });
    expect(leftoversTarget(withRecipe, { day: 1, slot: "lunch" })).toBeNull();
    const withSpecial = makePlan("2026-10-26", { "1:lunch": batch }, undefined, {
      specials: { "1:dinner": "free" },
    });
    expect(leftoversTarget(withSpecial, { day: 1, slot: "lunch" })).toBeNull();
  });
  it("is not offered for Sunday dinner, an empty slot or a special meal", () => {
    const plan = makePlan("2026-10-26", { "6:dinner": batch }, undefined, {
      specials: { "0:lunch": "leftovers" },
    });
    expect(leftoversTarget(plan, { day: 6, slot: "dinner" })).toBeNull();
    expect(leftoversTarget(plan, { day: 3, slot: "lunch" })).toBeNull();
    expect(leftoversTarget(plan, { day: 0, slot: "lunch" })).toBeNull();
  });
});

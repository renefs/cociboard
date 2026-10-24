import { describe, expect, it } from "vitest";
import type { VarietyIssue, VarietyReport } from "../../api/types";
import { makePlan, makeRecipe } from "../../test/fixtures";
import {
  describeIssues,
  findIssue,
  issueCounts,
  issueId,
  issueSlotKeys,
  scoreLevel,
  slotKey,
  sortByVariety,
  usageCounts,
  warningsBySlot,
} from "./varietyLogic";

const warning: VarietyIssue = {
  kind: "repeated_recipe",
  severity: "warning",
  message: "Paella is planned 2 times this week.",
  slots: [
    { day: 0, slot: "lunch" },
    { day: 3, slot: "dinner" },
  ],
};
const tip: VarietyIssue = {
  kind: "little_fish",
  severity: "info",
  message: "Only 1 fish or seafood meal so far.",
  slots: [],
};
const report = (issues: VarietyIssue[], score: number | null = 70): VarietyReport => ({
  score,
  filled_slots: 10,
  issues,
  protein_counts: {},
});

describe("scoreLevel", () => {
  it("maps scores to levels", () => {
    expect(scoreLevel(null)).toBe("none");
    expect(scoreLevel(100)).toBe("good");
    expect(scoreLevel(80)).toBe("good");
    expect(scoreLevel(79)).toBe("fair");
    expect(scoreLevel(60)).toBe("fair");
    expect(scoreLevel(59)).toBe("poor");
    expect(scoreLevel(0)).toBe("poor");
  });
});

describe("issue helpers", () => {
  it("counts and describes issues", () => {
    expect(issueCounts(report([warning, tip, tip]))).toEqual({ warnings: 1, infos: 2 });
    expect(describeIssues(report([]))).toBe("No issues");
    expect(describeIssues(report([warning]))).toBe("1 warning");
    expect(describeIssues(report([warning, warning, tip]))).toBe("2 warnings, 1 tip");
    expect(describeIssues(report([tip, tip]))).toBe("2 tips");
  });

  it("maps only warnings to their slots", () => {
    const bySlot = warningsBySlot(report([warning, tip]));
    expect([...bySlot.keys()]).toEqual(["0:lunch", "3:dinner"]);
    expect(bySlot.get(slotKey({ day: 0, slot: "lunch" }))).toEqual([warning.message]);
  });

  it("collects the slot keys of an issue", () => {
    expect(issueSlotKeys(warning)).toEqual(new Set(["0:lunch", "3:dinner"]));
    expect(issueSlotKeys(null).size).toBe(0);
  });

  it("finds an issue again by id after a refetch", () => {
    const id = issueId(warning);
    expect(findIssue(report([tip, { ...warning }]), id)?.kind).toBe("repeated_recipe");
    expect(findIssue(report([tip]), id)).toBeNull();
    expect(findIssue(report([warning]), null)).toBeNull();
  });
});

describe("usageCounts and sortByVariety", () => {
  const paella = makeRecipe({ id: 1, name: "Paella", protein: "seafood" });
  const steak = makeRecipe({ id: 2, name: "Bistec", protein: "meat" });
  const hake = makeRecipe({ id: 3, name: "Merluza", protein: "fish" });
  const salad = makeRecipe({ id: 4, name: "Ensalada", protein: "none" });
  const plan = makePlan("2026-10-26", { "0:lunch": paella, "1:lunch": paella, "2:dinner": steak });

  it("counts how often each recipe is planned", () => {
    expect(usageCounts(plan)).toEqual(
      new Map([
        [1, 2],
        [2, 1],
      ]),
    );
    expect(usageCounts(makePlan()).size).toBe(0);
  });

  it("puts unplanned recipes first, least used protein before most used", () => {
    const all = [hake, steak, paella, salad]; // incoming order is the tie-breaker
    const sorted = sortByVariety(all, usageCounts(plan), { seafood: 2, meat: 1 });
    expect(sorted.map((r) => r.name)).toEqual(["Merluza", "Ensalada", "Bistec", "Paella"]);
  });

  it("uses protein use to order recipes that are all unplanned", () => {
    const sorted = sortByVariety([steak, hake], new Map(), { meat: 3 });
    expect(sorted.map((r) => r.name)).toEqual(["Merluza", "Bistec"]);
  });

  it("does not mutate its input", () => {
    const input = [steak, hake];
    sortByVariety(input, new Map(), { meat: 3 });
    expect(input.map((r) => r.name)).toEqual(["Bistec", "Merluza"]);
  });
});

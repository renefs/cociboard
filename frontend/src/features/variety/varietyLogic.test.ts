import i18n from "../../i18n";
import { describe, expect, it } from "vitest";
import type { VarietyIssue, VarietyReport } from "../../api/types";
import { makePlan, makeRecipe } from "../../test/fixtures";
import {
  describeIssues,
  issueMessage,
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
  params: { recipe: "Paella", count: 2 },
  slots: [
    { day: 0, slot: "lunch" },
    { day: 3, slot: "dinner" },
  ],
};
const tip: VarietyIssue = {
  kind: "little_fish",
  severity: "info",
  message: "Only 1 fish or seafood meal so far.",
  params: { count: 1, min: 2 },
  slots: [],
};
const en = i18n.getFixedT("en");
const es = i18n.getFixedT("es");
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
    expect(describeIssues(report([]), en)).toBe("No issues");
    expect(describeIssues(report([warning]), en)).toBe("1 warning");
    expect(describeIssues(report([warning, warning, tip]), en)).toBe("2 warnings, 1 tip");
    expect(describeIssues(report([tip, tip]), en)).toBe("2 tips");
  });

  it("maps only warnings to their slots", () => {
    const bySlot = warningsBySlot(report([warning, tip]), en, "en");
    expect([...bySlot.keys()]).toEqual(["0:lunch", "3:dinner"]);
    expect(bySlot.get(slotKey({ day: 0, slot: "lunch" }))).toEqual(["Paella is planned 2 times this week."]);
  });

  it("collects the slot keys of an issue", () => {
    expect(issueSlotKeys(warning)).toEqual(new Set(["0:lunch", "3:dinner"]));
    expect(issueSlotKeys(null).size).toBe(0);
  });

  it("builds the issue id from kind and slots, not from the wording", () => {
    expect(issueId(warning)).toBe("repeated_recipe:0:lunch,3:dinner");
    expect(issueId({ ...warning, message: "Otro texto" })).toBe(issueId(warning));
    expect(issueId(tip)).toBe("little_fish:");
  });

  it("finds an issue again by id after a refetch", () => {
    const id = issueId(warning);
    expect(findIssue(report([tip, { ...warning }]), id)?.kind).toBe("repeated_recipe");
    expect(findIssue(report([tip]), id)).toBeNull();
    expect(findIssue(report([warning]), null)).toBeNull();
  });
});

describe("issueMessage", () => {
  const params = (p: VarietyIssue["params"], kind: VarietyIssue["kind"], severity: VarietyIssue["severity"] = "warning") =>
    ({ kind, severity, message: "", params: p, slots: [] }) satisfies VarietyIssue;
  const from = { day: 0, slot: "lunch" } as const;
  const to = { day: 1, slot: "dinner" } as const;
  const cases: [VarietyIssue, string, string][] = [
    [
      warning,
      "Paella is planned 2 times this week.",
      "Paella se repite 2 veces esta semana.",
    ],
    [
      params({ recipe: "Lentejas", count: 2 }, "repeated_recipe", "info"),
      "Lentejas is planned 2 times (batch cooking, so leftovers are fine).",
      "Lentejas se repite 2 veces (es cocina por lotes, así que aprovechas las sobras).",
    ],
    [
      params({ protein: "fish", count: 3, from, to }, "consecutive_protein"),
      "Fish in 3 consecutive meals (Monday lunch to Tuesday dinner).",
      "Pescado en 3 comidas seguidas (de la comida del lunes a la cena del martes).",
    ],
    [
      params({ protein: "meat", count: 5, max: 4 }, "protein_overload"),
      "Meat is the main protein in 5 meals (more than 4).",
      "Carne es la proteína principal en 5 comidas (más de 4).",
    ],
    [
      params({ count: 1, min: 2 }, "few_vegetarian", "info"),
      "Only 1 vegetable-forward or vegetarian meal so far. Aim for at least 2.",
      "Solo 1 comida vegetariana o con mucha verdura por ahora. Intenta llegar al menos a 2.",
    ],
    [
      params({ count: 0, min: 2 }, "little_fish", "info"),
      "Only 0 fish or seafood meals so far. Aim for at least 2.",
      "Solo 0 comidas de pescado o marisco por ahora. Intenta llegar al menos a 2.",
    ],
  ];
  it.each(cases)("translates %#", (issue, english, spanish) => {
    expect(issueMessage(issue, en, "en")).toBe(english);
    expect(issueMessage(issue, es, "es")).toBe(spanish);
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

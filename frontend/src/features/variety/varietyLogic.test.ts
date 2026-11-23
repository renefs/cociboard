import i18n from "../../i18n";
import { describe, expect, it } from "vitest";
import type { Candidate, VarietyIssue, VarietyReport } from "../../api/types";
import { makePlan, makeRecipe } from "../../test/fixtures";
import {
  describeIssues,
  issueMessage,
  findIssue,
  issueCounts,
  issueId,
  issueSlotKeys,
  proteinSegments,
  reasonText,
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
    [
      {
        ...params({ protein: "poultry", recipe: "Pollo asado" }, "previous_week_protein"),
        slots: [{ day: 0, slot: "lunch" }],
      },
      "Poultry again: last week's Sunday dinner (Pollo asado) had the same main protein.",
      "Aves otra vez: la cena del domingo de la semana pasada (Pollo asado) tenía la misma proteína principal.",
    ],
    [
      params({ recipe: "Paella", weeks_ago: 1 }, "recent_repeat", "info"),
      "Paella was also planned last week.",
      "Paella también estaba planificada la semana pasada.",
    ],
    [
      params({ recipe: "Paella", weeks_ago: 2 }, "recent_repeat", "info"),
      "Paella was also planned 2 weeks ago.",
      "Paella también estaba planificada hace 2 semanas.",
    ],
  ];
  it.each(cases)("translates %#", (issue, english, spanish) => {
    expect(issueMessage(issue, en, "en")).toBe(english);
    expect(issueMessage(issue, es, "es")).toBe(spanish);
  });
});

describe("cross-week issues", () => {
  const boundary: VarietyIssue = {
    kind: "previous_week_protein",
    severity: "warning",
    message: "",
    params: { protein: "poultry", recipe: "Pollo asado" },
    slots: [{ day: 0, slot: "lunch" }],
  };
  const recent: VarietyIssue = {
    kind: "recent_repeat",
    severity: "info",
    message: "",
    params: { recipe: "Paella", weeks_ago: 1 },
    slots: [
      { day: 2, slot: "lunch" },
      { day: 4, slot: "dinner" },
    ],
  };

  it("marks only Monday lunch for the boundary warning and no slot for the recent-repeat tip", () => {
    const bySlot = warningsBySlot(report([boundary, recent]), en, "en");
    expect([...bySlot.keys()]).toEqual(["0:lunch"]);
    expect(bySlot.get("0:lunch")?.[0]).toMatch(/last week's Sunday dinner/);
  });

  it("counts the boundary as a warning and the repeat as a tip", () => {
    expect(issueCounts(report([boundary, recent]))).toEqual({ warnings: 1, infos: 1 });
    expect(describeIssues(report([boundary, recent]), en)).toBe("1 warning, 1 tip");
  });

  it("still lets a tip with slots be highlighted", () => {
    expect(issueSlotKeys(recent)).toEqual(new Set(["2:lunch", "4:dinner"]));
    expect(issueId(recent)).toBe("recent_repeat:2:lunch,4:dinner");
  });
});

describe("reasonText", () => {
  const candidate = (code: Candidate["reason_code"], params: Candidate["reason_params"]): Candidate => ({
    recipe: makeRecipe(),
    score_delta: 0,
    reason: "",
    reason_code: code,
    reason_params: params,
    good_pick: false,
  });

  it("words planned_recently for last week and for two weeks ago", () => {
    expect(reasonText(candidate("planned_recently", { weeks_ago: 1 }), en)).toBe("Planned last week");
    expect(reasonText(candidate("planned_recently", { weeks_ago: 2 }), en)).toBe("Planned 2 weeks ago");
    expect(reasonText(candidate("planned_recently", { weeks_ago: 1 }), es)).toBe("Planificada la semana pasada");
    expect(reasonText(candidate("planned_recently", { weeks_ago: 2 }), es)).toBe("Planificada hace 2 semanas");
  });

  it("still words protein reasons", () => {
    expect(reasonText(candidate("twice_in_a_row", { protein: "fish" }), en)).toBe("Fish twice in a row");
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

describe("proteinSegments", () => {
  it("has no segments without any protein", () => {
    expect(proteinSegments({})).toEqual([]);
    expect(proteinSegments({ fish: 0 })).toEqual([]);
  });

  it("sizes the segments in proportion to the counts, in catalogue order", () => {
    const segments = proteinSegments({ fish: 1, meat: 2, legumes: 1 });
    expect(segments.map((segment) => segment.protein)).toEqual(["meat", "fish", "legumes"]);
    expect(segments.map((segment) => segment.percent)).toEqual([50, 25, 25]);
  });

  it("adds up to 100 percent", () => {
    const segments = proteinSegments({ meat: 1, poultry: 1, fish: 1 });
    expect(segments.reduce((sum, segment) => sum + segment.percent, 0)).toBeCloseTo(100);
  });
});

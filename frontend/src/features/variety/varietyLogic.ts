// Pure helpers for presenting the backend's variety report. The rules themselves live in
// backend/src/cociboard/variety.py; nothing here recomputes them.
import type {
  Protein,
  Recipe,
  SlotRef,
  VarietyIssue,
  VarietyReport,
  WeekPlan,
} from "../../api/types";
import { MEAL_SLOTS } from "../../api/types";

export type ScoreLevel = "none" | "good" | "fair" | "poor";

export const GOOD_SCORE = 80;
export const FAIR_SCORE = 60;

export function scoreLevel(score: number | null): ScoreLevel {
  if (score === null) return "none";
  if (score >= GOOD_SCORE) return "good";
  return score >= FAIR_SCORE ? "fair" : "poor";
}

export const slotKey = (ref: SlotRef): string => `${ref.day}:${ref.slot}`;

export function isWarning(issue: VarietyIssue): boolean {
  return issue.severity === "warning";
}

export function issueCounts(report: VarietyReport): { warnings: number; infos: number } {
  const warnings = report.issues.filter(isWarning).length;
  return { warnings, infos: report.issues.length - warnings };
}

/** Slot key -> messages of the warnings that involve the slot (infos are not marked). */
export function warningsBySlot(report: VarietyReport): Map<string, string[]> {
  const bySlot = new Map<string, string[]>();
  for (const issue of report.issues.filter(isWarning)) {
    for (const slot of issue.slots) {
      const key = slotKey(slot);
      bySlot.set(key, [...(bySlot.get(key) ?? []), issue.message]);
    }
  }
  return bySlot;
}

export function issueSlotKeys(issue: VarietyIssue | null): ReadonlySet<string> {
  return new Set(issue ? issue.slots.map(slotKey) : []);
}

/** Short summary for the badge, e.g. "2 warnings, 1 tip". */
export function describeIssues(report: VarietyReport): string {
  const { warnings, infos } = issueCounts(report);
  if (warnings + infos === 0) return "No issues";
  const parts: string[] = [];
  if (warnings > 0) parts.push(`${warnings} ${warnings === 1 ? "warning" : "warnings"}`);
  if (infos > 0) parts.push(`${infos} ${infos === 1 ? "tip" : "tips"}`);
  return parts.join(", ");
}

/** How often each recipe is planned in the week. */
export function usageCounts(plan: WeekPlan): Map<number, number> {
  const counts = new Map<number, number>();
  for (const day of plan.days) {
    for (const slot of MEAL_SLOTS) {
      const recipe = day[slot];
      if (recipe) counts.set(recipe.id, (counts.get(recipe.id) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * Order recipes for the "Best for variety" sort: recipes not yet planned first, then those
 * whose main protein is least used this week. Ties keep the incoming (alphabetical) order.
 * Slot-specific ranking is the backend's candidates endpoint; this is the slot-less heuristic.
 */
export function sortByVariety(
  recipes: readonly Recipe[],
  usage: ReadonlyMap<number, number>,
  proteinCounts: Partial<Record<Protein, number>>,
): Recipe[] {
  const proteinUse = (recipe: Recipe) =>
    recipe.protein === "none" ? 0 : (proteinCounts[recipe.protein] ?? 0);
  return recipes
    .map((recipe, index) => ({ recipe, index }))
    .sort(
      (a, b) =>
        (usage.get(a.recipe.id) ?? 0) - (usage.get(b.recipe.id) ?? 0) ||
        proteinUse(a.recipe) - proteinUse(b.recipe) ||
        a.index - b.index,
    )
    .map(({ recipe }) => recipe);
}

/** Stable identity of an issue across refetches (slot highlighting survives updates). */
export function issueId(issue: VarietyIssue): string {
  return `${issue.kind}:${issue.message}`;
}

export function findIssue(report: VarietyReport, id: string | null): VarietyIssue | null {
  return id === null ? null : (report.issues.find((issue) => issueId(issue) === id) ?? null);
}

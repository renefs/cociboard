// Pure helpers for presenting the backend's variety report. The rules themselves live in
// backend/src/cociboard/variety.py; nothing here recomputes them.
import type { TFunction } from "i18next";
import type {
  Candidate,
  Protein,
  Recipe,
  SlotRef,
  VarietyIssue,
  VarietyReport,
  WeekPlan,
} from "../../api/types";
import { MEAL_SLOTS } from "../../api/types";
import { describeSlot } from "../planner/slots";

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

/** Translated sentence for an issue, built from its `kind` and `params` (never `message`). */
export function issueMessage(issue: VarietyIssue, t: TFunction, locale: string): string {
  const { params } = issue;
  const count = Number(params["count"] ?? 0);
  const protein = typeof params["protein"] === "string" ? params["protein"] : "none";
  const proteinLabel = t(`meta.protein.${protein as Protein}`);
  const slot = (value: unknown) => describeSlot(value as SlotRef, t, locale);
  switch (issue.kind) {
    case "repeated_recipe":
      return t(
        issue.severity === "info"
          ? "variety.issue.repeated_recipe_batch"
          : "variety.issue.repeated_recipe",
        { recipe: String(params["recipe"] ?? ""), count },
      );
    case "consecutive_protein":
      return t("variety.issue.consecutive_protein", {
        protein: proteinLabel,
        count,
        from: slot(params["from"]),
        to: slot(params["to"]),
      });
    case "protein_overload":
      return t("variety.issue.protein_overload", {
        protein: proteinLabel,
        count,
        max: Number(params["max"] ?? 0),
      });
    case "few_vegetarian":
      return t("variety.issue.few_vegetarian", { count, min: Number(params["min"] ?? 0) });
    case "little_fish":
      return t("variety.issue.little_fish", { count, min: Number(params["min"] ?? 0) });
    case "previous_week_protein":
      return t("variety.issue.previous_week_protein", {
        protein: proteinLabel,
        recipe: String(params["recipe"] ?? ""),
      });
    case "recent_repeat":
      return t("variety.issue.recent_repeat", {
        recipe: String(params["recipe"] ?? ""),
        count: Number(params["weeks_ago"] ?? 1),
      });
  }
}

/** Translated "why" of a slot candidate, built from `reason_code` and `reason_params`. */
export function reasonText(candidate: Candidate, t: TFunction): string {
  if (candidate.reason_code === "planned_recently") {
    return t("variety.reason.planned_recently", {
      count: Number(candidate.reason_params["weeks_ago"] ?? 1),
    });
  }
  const protein = String(candidate.reason_params["protein"] ?? "none") as Protein;
  const label = t(`meta.protein.${protein}`);
  return t(`variety.reason.${candidate.reason_code}`, {
    protein: label,
    proteinLower: label.toLocaleLowerCase(),
  });
}

/** Slot key -> messages of the warnings that involve the slot (infos are not marked). */
export function warningsBySlot(
  report: VarietyReport,
  t: TFunction,
  locale: string,
): Map<string, string[]> {
  const bySlot = new Map<string, string[]>();
  for (const issue of report.issues.filter(isWarning)) {
    const message = issueMessage(issue, t, locale);
    for (const slot of issue.slots) {
      const key = slotKey(slot);
      bySlot.set(key, [...(bySlot.get(key) ?? []), message]);
    }
  }
  return bySlot;
}

export function issueSlotKeys(issue: VarietyIssue | null): ReadonlySet<string> {
  return new Set(issue ? issue.slots.map(slotKey) : []);
}

/** Short summary for the badge, e.g. "2 warnings, 1 tip". */
export function describeIssues(report: VarietyReport, t: TFunction): string {
  const { warnings, infos } = issueCounts(report);
  if (warnings + infos === 0) return t("variety.noIssues");
  const parts: string[] = [];
  if (warnings > 0) parts.push(t("variety.warnings", { count: warnings }));
  if (infos > 0) parts.push(t("variety.tips", { count: infos }));
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

/**
 * Stable identity of an issue across refetches (slot highlighting survives updates). Built
 * from the kind and the slots, so it does not depend on the language or the wording.
 */
export function issueId(issue: VarietyIssue): string {
  return `${issue.kind}:${issue.slots.map(slotKey).join(",")}`;
}

export function findIssue(report: VarietyReport, id: string | null): VarietyIssue | null {
  return id === null ? null : (report.issues.find((issue) => issueId(issue) === id) ?? null);
}

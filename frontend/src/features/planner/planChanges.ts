// The changes a user makes to a week plan, as plain data. They are the variables of the
// `week-change` mutations, so they must stay JSON (they are stored on the device while
// they wait, ADR-0029). `applyPlanChange` is also what overlays waiting changes on the
// server's plan.
import type { Recipe, SlotRef, SpecialMeal, WeekPlan } from "../../api/types";
import { assignInPlan, assignSpecialInPlan, clearInPlan, moveInPlan, setNoteInPlan } from "./planTransforms";

export type PlanChange =
  | { type: "assign"; to: SlotRef; recipe: Recipe; note: string | null }
  | { type: "special"; to: SlotRef; special: SpecialMeal; note: string | null }
  | { type: "note"; at: SlotRef; note: string | null }
  | { type: "clear"; from: SlotRef }
  | { type: "move"; from: SlotRef; to: SlotRef };

/** The variables of one plan mutation: the week is part of them so a restored one can be sent. */
export interface PlanMutationVariables {
  weekStart: string;
  change: PlanChange;
}

export function applyPlanChange(plan: WeekPlan, change: PlanChange): WeekPlan {
  switch (change.type) {
    case "assign":
      return assignInPlan(plan, change.to, change.recipe, change.note);
    case "special":
      return assignSpecialInPlan(plan, change.to, change.special, change.note);
    case "note":
      return setNoteInPlan(plan, change.at, change.note);
    case "clear":
      return clearInPlan(plan, change.from);
    case "move":
      return moveInPlan(plan, change.from, change.to);
  }
}

/** The plan with every waiting change of its week applied in order. */
export function applyPlanChanges(plan: WeekPlan, waiting: readonly PlanMutationVariables[]): WeekPlan {
  return waiting.reduce(
    (current, { weekStart, change }) => (weekStart === plan.week_start ? applyPlanChange(current, change) : current),
    plan,
  );
}

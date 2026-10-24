// Pure drag-and-drop decision logic. The dnd-kit event handlers only translate events
// into these inputs, so the rules are unit-testable without simulating pointers.
import type { MealSlot, Recipe, SlotRef, WeekPlan } from "../../api/types";
import { describeSlot, fitsSlot, recipeAt, sameSlot } from "./slots";

export type DragSource =
  | { kind: "recipe"; recipe: Recipe }
  | { kind: "slot"; recipe: Recipe; from: SlotRef };

export type DropTarget = { kind: "slot"; day: number; slot: MealSlot } | { kind: "panel" };

export type DropAction =
  | { type: "assign"; to: SlotRef; recipe: Recipe }
  | { type: "move"; from: SlotRef; to: SlotRef }
  | { type: "remove"; from: SlotRef };

export const PANEL_DROP_ID = "recipe-panel";

export const recipeDragId = (recipe: Recipe) => `recipe:${recipe.id}`;
export const slotDragId = (ref: SlotRef) => `slot-item:${ref.day}:${ref.slot}`;
export const slotDropId = (ref: SlotRef) => `slot:${ref.day}:${ref.slot}`;

/** Decide what dropping `source` on `target` does, or `null` if the drop is refused. */
export function resolveDrop(
  plan: WeekPlan,
  source: DragSource,
  target: DropTarget,
): DropAction | null {
  if (target.kind === "panel") {
    return source.kind === "slot" ? { type: "remove", from: source.from } : null;
  }
  const to: SlotRef = { day: target.day, slot: target.slot };
  if (!fitsSlot(source.recipe.meal_type, to.slot)) return null;
  if (source.kind === "recipe") return { type: "assign", to, recipe: source.recipe };
  if (sameSlot(source.from, to)) return null;
  const occupant = recipeAt(plan, to);
  if (occupant && !fitsSlot(occupant.meal_type, source.from.slot)) return null;
  return { type: "move", from: source.from, to };
}

export function canDrop(plan: WeekPlan, source: DragSource, target: DropTarget): boolean {
  return resolveDrop(plan, source, target) !== null;
}

/** The `onDragEnd` logic: `over` is the data of the droppable under the pointer, if any. */
export function handleDragEnd(
  plan: WeekPlan,
  source: DragSource | null,
  target: DropTarget | null,
): DropAction | null {
  if (!source || !target) return null;
  return resolveDrop(plan, source, target);
}

export function isDragSource(value: unknown): value is DragSource {
  if (typeof value !== "object" || value === null) return false;
  const kind = (value as { kind?: unknown }).kind;
  return kind === "recipe" || kind === "slot";
}

export function isDropTarget(value: unknown): value is DropTarget {
  if (typeof value !== "object" || value === null) return false;
  const kind = (value as { kind?: unknown }).kind;
  return kind === "panel" || kind === "slot";
}

export function describeTarget(target: DropTarget): string {
  return target.kind === "panel" ? "the recipe list" : describeSlot(target);
}

/** English screen-reader announcements for dnd-kit. */
export function announceStart(source: DragSource): string {
  return `Picked up ${source.recipe.name}.`;
}

export function announceOver(plan: WeekPlan, source: DragSource, target: DropTarget | null): string {
  if (!target) return `${source.recipe.name} is no longer over a drop area.`;
  if (canDrop(plan, source, target)) {
    return target.kind === "panel"
      ? `${source.recipe.name} is over the recipe list. Drop to remove it from the plan.`
      : `${source.recipe.name} is over ${describeTarget(target)}.`;
  }
  if (target.kind === "slot" && source.kind === "slot" && sameSlot(source.from, target)) {
    return `${source.recipe.name} is over its own slot, ${describeTarget(target)}.`;
  }
  return `${source.recipe.name} cannot be dropped on ${describeTarget(target)}.`;
}

export function announceEnd(plan: WeekPlan, source: DragSource, target: DropTarget | null): string {
  const action = handleDragEnd(plan, source, target);
  const name = source.recipe.name;
  if (!action) return `${name} was not moved.`;
  switch (action.type) {
    case "assign":
      return `${name} was added to ${describeSlot(action.to)}.`;
    case "move":
      return `${name} was moved to ${describeSlot(action.to)}.`;
    case "remove":
      return `${name} was removed from ${describeSlot(action.from)}.`;
  }
}

export function announceCancel(source: DragSource): string {
  return `Dragging cancelled. ${source.recipe.name} was not moved.`;
}

// Pure drag-and-drop decision logic. The dnd-kit event handlers only translate events
// into these inputs, so the rules are unit-testable without simulating pointers.
import type { TFunction } from "i18next";
import type { MealSlot, Recipe, SlotRef, WeekPlan } from "../../api/types";
import {
  dayParams,
  fitsSlot,
  mealName,
  recipeAt,
  recipeOf,
  sameSlot,
  type SlotMeal,
} from "./slots";

export type DragSource =
  | { kind: "recipe"; recipe: Recipe }
  | { kind: "slot"; meal: SlotMeal; from: SlotRef };

export type DropTarget = { kind: "slot"; day: number; slot: MealSlot } | { kind: "panel" };

export type DropAction =
  | { type: "assign"; to: SlotRef; recipe: Recipe }
  | { type: "move"; from: SlotRef; to: SlotRef }
  | { type: "remove"; from: SlotRef };

export const PANEL_DROP_ID = "recipe-panel";

export const recipeDragId = (recipe: Recipe) => `recipe:${recipe.id}`;
export const slotDragId = (ref: SlotRef) => `slot-item:${ref.day}:${ref.slot}`;
export const slotDropId = (ref: SlotRef) => `slot:${ref.day}:${ref.slot}`;

/** The recipe being dragged, or `null` for a special meal (which fits any slot). */
export function sourceRecipe(source: DragSource): Recipe | null {
  return source.kind === "recipe" ? source.recipe : recipeOf(source.meal);
}

/** Name for announcements: the recipe name or the translated special label. */
export function sourceName(source: DragSource, t: TFunction): string {
  return source.kind === "recipe" ? source.recipe.name : mealName(source.meal, t);
}

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
  const recipe = sourceRecipe(source);
  if (recipe && !fitsSlot(recipe.meal_type, to.slot)) return null;
  if (source.kind === "recipe") return { type: "assign", to, recipe: source.recipe };
  if (sameSlot(source.from, to)) return null;
  const occupant = recipeAt(plan, to);
  if (occupant && !fitsSlot(occupant.meal_type, source.from.slot)) return null;
  return { type: "move", from: source.from, to };
}

export function canDrop(plan: WeekPlan, source: DragSource, target: DropTarget): boolean {
  return resolveDrop(plan, source, target) !== null;
}

/**
 * Whether a slot's droppable stays enabled while `source` is dragged. Valid targets do, and
 * so does the source's own slot: a keyboard drag starts on the closest droppable, so without
 * it the first target would be a neighbour and an immediate drop would move the meal there.
 * Dropping on the own slot resolves to no action ("not moved").
 */
export function acceptsDrop(plan: WeekPlan, source: DragSource | null, target: DropTarget): boolean {
  if (!source) return true;
  if (target.kind === "slot" && source.kind === "slot" && sameSlot(source.from, target)) return true;
  return canDrop(plan, source, target);
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

/** Screen-reader announcements for dnd-kit, translated with `t` for the UI `locale`. */
export interface AnnounceContext {
  t: TFunction;
  locale: string;
}

type SlotSentence =
  | "a11y.over"
  | "a11y.overOwn"
  | "a11y.cannotDrop"
  | "a11y.added"
  | "a11y.moved"
  | "a11y.removed";

function slotSentence(
  { t, locale }: AnnounceContext,
  key: SlotSentence,
  name: string,
  ref: SlotRef,
): string {
  return t(`${key}.${ref.slot}`, { name, ...dayParams(ref.day, locale) });
}

export function announceStart({ t }: AnnounceContext, source: DragSource): string {
  return t("a11y.pickedUp", { name: sourceName(source, t) });
}

export function announceOver(
  ctx: AnnounceContext,
  plan: WeekPlan,
  source: DragSource,
  target: DropTarget | null,
): string {
  const { t } = ctx;
  const name = sourceName(source, t);
  if (!target) return t("a11y.noLongerOver", { name });
  if (canDrop(plan, source, target)) {
    return target.kind === "panel"
      ? t("a11y.overPanel", { name })
      : slotSentence(ctx, "a11y.over", name, target);
  }
  if (target.kind === "slot" && source.kind === "slot" && sameSlot(source.from, target)) {
    return slotSentence(ctx, "a11y.overOwn", name, target);
  }
  return target.kind === "panel"
    ? t("a11y.cannotDropPanel", { name })
    : slotSentence(ctx, "a11y.cannotDrop", name, target);
}

export function announceEnd(
  ctx: AnnounceContext,
  plan: WeekPlan,
  source: DragSource,
  target: DropTarget | null,
): string {
  const action = handleDragEnd(plan, source, target);
  const name = sourceName(source, ctx.t);
  if (!action) return ctx.t("a11y.notMoved", { name });
  switch (action.type) {
    case "assign":
      return slotSentence(ctx, "a11y.added", name, action.to);
    case "move":
      return slotSentence(ctx, "a11y.moved", name, action.to);
    case "remove":
      return slotSentence(ctx, "a11y.removed", name, action.from);
  }
}

export function announceCancel({ t }: AnnounceContext, source: DragSource): string {
  return t("a11y.cancelled", { name: sourceName(source, t) });
}

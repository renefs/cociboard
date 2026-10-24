// Pure drag-and-drop decision logic. The dnd-kit event handlers only translate events
// into these inputs, so the rules are unit-testable without simulating pointers.
import type { TFunction } from "i18next";
import type { MealSlot, Recipe, SlotRef, WeekPlan } from "../../api/types";
import { dayParams, fitsSlot, recipeAt, sameSlot } from "./slots";

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
  return t("a11y.pickedUp", { name: source.recipe.name });
}

export function announceOver(
  ctx: AnnounceContext,
  plan: WeekPlan,
  source: DragSource,
  target: DropTarget | null,
): string {
  const { t } = ctx;
  const name = source.recipe.name;
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
  const name = source.recipe.name;
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
  return t("a11y.cancelled", { name: source.recipe.name });
}

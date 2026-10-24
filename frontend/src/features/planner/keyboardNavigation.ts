// Geometry helpers that make keyboard dragging usable: an arrow key jumps straight to
// the nearest drop target in that direction instead of moving by a few pixels.
import type { KeyboardCoordinateGetter } from "@dnd-kit/core";

export interface Box {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

export type Direction = "up" | "down" | "left" | "right";

const center = (box: Box) => ({ x: box.left + box.width / 2, y: box.top + box.height / 2 });

/**
 * Nearest box strictly in `direction` from `from`. Distance along the travel axis counts
 * once, the perpendicular offset counts double, so the next row/column is preferred.
 */
export function nextBox(from: Box, boxes: readonly Box[], direction: Direction): Box | null {
  const origin = center(from);
  let best: { box: Box; score: number } | null = null;
  for (const box of boxes) {
    if (box.id === from.id) continue;
    const point = center(box);
    const dx = point.x - origin.x;
    const dy = point.y - origin.y;
    const along = direction === "down" ? dy : direction === "up" ? -dy : direction === "right" ? dx : -dx;
    if (along <= 1) continue;
    const across = direction === "up" || direction === "down" ? Math.abs(dx) : Math.abs(dy);
    const score = along + across * 2;
    if (!best || score < best.score) best = { box, score };
  }
  return best?.box ?? null;
}

const DIRECTIONS: Record<string, Direction> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
};

export const keyboardCoordinates: KeyboardCoordinateGetter = (
  event,
  { context: { active, droppableRects, droppableContainers, collisionRect } },
) => {
  const direction = DIRECTIONS[event.code];
  if (!direction || !active || !collisionRect) return undefined;
  event.preventDefault();
  const boxes: Box[] = [];
  for (const container of droppableContainers.getEnabled()) {
    const rect = droppableRects.get(container.id);
    if (rect) boxes.push({ id: String(container.id), ...rect });
  }
  const here: Box = { id: "__active__", ...collisionRect };
  const next = nextBox(here, boxes, direction);
  if (!next) return undefined;
  const point = center(next);
  return { x: point.x - collisionRect.width / 2, y: point.y - collisionRect.height / 2 };
};

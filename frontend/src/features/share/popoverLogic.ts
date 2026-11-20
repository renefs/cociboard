/**
 * How far to move a popover horizontally so that it stays inside the viewport: negative when
 * it would stick out on the right, never pushing its left edge past the margin.
 */
export function clampShift(left: number, width: number, viewportWidth: number, margin = 8): number {
  const overflow = left + width - (viewportWidth - margin);
  if (overflow <= 0) return 0;
  // Do not move further left than the margin allows.
  return -Math.min(overflow, Math.max(0, left - margin));
}

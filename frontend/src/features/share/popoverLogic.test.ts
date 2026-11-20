import { describe, expect, it } from "vitest";
import { clampShift } from "./popoverLogic";

describe("clampShift", () => {
  it("does not move a popover that fits", () => {
    expect(clampShift(20, 200, 375)).toBe(0);
  });

  it("moves a popover left by what sticks out, keeping a margin", () => {
    expect(clampShift(250, 200, 375)).toBe(-(250 + 200 - (375 - 8)));
  });

  it("never pushes the left edge past the margin", () => {
    expect(clampShift(10, 400, 375)).toBe(-2);
  });
});

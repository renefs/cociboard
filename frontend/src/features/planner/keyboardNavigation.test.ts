import { describe, expect, it } from "vitest";
import { nextBox, type Box } from "./keyboardNavigation";

const box = (id: string, left: number, top: number): Box => ({ id, left, top, width: 100, height: 50 });

describe("nextBox", () => {
  const grid = [box("a", 0, 0), box("b", 110, 0), box("c", 0, 60), box("d", 110, 60)];

  it("moves to the neighbour in the pressed direction", () => {
    expect(nextBox(grid[0]!, grid, "right")?.id).toBe("b");
    expect(nextBox(grid[0]!, grid, "down")?.id).toBe("c");
    expect(nextBox(grid[3]!, grid, "left")?.id).toBe("c");
    expect(nextBox(grid[3]!, grid, "up")?.id).toBe("b");
  });

  it("returns null at the edge", () => {
    expect(nextBox(grid[0]!, grid, "left")).toBeNull();
    expect(nextBox(grid[0]!, grid, "up")).toBeNull();
  });

  it("prefers the aligned column over a nearer diagonal one", () => {
    const boxes = [box("from", 0, 0), box("diag", 90, 55), box("below", 0, 120)];
    expect(nextBox(boxes[0]!, boxes, "down")?.id).toBe("below");
  });
});

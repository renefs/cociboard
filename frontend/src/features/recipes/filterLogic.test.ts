import { describe, expect, it } from "vitest";
import { activeFilterCount } from "./filterLogic";

describe("activeFilterCount", () => {
  it("is zero with the default sort and no properties", () => {
    expect(activeFilterCount("name", [])).toBe(0);
  });

  it("counts a non-default sort as one", () => {
    expect(activeFilterCount("variety", [])).toBe(1);
    expect(activeFilterCount("lately", [])).toBe(1);
  });

  it("counts each selected property", () => {
    expect(activeFilterCount("name", ["quick", "vegan"])).toBe(2);
  });

  it("adds the sort and the properties", () => {
    expect(activeFilterCount("lately", ["quick", "vegan"])).toBe(3);
  });
});

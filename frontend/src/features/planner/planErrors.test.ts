import { describe, expect, it } from "vitest";
import { ApiError } from "../../api/client";
import i18n from "../../i18n";
import { describePlanError } from "./planErrors";

const en = i18n.getFixedT("en");

describe("describePlanError", () => {
  it("explains an archived recipe", () => {
    const error = new ApiError(422, "x", { code: "recipe_archived", message: "m", recipe_id: 3 });
    expect(describePlanError(error, en)).toContain("archived");
  });

  it("keeps the generic messages for other failures", () => {
    expect(describePlanError(new ApiError(422, "x", "no fit"), en)).toContain("doesn't fit");
    expect(describePlanError(new ApiError(409, "x"), en)).toContain("changed meanwhile");
    expect(describePlanError(new TypeError("offline"), en)).toContain("Couldn't save");
  });
});

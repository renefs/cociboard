import { describe, expect, it } from "vitest";
import {
  DEFAULT_VIEW,
  MOBILE_VIEWS,
  parseView,
  searchForView,
  viewAfter,
  viewFromSearch,
} from "./mobileView";

describe("parseView", () => {
  it("accepts the four views", () => {
    for (const view of MOBILE_VIEWS) expect(parseView(view)).toBe(view);
  });

  it("rejects anything else", () => {
    expect(parseView(null)).toBeNull();
    expect(parseView("")).toBeNull();
    expect(parseView("Today")).toBeNull();
    expect(parseView("settings")).toBeNull();
  });
});

describe("viewFromSearch", () => {
  it("defaults to today", () => {
    expect(DEFAULT_VIEW).toBe("today");
    expect(viewFromSearch("")).toBe("today");
    expect(viewFromSearch("?week=2026-10-26")).toBe("today");
    expect(viewFromSearch("?view=nonsense")).toBe("today");
  });

  it("reads a valid view next to other parameters", () => {
    expect(viewFromSearch("?view=recipes")).toBe("recipes");
    expect(viewFromSearch("?week=2026-10-26&view=shopping")).toBe("shopping");
  });
});

describe("searchForView", () => {
  it("writes the view and keeps the week", () => {
    expect(searchForView("?week=2026-10-26", "week")).toBe("?week=2026-10-26&view=week");
    expect(searchForView("", "shopping")).toBe("?view=shopping");
  });

  it("replaces an existing view", () => {
    expect(searchForView("?view=recipes", "week")).toBe("?view=week");
  });

  it("leaves no parameter for the default view", () => {
    expect(searchForView("?view=week", "today")).toBe("");
    expect(searchForView("?week=2026-10-26&view=week", "today")).toBe("?week=2026-10-26");
  });
});

describe("viewAfter", () => {
  it("sends select mode and planning to the week", () => {
    expect(viewAfter("start-select", "recipes")).toBe("week");
    expect(viewAfter("plan-week", "today")).toBe("week");
  });

  it("sends the toolbar's shopping button to the shopping list", () => {
    expect(viewAfter("open-shopping", "week")).toBe("shopping");
  });

  it("stays put when select mode is cancelled", () => {
    for (const view of MOBILE_VIEWS) expect(viewAfter("cancel-select", view)).toBe(view);
  });
});

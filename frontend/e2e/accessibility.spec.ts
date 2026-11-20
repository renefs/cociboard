import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { today } from "./dates";
import { RECIPES } from "./data";
import { showTab } from "./helpers";
import { expect, test } from "./fixtures";

/** Fails on serious and critical WCAG A/AA violations; lists them readably when it does. */
async function expectNoSeriousViolations(page: Page, scope?: string): Promise<void> {
  let builder = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]);
  if (scope) builder = builder.include(scope);
  const { violations } = await builder.analyze();
  const serious = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const report = serious.map((v) => `${v.impact} ${v.id}: ${v.help}\n${v.nodes.map((n) => `    ${n.target.join(" ")}`).join("\n")}`);
  expect(report, report.join("\n")).toEqual([]);
}

test.describe("accessibility (axe)", () => {
  // Dialogs fade in; axe would measure the colours of a half-transparent dialog.
  test.use({ reducedMotion: "reduce" });

  test.beforeEach(async ({ resetData }) => {
    const { weekStart } = today();
    // A week with meals, a note, a favourite and an archived recipe: the states worth scanning.
    await resetData({
      recipes: RECIPES.map((r) => (r.ref === 1 ? { ...r, favourite: true } : r.ref === 13 ? { ...r, archived: true } : r)),
      meals: [
        { week_start: weekStart, day: 0, slot: "lunch", recipe_ref: 1 },
        { week_start: weekStart, day: 0, slot: "dinner", recipe_ref: 2, note: "double batch" },
        { week_start: weekStart, day: 1, slot: "dinner", recipe_ref: 3 },
        { week_start: weekStart, day: 2, slot: "lunch", special: "eating_out", note: "Pizza place" },
        { week_start: weekStart, day: 3, slot: "dinner", recipe_ref: 13, note: "last of it" }, // archived
      ],
    });
  });

  test("the main view", async ({ page, isMobile }) => {
    await page.goto("/");
    if (isMobile) {
      await expectNoSeriousViolations(page); // Today
      await showTab(page, isMobile, "Week");
      await expect(page.getByRole("heading", { name: "Weekly planner" })).toBeVisible();
      await expectNoSeriousViolations(page);
    } else {
      await expect(page.getByRole("button", { name: /^Lentil stew, Monday lunch/ })).toBeVisible();
      await expectNoSeriousViolations(page);
    }
  });

  test("the recipes view", async ({ page, isMobile }) => {
    await page.goto("/");
    await showTab(page, isMobile, "Recipes");
    await expect(page.getByRole("article", { name: "Baked salmon" })).toBeVisible();
    await expectNoSeriousViolations(page);
    // With the archived list open.
    await page.getByRole("button", { name: "Archived (1)" }).click();
    await expect(page.getByRole("list", { name: "Archived recipes" })).toBeVisible();
    await expectNoSeriousViolations(page);
  });

  test("the shopping list", async ({ page, isMobile }) => {
    await page.goto("/");
    if (isMobile) await showTab(page, isMobile, "Shopping");
    else await page.getByRole("button", { name: "Shopping list" }).click();
    await expect(page.getByRole("checkbox").first()).toBeVisible();
    await expectNoSeriousViolations(page);
  });

  test("the recipe form dialog", async ({ page, isMobile }) => {
    await page.goto("/");
    await showTab(page, isMobile, "Recipes");
    await page.getByRole("button", { name: "New recipe" }).click();
    await expect(page.getByRole("dialog", { name: "New recipe" })).toBeVisible();
    await expectNoSeriousViolations(page);
    // The validation messages too.
    await page.getByRole("button", { name: "Create recipe" }).click();
    await expect(page.getByText("Enter a name.")).toBeVisible();
    await expectNoSeriousViolations(page);
  });

  test("the slot picker, the recipe details and the household dialog", async ({ page, isMobile }) => {
    await page.goto("/");
    await showTab(page, isMobile, "Week");
    await page.getByRole("button", { name: "Add dinner on Wednesday" }).click();
    await expect(page.getByRole("dialog", { name: "Add dinner on Wednesday" })).toBeVisible();
    await expectNoSeriousViolations(page);
    await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();

    await page.getByRole("button", { name: /^Lentil stew, Monday lunch/ }).click();
    await page.getByRole("button", { name: "View details" }).click();
    await expect(page.getByRole("dialog", { name: "Lentil stew" })).toBeVisible();
    await expectNoSeriousViolations(page);
    await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();

    await page.getByRole("button", { name: "Household preferences" }).click();
    await expect(page.getByRole("dialog", { name: "Household preferences" })).toBeVisible();
    await expectNoSeriousViolations(page);
  });
});

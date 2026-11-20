import { addDays, today } from "./dates";
import { RECIPES } from "./data";
import { expect, openPlanner, test } from "./fixtures";
import type { Page } from "@playwright/test";

/** The number in the "Filled N slots" toast. */
async function filledCount(page: Page): Promise<number> {
  const toast = page.getByText(/^Filled \d+ slots?$/);
  await expect(toast).toBeVisible();
  return Number(/\d+/.exec(await toast.innerText())?.[0]);
}

test.describe("week tools", () => {
  test("Suggest fills the empty slots, and Undo takes it back", async ({ page }) => {
    await openPlanner(page);
    await page.getByRole("button", { name: "Suggest" }).click();
    // Suggestions are randomised and respect the variety rules, so one slot may stay empty.
    const filled = await filledCount(page);
    expect(filled).toBeGreaterThanOrEqual(12);
    await expect(page.getByRole("button", { name: /^Remove .+ from \w+ (lunch|dinner)$/ })).toHaveCount(filled);

    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByRole("button", { name: /^Remove .+ from \w+ (lunch|dinner)$/ })).toHaveCount(0);
  });

  test("Suggest keeps what is already planned", async ({ page }) => {
    await openPlanner(page);
    await page.getByRole("button", { name: "Add Lentil stew to the plan" }).click();
    await page.getByRole("button", { name: "Add lunch on Monday" }).click();
    await expect(page.getByRole("button", { name: "Remove Lentil stew from Monday lunch" })).toBeVisible();

    await page.getByRole("button", { name: "Suggest" }).click();
    expect(await filledCount(page)).toBeGreaterThanOrEqual(11);
    await expect(page.getByRole("button", { name: "Remove Lentil stew from Monday lunch" })).toBeVisible();
  });

  test("Copy last week fills the empty slots with last week's meals", async ({ page, resetData }) => {
    const lastWeek = addDays(today().weekStart, -7);
    await resetData({
      recipes: RECIPES,
      meals: [
        { week_start: lastWeek, day: 0, slot: "lunch", recipe_ref: 1 },
        { week_start: lastWeek, day: 1, slot: "dinner", recipe_ref: 3 },
        { week_start: lastWeek, day: 2, slot: "dinner", recipe_ref: 2 },
      ],
    });
    await openPlanner(page);
    await page.getByRole("button", { name: "Copy last week" }).click();
    await expect(page.getByText("Copied 3 meals from last week.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Remove Lentil stew from Monday lunch" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Remove Baked salmon from Tuesday dinner" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Remove Grilled chicken from Wednesday dinner" })).toBeVisible();
  });

  test("Copy last week says so when last week is empty", async ({ page }) => {
    await openPlanner(page);
    await page.getByRole("button", { name: "Copy last week" }).click();
    await expect(page.getByText("Last week has no meals.")).toBeVisible();
  });

  test("Clear week asks for confirmation and can be undone", async ({ page, resetData }) => {
    const { weekStart } = today();
    await resetData({
      recipes: RECIPES,
      meals: [
        { week_start: weekStart, day: 0, slot: "lunch", recipe_ref: 1 },
        { week_start: weekStart, day: 3, slot: "dinner", recipe_ref: 3 },
      ],
    });
    await openPlanner(page);
    await page.getByRole("button", { name: "Clear week" }).click();
    const dialog = page.getByRole("dialog", { name: "Clear this week?" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Clear week" }).click();
    await expect(page.getByText("Cleared 2 meals")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Remove .+ from/ })).toHaveCount(0);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByRole("button", { name: /^Remove .+ from/ })).toHaveCount(2);
  });
});

import { today, WEEKDAYS } from "./dates";
import { RECIPES } from "./data";
import { slot } from "./helpers";
import { expect, test } from "./fixtures";
import type { Page } from "@playwright/test";

const tabBar = (page: Page) => page.getByRole("navigation", { name: "Main sections" });

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const widths = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(widths.viewport).toBe(375);
  expect(widths.document).toBeLessThanOrEqual(375);
  expect(widths.body).toBeLessThanOrEqual(375);
}

test.describe("the app on a phone", () => {
  test("the bottom tab bar switches between Today, Week, Recipes and Shopping", async ({ page }) => {
    await page.goto("/");
    await expect(tabBar(page)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Today", level: 2 })).toBeVisible();

    await tabBar(page).getByRole("button", { name: "Week" }).tap();
    await expect(page.getByRole("heading", { name: "Weekly planner" })).toBeVisible();
    await expectNoHorizontalScroll(page);

    await tabBar(page).getByRole("button", { name: "Recipes" }).tap();
    await expect(page.getByRole("heading", { name: "Recipes", level: 2 })).toBeVisible();
    await expect(page.getByRole("article", { name: "Baked salmon" })).toBeVisible();
    await expectNoHorizontalScroll(page);

    await tabBar(page).getByRole("button", { name: "Shopping" }).tap();
    await expect(page.getByRole("heading", { name: /^Shopping list/ })).toBeVisible();
    await expectNoHorizontalScroll(page);

    await tabBar(page).getByRole("button", { name: "Today" }).tap();
    await expect(page.getByRole("heading", { name: "Today", level: 2 })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test("tap a slot, pick a recipe in the slot picker", async ({ page }) => {
    await page.goto("/");
    await tabBar(page).getByRole("button", { name: "Week" }).tap();

    await page.getByRole("button", { name: "Add dinner on Monday" }).tap();
    const picker = page.getByRole("dialog", { name: "Add dinner on Monday" });
    await expect(picker).toBeVisible();
    // Only recipes that fit a dinner slot are offered.
    await expect(picker.getByRole("article", { name: "Veggie omelette" })).toHaveCount(0);
    await picker.getByRole("searchbox", { name: "Search recipes" }).fill("salmon");
    await expect(picker.getByRole("article")).toHaveCount(1);
    await picker.getByRole("button", { name: "Choose Baked salmon" }).tap();

    await expect(picker).toHaveCount(0);
    await expect(slot(page, "Monday", "dinner").getByRole("button", { name: /^Baked salmon, Monday dinner/ })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test("tap-to-assign from the Recipes tab", async ({ page }) => {
    await page.goto("/");
    await tabBar(page).getByRole("button", { name: "Recipes" }).tap();
    await page.getByRole("button", { name: "Add Lentil stew to the plan" }).tap();
    // Choosing a slot takes you back to the week.
    await page.getByRole("button", { name: "Add lunch on Tuesday" }).tap();
    await expect(slot(page, "Tuesday", "lunch").getByRole("button", { name: /^Lentil stew, Tuesday lunch/ })).toBeVisible();
  });

  test("the Today view shows today's meals", async ({ page, resetData }) => {
    const { weekStart, dayIndex, weekday } = today();
    expect(WEEKDAYS[dayIndex]).toBe(weekday);
    await resetData({
      recipes: RECIPES,
      meals: [
        { week_start: weekStart, day: dayIndex, slot: "lunch", recipe_ref: 1 },
        { week_start: weekStart, day: dayIndex, slot: "dinner", recipe_ref: 3, note: "with rice" },
      ],
    });
    await page.goto("/");
    const todayRegion = page.getByRole("region", { name: "Today" });
    await expect(todayRegion.getByRole("button", { name: "View details of Lentil stew" })).toBeVisible();
    await expect(todayRegion.getByRole("button", { name: "View details of Baked salmon" })).toBeVisible();
    await expect(todayRegion.getByText("Note: with rice")).toBeVisible();
    await expect(todayRegion.getByText("200 g lentils")).toBeVisible();
    await expectNoHorizontalScroll(page);

    // The recipe details open from the meal.
    await todayRegion.getByRole("button", { name: "View details of Baked salmon" }).tap();
    await expect(page.getByRole("dialog", { name: "Baked salmon" })).toBeVisible();
  });

  test("an empty day offers to plan the week", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Nothing planned for today.")).toBeVisible();
    await page.getByRole("button", { name: "Plan the week" }).tap();
    await expect(page.getByRole("heading", { name: "Weekly planner" })).toBeVisible();
  });
});

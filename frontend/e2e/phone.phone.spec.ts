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

  test("the week is a compact list: four days and the whole toolbar fit on the screen", async ({ page }) => {
    await page.goto("/");
    await tabBar(page).getByRole("button", { name: "Week" }).tap();
    // The toolbar: week navigation, then the actions on one row, all at least 44px.
    const actions = page.getByRole("group", { name: "Week actions" });
    await expect(actions).toBeVisible();
    // All boxes are read at once: on the current week the page scrolls smoothly to today's
    // card, so boxes read one by one would come from different scroll positions.
    const boxes = await actions
      .getByRole("button")
      .evaluateAll((buttons) =>
        buttons.map((b) => {
          const { y, width, height } = b.getBoundingClientRect();
          return { y, width, height };
        }),
      );
    expect(boxes).toHaveLength(4);
    for (const box of boxes) {
      expect(box.height).toBeGreaterThanOrEqual(43.5);
      expect(box.width).toBeGreaterThanOrEqual(43.5);
    }
    expect(new Set(boxes.map((box) => Math.round(box.y))).size).toBe(1);
    // The days: the page is at the top, today's row and the next three are all on screen.
    await page.evaluate(() => window.scrollTo(0, 0));
    const tabTop = (await tabBar(page).boundingBox())?.y ?? 0;
    const days = page.getByRole("region", { name: /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday) \d/ });
    expect(await days.count()).toBe(7);
    let visible = 0;
    for (const day of await days.all()) {
      const box = await day.boundingBox();
      if (box && box.y + box.height <= tabTop) visible++;
    }
    expect(visible).toBeGreaterThanOrEqual(4);
    // Every meal line is at least 44px tall.
    for (const line of await page.getByRole("group", { name: /^(Monday|Tuesday) (lunch|dinner)$/ }).all()) {
      expect((await line.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(43.5);
    }
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
    await expect(todayRegion.getByText("3 ingredients").first()).toBeVisible();
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

import { dragAnnouncements, dragWithMouse, slot, varietyScore } from "./helpers";
import { expect, openPlanner, test } from "./fixtures";

test.describe("planning the week on a desktop", () => {
  test.beforeEach(async ({ page }) => {
    await openPlanner(page);
  });

  test("tap-to-assign: Add, then the slot", async ({ page }) => {
    await expect(page.getByRole("region", { name: "Variety" }).getByRole("button")).toHaveAccessibleName(
      "Variety: not enough data yet",
    );
    await page.getByRole("button", { name: "Add Lentil stew to the plan" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Choose a slot for Lentil stew" })).toBeVisible();
    await page.getByRole("button", { name: "Add lunch on Monday" }).click();

    await expect(slot(page, "Monday", "lunch").getByRole("button", { name: /^Lentil stew, Monday lunch/ })).toBeVisible();
    // The selection mode ended and the variety indicator now has a score.
    await expect(page.getByRole("status").filter({ hasText: "Choose a slot" })).toHaveCount(0);
    // The score comes from the server: it follows the plan once the change is saved.
    await expect.poll(() => varietyScore(page)).toBeGreaterThan(0);
  });

  test("a real mouse drag from the recipe list to a slot", async ({ page }) => {
    await dragWithMouse(
      page,
      page.getByRole("button", { name: /^Drag Baked salmon/ }),
      slot(page, "Tuesday", "dinner"),
    );
    await expect(slot(page, "Tuesday", "dinner").getByRole("button", { name: /^Baked salmon, Tuesday dinner/ })).toBeVisible();
    await expect(dragAnnouncements(page)).toContainText("Baked salmon was added to Tuesday dinner.");
  });

  test("a recipe that does not fit a slot is refused", async ({ page }) => {
    // Chickpea salad is a lunch-only recipe.
    await dragWithMouse(page, page.getByRole("button", { name: /^Drag Chickpea salad/ }), slot(page, "Wednesday", "dinner"));
    await expect(slot(page, "Wednesday", "dinner").getByRole("button", { name: "Add dinner on Wednesday" })).toBeVisible();
  });

  test("move a meal to another slot, then clear a slot", async ({ page }) => {
    await page.getByRole("button", { name: "Add Lentil stew to the plan" }).click();
    await page.getByRole("button", { name: "Add lunch on Monday" }).click();
    const meal = slot(page, "Monday", "lunch").getByRole("button", { name: /^Lentil stew, Monday lunch/ });
    await expect(meal).toBeVisible();

    const moved = page.waitForResponse((response) => response.url().endsWith("/move"));
    await dragWithMouse(page, meal, slot(page, "Thursday", "dinner"));
    await expect(slot(page, "Thursday", "dinner").getByRole("button", { name: /^Lentil stew, Thursday dinner/ })).toBeVisible();
    // The change shows at once; the next action waits until it is saved, as a person would.
    await moved;
    await expect(slot(page, "Monday", "lunch").getByRole("button", { name: "Add lunch on Monday" })).toBeVisible();
    await expect(dragAnnouncements(page)).toContainText("Lentil stew was moved to Thursday dinner.");

    await page.getByRole("button", { name: "Remove Lentil stew from Thursday dinner" }).click();
    await expect(slot(page, "Thursday", "dinner").getByRole("button", { name: "Add dinner on Thursday" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Clear week" })).toBeDisabled();
    await expect(page.getByRole("region", { name: "Variety" }).getByRole("button")).toHaveAccessibleName(
      "Variety: not enough data yet",
    );
  });

  test("the variety indicator reacts to a repeated recipe", async ({ page }) => {
    for (const day of ["Monday", "Tuesday", "Wednesday"]) {
      await page.getByRole("button", { name: "Add Lentil stew to the plan" }).click();
      await page.getByRole("button", { name: `Add dinner on ${day}` }).click();
      await expect(slot(page, day, "dinner").getByRole("button", { name: /^Lentil stew/ })).toBeVisible();
    }
    await page.getByRole("region", { name: "Variety" }).getByRole("button").click();
    await expect(page.getByText(/Lentil stew is planned 3 times/)).toBeVisible();
  });
});

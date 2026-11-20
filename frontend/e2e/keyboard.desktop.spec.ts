import { dragAnnouncements, pickUpWithKeyboard, pressUntilAnnounced, slot } from "./helpers";
import { expect, openPlanner, test } from "./fixtures";

// Drag and drop always has a keyboard alternative: Space picks up and drops, the arrow keys
// jump between slots, Escape cancels. Each step is announced in a live region.
test.describe("keyboard planning", () => {
  test.beforeEach(async ({ page }) => {
    await openPlanner(page);
  });

  test("assign a recipe and move it with the keyboard only", async ({ page }) => {
    const announced = dragAnnouncements(page);

    await page.getByRole("button", { name: /^Drag Baked salmon/ }).focus();
    await page.keyboard.press("Space");
    await expect(announced).toContainText("Baked salmon is over Monday dinner.");
    await pressUntilAnnounced(page, "ArrowRight", "Baked salmon is over Tuesday dinner.");
    await pressUntilAnnounced(page, "ArrowRight", "Baked salmon is over Wednesday dinner.");
    await page.keyboard.press("Space");
    await expect(announced).toContainText("Baked salmon was added to Wednesday dinner.");
    await expect(slot(page, "Wednesday", "dinner").getByRole("button", { name: /^Baked salmon, Wednesday dinner/ })).toBeVisible();

    // Pick the meal up from its slot (it starts over its own slot) and move it one day later.
    await pickUpWithKeyboard(
      page,
      slot(page, "Wednesday", "dinner").getByRole("button", { name: /^Baked salmon, Wednesday dinner/ }),
      "Baked salmon is over its own slot, Wednesday dinner.",
    );
    await pressUntilAnnounced(page, "ArrowRight", "Baked salmon is over Thursday dinner.");
    await page.keyboard.press("Space");
    await expect(announced).toContainText("Baked salmon was moved to Thursday dinner.");
    await expect(slot(page, "Thursday", "dinner").getByRole("button", { name: /^Baked salmon, Thursday dinner/ })).toBeVisible();
    await expect(slot(page, "Wednesday", "dinner").getByRole("button", { name: "Add dinner on Wednesday" })).toBeVisible();
  });

  test("picking a meal up and dropping it at once leaves it in place", async ({ page }) => {
    const announced = dragAnnouncements(page);
    await page.getByRole("button", { name: "Add Baked salmon to the plan" }).click();
    await page.getByRole("button", { name: "Add dinner on Wednesday" }).click();
    const meal = slot(page, "Wednesday", "dinner").getByRole("button", { name: /^Baked salmon, Wednesday dinner/ });

    await pickUpWithKeyboard(page, meal, "Baked salmon is over its own slot, Wednesday dinner.");
    await page.keyboard.press("Space");
    await expect(announced).toContainText("Baked salmon was not moved.");
    await expect(meal).toBeVisible();
    await expect(slot(page, "Tuesday", "dinner").getByRole("button", { name: "Add dinner on Tuesday" })).toBeVisible();
    await expect(slot(page, "Thursday", "dinner").getByRole("button", { name: "Add dinner on Thursday" })).toBeVisible();
  });

  test("Escape cancels a keyboard drag", async ({ page }) => {
    const announced = dragAnnouncements(page);
    await page.getByRole("button", { name: /^Drag Baked salmon/ }).focus();
    await page.keyboard.press("Space");
    await expect(announced).toContainText("Baked salmon is over Monday dinner.");
    await pressUntilAnnounced(page, "Escape", "Dragging cancelled. Baked salmon was not moved.");
    await expect(page.getByRole("button", { name: /^Remove Baked salmon/ })).toHaveCount(0);
  });

  test("the slot actions dialog opens with Enter and closes with Escape", async ({ page }) => {
    await page.getByRole("button", { name: "Add Lentil stew to the plan" }).click();
    await page.getByRole("button", { name: "Add lunch on Monday" }).click();
    const meal = slot(page, "Monday", "lunch").getByRole("button", { name: /^Lentil stew, Monday lunch/ });
    await meal.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(meal).toBeFocused();
  });
});

import { today } from "./dates";
import { RECIPES } from "./data";
import { showTab } from "./helpers";
import { expect, test } from "./fixtures";
import type { Locator, Page } from "@playwright/test";

/** Opens the shopping list of the current week: a dialog on a desktop, a tab on a phone. */
async function openShopping(page: Page, isMobile: boolean): Promise<Locator> {
  await page.goto("/");
  if (isMobile) {
    await showTab(page, isMobile, "Shopping");
    return page.getByRole("region", { name: /^Shopping list/ });
  }
  await page.getByRole("button", { name: "Shopping list" }).click();
  return page.getByRole("dialog", { name: /^Shopping list/ });
}

test.describe("shopping list", () => {
  test.beforeEach(async ({ resetData }) => {
    const { weekStart } = today();
    await resetData({
      recipes: RECIPES,
      meals: [
        { week_start: weekStart, day: 0, slot: "lunch", recipe_ref: 1 }, // Lentil stew
        { week_start: weekStart, day: 0, slot: "dinner", recipe_ref: 2 }, // Grilled chicken
      ],
      pantry: ["olive oil"],
    });
  });

  test("is built from the planned meals; items can be ticked, added and removed", async ({ page, isMobile }) => {
    const list = await openShopping(page, isMobile);
    await expect(list.getByText("0 of 4 bought")).toBeVisible();

    const toBuy = list.getByRole("region", { name: /^To buy/ });
    await expect(toBuy.getByRole("checkbox", { name: /^200 g lentils/ })).toBeVisible();
    await expect(toBuy.getByRole("checkbox", { name: /^2 chicken breasts/ })).toBeVisible();
    await expect(toBuy.getByRole("checkbox", { name: /Used in Lentil stew/ }).first()).toBeVisible();

    // Tick an item: it moves to the basket and the progress follows.
    await toBuy.getByRole("checkbox", { name: /^200 g lentils/ }).click();
    await expect(list.getByText("1 of 4 bought")).toBeVisible();
    const basket = list.getByRole("region", { name: /^In the basket/ });
    await expect(basket.getByRole("checkbox", { name: /^200 g lentils/ })).toBeChecked();
    await expect(toBuy.getByRole("checkbox", { name: /^200 g lentils/ })).toHaveCount(0);

    // Add an extra item by hand.
    await list.getByRole("textbox", { name: "Add an item" }).fill("oat milk");
    await list.getByRole("button", { name: "Add", exact: true }).click();
    await expect(list.getByRole("checkbox", { name: /^oat milk/ })).toBeVisible();
    await expect(list.getByText("1 of 5 bought")).toBeVisible();
    await expect(list.getByText("Added by hand")).toBeVisible();

    // And remove it again.
    await list.getByRole("button", { name: "Delete oat milk" }).click();
    await expect(list.getByRole("checkbox", { name: /^oat milk/ })).toHaveCount(0);

    // The tick survives a reload (it is saved on the server).
    const again = await openShopping(page, isMobile); // loads the page afresh
    await expect(again.getByText("1 of 4 bought")).toBeVisible();
  });

  test("a pantry staple is shown as being in the pantry, not to buy", async ({ page, isMobile }) => {
    const list = await openShopping(page, isMobile);
    // Olive oil is in both recipes but lives in the pantry.
    await expect(list.getByRole("checkbox", { name: /^olive oil/ })).toHaveCount(0);
    await expect(list.getByText("In the pantry (1)")).toBeVisible();
    await list.getByText("In the pantry (1)").click();
    const needToBuy = list.getByRole("button", { name: "Need to buy olive oil" });
    await expect(needToBuy).toBeVisible();
    // Taking it out of the pantry puts it on the list again.
    await needToBuy.click();
    await expect(list.getByRole("checkbox", { name: /^olive oil/ })).toHaveCount(1);
  });

  test("an ingredient can be marked as always at home", async ({ page, isMobile }) => {
    const list = await openShopping(page, isMobile);
    await list.getByRole("button", { name: "Mark 1 lemon as always at home" }).click();
    await expect(list.getByRole("checkbox", { name: /^1 lemon/ })).toHaveCount(0);
    await expect(list.getByText("In the pantry (2)")).toBeVisible();
  });
});

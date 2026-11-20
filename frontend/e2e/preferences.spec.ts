import { showTab } from "./helpers";
import { expect, test } from "./fixtures";

const VEGAN = ["Lentil stew", "Tofu stir-fry", "Chickpea salad", "Vegetable curry"];

test("Suggest respects the diet set in the household preferences", async ({ page, isMobile }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Household preferences" }).click();
  const dialog = page.getByRole("dialog", { name: "Household preferences" });
  await dialog.getByRole("group", { name: "Diet" }).getByRole("checkbox", { name: "Vegan" }).check();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Household preferences saved.")).toBeVisible();
  await expect(dialog).toHaveCount(0);

  await showTab(page, isMobile, "Week");
  await page.getByRole("button", { name: "Suggest" }).click();
  await expect(page.getByText(/^Filled \d+ slots?/)).toBeVisible();

  const meals = page.getByRole("button", { name: /^Remove .+ from \w+ (lunch|dinner)$/ });
  const names = await meals.evaluateAll((buttons) =>
    buttons.map((button) => /^Remove (.+) from \w+ (?:lunch|dinner)$/.exec(button.getAttribute("aria-label") ?? "")?.[1]),
  );
  expect(names.length).toBeGreaterThan(0);
  for (const name of names) expect(VEGAN).toContain(name);

  // The preference is remembered after a reload.
  await page.reload();
  await page.getByRole("button", { name: "Household preferences" }).click();
  await expect(page.getByRole("group", { name: "Diet" }).getByRole("checkbox", { name: "Vegan" })).toBeChecked();
});

test("an avoided property is left out of the suggestions", async ({ page, isMobile }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Household preferences" }).click();
  const dialog = page.getByRole("dialog", { name: "Household preferences" });
  await dialog.getByRole("group", { name: "Avoid" }).getByRole("checkbox", { name: "Vegetarian" }).check();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Household preferences saved.")).toBeVisible();

  await showTab(page, isMobile, "Week");
  await page.getByRole("button", { name: "Suggest" }).click();
  await expect(page.getByText(/^Filled \d+ slots?/)).toBeVisible();
  const vegetarian = ["Lentil stew", "Veggie omelette", "Tofu stir-fry", "Chickpea salad", "Cheese pasta", "Vegetable curry", "Mushroom risotto"];
  for (const name of vegetarian) {
    await expect(page.getByRole("button", { name: new RegExp(`^Remove ${name} from`) })).toHaveCount(0);
  }
});

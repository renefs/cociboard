import { expect, openPlanner, prepareDemo, test } from "./guide";

// Each test is one picture (or a few of the same screen) for the user guide. They only read
// the demo data, except where a picture needs a change, which `prepareDemo` undoes.
test.beforeEach(async ({ request, language }) => {
  await prepareDemo(request, language);
});

test("overview", async ({ page, t, shot }) => {
  await openPlanner(page, t);
  await shot("desktop-overview");
  await shot("planner-toolbar", page.getByRole("region", { name: t("planner.heading") }).locator("header").first());
});

test("recipe panel and details", async ({ page, t, shot }) => {
  await openPlanner(page, t);
  await shot("recipe-panel", page.getByRole("complementary").first());
  // A tall window, so the whole dialog (steps and history) fits in one picture.
  await page.setViewportSize({ width: 1440, height: 1700 });
  await page.getByRole("button", { name: "Fabada asturiana", exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: t("recipes.steps") })).toBeVisible();
  await expect(dialog.getByText(t("recipes.history.loading"))).toHaveCount(0);
  await shot("recipe-details", dialog);
});

test("recipe form", async ({ page, t, shot }) => {
  await openPlanner(page, t);
  await page.setViewportSize({ width: 1440, height: 1500 });
  await page.getByRole("button", { name: t("recipes.newRecipe") }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(t("recipeForm.name"), { exact: false }).first().fill("Crema de lentejas rojas");
  await dialog.getByRole("textbox", { name: t("recipeForm.ingredientN", { n: 1 }) }).fill("200 g de lentejas rojas");
  await shot("recipe-form", dialog);
});

test("slot picker and actions", async ({ page, t, slot, shot }) => {
  await openPlanner(page, t);
  await slot(3, "dinner").getByRole("button").first().click();
  const picker = page.getByRole("dialog");
  await expect(picker.getByText(t("planner.specialsLabel"))).toBeVisible();
  await expect(picker.getByText(t("planner.pickerLoading"))).toHaveCount(0);
  await shot("slot-picker", picker);
  await page.keyboard.press("Escape");

  await slot(0, "lunch").getByRole("button").first().click();
  const actions = page.getByRole("dialog");
  await expect(actions.getByRole("button", { name: t("planner.editNote") })).toBeVisible();
  await shot("slot-actions", actions);
});

test("drag and drop", async ({ page, t, slot, shot }) => {
  await openPlanner(page, t);
  // The first card of the list, a recipe for lunch or dinner, so every slot accepts it.
  const handle = page.getByRole("button", {
    name: t("planner.dragRecipe", { name: "Migas" }),
  });
  const source = await handle.boundingBox();
  const target = await slot(3, "dinner").boundingBox();
  if (!source || !target) throw new Error("drag ends not on screen");
  // As in e2e/helpers.ts: dnd-kit picks the item up after a few pixels of movement.
  const start = { x: source.x + source.width / 2, y: source.y + source.height / 2 };
  const end = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 12, start.y + 12, { steps: 4 });
  await page.mouse.move(end.x, end.y, { steps: 12 });
  await page.mouse.move(end.x + 1, end.y + 1, { steps: 2 });
  await page.waitForTimeout(300);
  await shot("drag-and-drop");
  await page.keyboard.press("Escape");
  await page.mouse.up();
});

test("variety", async ({ page, t, shot }) => {
  await openPlanner(page, t);
  await page.getByRole("button", { name: new RegExp(t("variety.heading")) }).first().click();
  await page.waitForTimeout(200);
  await shot("variety-open");
});

test("share menu", async ({ page, t, shot }) => {
  await openPlanner(page, t);
  await page.getByRole("button", { name: t("share.menu"), exact: true }).click();
  await expect(page.getByRole("button", { name: t("share.print") })).toBeVisible();
  await shot("share-menu", page.getByRole("region", { name: t("planner.heading") }));
});

test("shopping list and pantry", async ({ page, t, shot }) => {
  await openPlanner(page, t);
  await page.getByRole("button", { name: t("shopping.open") }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: t("shopping.toBuy") })).toBeVisible();
  for (const item of ["Aguacate", "Apio", "Azafrán"]) {
    await dialog.getByRole("checkbox", { name: new RegExp(`^${item} `) }).check();
  }
  await page.waitForTimeout(300);
  await shot("shopping-list", dialog);
  await dialog.getByText(t("shopping.managePantry"), { exact: true }).click();
  const suggestions = dialog.getByRole("heading", { name: t("pantry.suggestionsHeading") });
  await expect(suggestions).toBeVisible();
  await suggestions.scrollIntoViewIfNeeded();
  await shot("pantry", dialog);
});

test("household preferences", async ({ page, t, shot }) => {
  await openPlanner(page, t);
  await page.getByRole("button", { name: t("household.button"), exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("group", { name: t("household.dietHeading") })).toBeVisible();
  await shot("household-preferences", dialog);
});

test("backup", async ({ page, t, shot }) => {
  await openPlanner(page, t);
  await page.getByRole("button", { name: t("backup.button"), exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: t("backup.downloadHeading") })).toBeVisible();
  await shot("backup", dialog);
});

test("header", async ({ page, t, shot }) => {
  await openPlanner(page, t);
  await shot("header", page.getByRole("banner"));
});

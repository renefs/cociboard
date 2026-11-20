import { today } from "./dates";
import { showTab, toast } from "./helpers";
import { expect, test } from "./fixtures";

// Runs on both screen sizes: on a phone the recipe list lives in the Recipes tab.
test.describe("recipes", () => {
  test.beforeEach(async ({ page, isMobile }) => {
    await page.goto("/");
    await showTab(page, isMobile, "Recipes");
  });

  test("create, search, edit, favourite, archive and restore a recipe", async ({ page }) => {
    const list = page.getByRole("region", { name: "Recipes" });

    // Create, with ingredients and steps.
    await list.getByRole("button", { name: "New recipe" }).click();
    const form = page.getByRole("dialog", { name: "New recipe" });
    await form.getByRole("textbox", { name: "Name (required)" }).fill("Spinach quiche");
    await form.getByRole("radio", { name: "Lunch", exact: true }).check();
    await form.getByRole("combobox", { name: "Main protein" }).selectOption({ label: "🥚 Eggs" });
    await form.getByRole("textbox", { name: "Prep time (minutes)" }).fill("35");
    await form.getByRole("textbox", { name: "Servings" }).fill("4");
    await form.getByRole("textbox", { name: "Ingredient 1" }).fill("200 g spinach");
    await form.getByRole("button", { name: "Add ingredient" }).click();
    await form.getByRole("textbox", { name: "Ingredient 2" }).fill("3 eggs");
    await form.getByRole("button", { name: "Add step" }).click();
    await form.getByRole("textbox", { name: "Step 1" }).fill("Wilt the spinach");
    await form.getByRole("button", { name: "Add step" }).click();
    await form.getByRole("textbox", { name: "Step 2" }).fill("Bake with the eggs for 25 minutes");
    await form.getByRole("button", { name: "Vegetarian" }).click();
    await form.getByRole("button", { name: "Create recipe" }).click();

    await expect(form).toHaveCount(0);
    await expect(toast(page, "Created Spinach quiche.")).toBeVisible();
    await expect(page.getByRole("article", { name: "Spinach quiche" })).toBeVisible();

    // Search by name and by ingredient.
    const search = list.getByRole("searchbox", { name: "Search recipes" });
    await search.fill("quiche");
    await expect(list.getByRole("article")).toHaveCount(1);
    await search.fill("spinach");
    await expect(list.getByRole("article", { name: "Spinach quiche" })).toBeVisible();
    await expect(list.getByRole("article")).toHaveCount(1);
    await search.fill("zzz nothing");
    await expect(list.getByText("No recipes match your search or filters.")).toBeVisible();
    await search.fill("quiche");

    // Open the details and check what was saved.
    await list.getByRole("button", { name: "Spinach quiche", exact: true }).click();
    let details = page.getByRole("dialog", { name: "Spinach quiche" });
    await expect(details.getByText("35 min")).toBeVisible();
    await expect(details.getByRole("list", { name: "Ingredients" }).getByRole("listitem")).toHaveText(["200 g spinach", "3 eggs"]);
    await expect(details.getByText("Wilt the spinach")).toBeVisible();
    await expect(details.getByText("Bake with the eggs for 25 minutes")).toBeVisible();
    await expect(details.getByText("Never planned")).toBeVisible();

    // Edit.
    await details.getByRole("button", { name: "Edit" }).click();
    const edit = page.getByRole("dialog", { name: "Edit Spinach quiche" });
    await edit.getByRole("textbox", { name: "Name (required)" }).fill("Spinach and feta quiche");
    await edit.getByRole("textbox", { name: "Prep time (minutes)" }).fill("40");
    await edit.getByRole("button", { name: "Save changes" }).click();
    await expect(toast(page, "Saved Spinach and feta quiche.")).toBeVisible();
    await expect(edit).toHaveCount(0);
    // Saving returns to the details; close them.
    await page.getByRole("dialog", { name: "Spinach and feta quiche" }).getByRole("button", { name: "Close" }).click();
    await search.fill("quiche");
    await expect(list.getByRole("article", { name: "Spinach and feta quiche" })).toContainText("40 min");

    // Favourite it with the star, and filter by favourites.
    await list.getByRole("button", { name: "Add Spinach and feta quiche to favourites" }).click();
    await expect(list.getByRole("button", { name: "Remove Spinach and feta quiche from favourites" })).toBeVisible();
    await search.fill("");
    await list.getByRole("button", { name: "Favourites", exact: true }).click();
    await expect(list.getByRole("article")).toHaveCount(1);
    await expect(list.getByRole("article", { name: "Spinach and feta quiche" })).toBeVisible();
    await list.getByRole("button", { name: "Favourites", exact: true }).click();
    await expect(list.getByRole("article")).toHaveCount(15);

    // Archive it: it leaves the catalogue and appears in the archived list.
    await list.getByRole("button", { name: "Spinach and feta quiche", exact: true }).click();
    details = page.getByRole("dialog", { name: "Spinach and feta quiche" });
    await details.getByRole("button", { name: "Archive" }).click();
    await expect(toast(page, /^Archived Spinach and feta quiche\./)).toBeVisible();
    await expect(list.getByRole("article", { name: "Spinach and feta quiche" })).toHaveCount(0);
    await list.getByRole("button", { name: "Archived (1)" }).click();
    await expect(list.getByRole("list", { name: "Archived recipes" })).toBeVisible();

    // Restore it.
    await list.getByRole("button", { name: "Restore Spinach and feta quiche" }).click();
    await expect(toast(page, "Restored Spinach and feta quiche.")).toBeVisible();
    await expect(list.getByRole("article", { name: "Spinach and feta quiche" })).toBeVisible();
  });

  test("the form explains what is missing", async ({ page }) => {
    await page.getByRole("button", { name: "New recipe" }).click();
    const form = page.getByRole("dialog", { name: "New recipe" });
    await form.getByRole("button", { name: "Create recipe" }).click();
    await expect(form.getByText("Enter a name.")).toBeVisible();
    await expect(form.getByText("Add at least one ingredient.")).toBeVisible();
    // A duplicate name is refused as well.
    await form.getByRole("textbox", { name: "Name (required)" }).fill("lentil stew");
    await form.getByRole("textbox", { name: "Ingredient 1" }).fill("lentils");
    await form.getByRole("button", { name: "Create recipe" }).click();
    await expect(form.getByText("Another recipe already has this name.")).toBeVisible();
  });

  test("filters narrow the list by meal type and sort changes the order", async ({ page }) => {
    const list = page.getByRole("region", { name: "Recipes" });
    await list.getByRole("group", { name: "Meal type" }).getByRole("button", { name: "Lunch" }).click();
    // Lunch-only recipes and the ones that fit both slots; no dinner-only recipe.
    await expect(list.getByRole("article", { name: "Veggie omelette" })).toBeVisible();
    await expect(list.getByRole("article", { name: "Baked salmon" })).toHaveCount(0);
    await list.getByRole("group", { name: "Meal type" }).getByRole("button", { name: "All" }).click();
    await expect(list.getByRole("article", { name: "Baked salmon" })).toBeVisible();
  });
});

test.describe("history", () => {
  test("a recipe planned today counts as made", async ({ page, isMobile }) => {
    const { weekday } = today();
    await page.goto("/");
    await showTab(page, isMobile, "Recipes");

    const card = page.getByRole("article", { name: "Veggie omelette" });
    await expect(card).toContainText("Never planned");
    await card.getByRole("button", { name: "Add Veggie omelette to the plan" }).click();
    await page.getByRole("button", { name: `Add lunch on ${weekday}` }).click();
    await expect(page.getByRole("button", { name: `Remove Veggie omelette from ${weekday} lunch` })).toBeVisible();

    await showTab(page, isMobile, "Recipes");
    await expect(card).toContainText("Last made today");
    await page.getByRole("region", { name: "Recipes" }).getByRole("button", { name: "Veggie omelette", exact: true }).click();
    const details = page.getByRole("dialog", { name: "Veggie omelette" });
    await expect(details.getByRole("heading", { name: "History" })).toBeVisible();
    await expect(details.getByText("Planned 1 time")).toBeVisible();
    await expect(details.getByRole("list", { name: "Planned meals" }).getByRole("listitem")).toHaveText(
      new RegExp(`^${weekday.slice(0, 3)} \\d+ \\w+ · Lunch$`),
    );
  });
});

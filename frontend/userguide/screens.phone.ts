import { DOCS_AUTH_URL } from "../playwright.userguide.config";
import { expect, prepareDemo, test } from "./guide";

// Phone pictures (375×812, touch). The app shows one section at a time, chosen in the
// bottom tab bar.
test.beforeEach(async ({ request, language }) => {
  await prepareDemo(request, language);
});

test("today", async ({ page, t, shot }) => {
  await page.goto("/?view=today");
  await expect(page.getByRole("heading", { name: t("today.heading"), exact: true })).toBeVisible();
  await expect(page.getByText(t("today.loading"))).toHaveCount(0);
  await shot("phone-today");
});

test("week", async ({ page, t, shot }) => {
  await page.goto("/?view=week");
  await expect(page.getByRole("heading", { name: t("planner.heading") })).toBeVisible();
  await expect(page.getByText(t("planner.loadingWeek"))).toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot("phone-week");
});

test("picker", async ({ page, t, slot, shot }) => {
  await page.goto("/?view=week");
  await expect(page.getByText(t("planner.loadingWeek"))).toHaveCount(0);
  await slot(3, "dinner").getByRole("button").first().click();
  await expect(page.getByRole("dialog").getByText(t("planner.specialsLabel"))).toBeVisible();
  await expect(page.getByText(t("planner.pickerLoading"))).toHaveCount(0);
  await shot("phone-picker");
});

test("recipes", async ({ page, t, shot }) => {
  await page.goto("/?view=recipes");
  await expect(page.getByRole("heading", { name: t("recipes.heading"), exact: true })).toBeVisible();
  await expect(page.getByText(t("recipes.loading"))).toHaveCount(0);
  await shot("phone-recipes");
});

test("shopping", async ({ page, t, shot }) => {
  await page.goto("/?view=shopping");
  await expect(page.getByRole("heading", { name: t("shopping.toBuy") })).toBeVisible();
  await shot("phone-shopping");
});

test("sign in", async ({ page, t, shot }) => {
  await page.goto(`${DOCS_AUTH_URL}/`);
  await expect(page.getByRole("button", { name: t("auth.signIn") })).toBeVisible();
  await shot("phone-sign-in");
});

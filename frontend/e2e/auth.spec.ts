import { expect, test } from "@playwright/test";
import { AUTH_URL, E2E_PASSWORD } from "../playwright.config";
import { openSettings } from "./helpers";

// The second backend (COCIBOARD_PASSWORD set) is only used here. These tests use Playwright's
// own `test`, not ./fixtures: the data reset needs a signed-in session.
test.use({ baseURL: AUTH_URL });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("cociboard.language", "en"));
});

test.describe("password mode", () => {
  test("the sign-in page is shown instead of the app", async ({ page, request }) => {
    await page.goto("/");
    await expect(page.getByText("Enter the household password to continue.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Weekly planner" })).toHaveCount(0);
    // The API refuses requests without a session as well.
    expect((await request.get("/api/recipes")).status()).toBe(401);
  });

  test("a wrong password is rejected with a message, the right one gets in", async ({ page }) => {
    await page.goto("/");
    const password = page.getByLabel("Password", { exact: true });

    await password.fill("not-the-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("That password is not correct. Try again.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Weekly planner" })).toHaveCount(0);

    await password.fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("heading", { name: "Weekly planner" }).or(page.getByRole("heading", { name: "Today", level: 2 }))).toBeVisible();
    await openSettings(page);
    await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();

    // The session survives a reload; logging out brings the sign-in page back.
    await page.reload();
    await openSettings(page);
    await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });
});

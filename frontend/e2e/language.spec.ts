import { expect, test } from "./fixtures";
import { openSettings } from "./helpers";
import type { Page } from "@playwright/test";

/** The Spanish tab bar (on a phone) leads to the week; on a desktop it is already there. */
async function showWeek(page: Page, isMobile: boolean): Promise<void> {
  if (!isMobile) return;
  await page.getByRole("navigation", { name: "Secciones principales" }).getByRole("button", { name: "Semana" }).click();
}

test.describe("language", () => {
  test("switching to Spanish translates the interface", async ({ page, isMobile }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await openSettings(page);
    await page.getByRole("group", { name: "Language" }).getByRole("button", { name: "ES" }).click();

    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await showWeek(page, isMobile);
    await expect(page.getByRole("heading", { name: "Planificador semanal" })).toBeVisible();
    await expect(page.getByRole("group", { name: "comida del lunes" })).toBeVisible();
    await expect(page.getByRole("group", { name: "cena del lunes" })).toBeVisible();
    await expect(page.getByText("Comida", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Cena", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Sugerir" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Semana anterior", exact: true })).toBeVisible();

    // The choice is remembered.
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
  });

  test.describe("a Spanish session", () => {
    test.use({ language: "es" });

    test("plans a meal with Spanish labels and dates", async ({ page, isMobile }) => {
      await page.goto("/");
      await showWeek(page, isMobile);
      await expect(page.getByRole("heading", { name: "Planificador semanal" })).toBeVisible();
      await expect(page.getByRole("heading", { level: 3, name: /^Lunes \d+ \w+/ })).toBeVisible();

      await page.getByRole("button", { name: /^Añadir comida el lunes/ }).first().click();
      const picker = page.getByRole("dialog");
      await expect(picker).toBeVisible();
      await picker.getByRole("button", { name: "Elegir Lentil stew" }).click();
      await expect(page.getByRole("button", { name: /^Lentil stew, comida del lunes/ })).toBeVisible();
    });
  });
});

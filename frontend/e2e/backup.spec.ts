import { expect, test } from "./fixtures";
import { openSettings } from "./helpers";

// v0.24.0 raised the export to format 6 while the browser still only accepted 1 to 5, so a
// downloaded backup could not be restored. This round trip goes through the real dialog.
test("a downloaded backup restores through the dialog", async ({ page }) => {
  await page.goto("/");
  await openSettings(page);
  await page.getByRole("button", { name: "Backup" }).click();
  const dialog = page.getByRole("dialog", { name: "Backup" });

  const downloading = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Download backup" }).click();
  const file = await (await downloading).path();

  await dialog.getByLabel("Backup file").setInputFiles(file);
  await expect(dialog.getByRole("status")).toContainText("contains");
  await dialog.getByRole("button", { name: "Restore…" }).click();
  await page.getByRole("dialog", { name: "Replace all your data?" }).getByRole("button", { name: "Replace everything" }).click();
  await expect(page.getByText(/^Backup restored:/)).toBeVisible();
});

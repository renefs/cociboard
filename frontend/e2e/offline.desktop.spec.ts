import { today } from "./dates";
import { slot } from "./helpers";
import { expect, test } from "./fixtures";

// The production service worker (precached shell, network-first API reads) is what makes the
// app usable offline, so this is the one spec that lets it run.
test.use({ serviceWorkers: "allow" });

test("a change made offline is kept and reaches the server when the connection returns", async ({
  page,
  context,
  request,
}) => {
  const mondayLunch = async () => {
    const response = await request.get(`/api/weeks/${today().weekStart}`);
    const week = (await response.json()) as { days: { lunch: { name: string } | null }[] };
    return week.days[0]?.lunch?.name ?? null;
  };

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Weekly planner" })).toBeVisible();
  // Wait for the worker to take control (it claims the page after its first install), then
  // reload so that every request of the page goes through it.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await expect(page.getByRole("button", { name: "Add Lentil stew to the plan" })).toBeVisible();

  await context.setOffline(true);
  await expect(page.getByText(/^You're offline/)).toBeVisible();

  // The change shows at once and is queued.
  await page.getByRole("button", { name: "Add Lentil stew to the plan" }).click();
  await page.getByRole("button", { name: "Add lunch on Monday" }).click();
  await expect(slot(page, "Monday", "lunch").getByRole("button", { name: /^Lentil stew, Monday lunch/ })).toBeVisible();
  await expect(page.getByText("1 change waiting to be saved")).toBeVisible();

  // Nothing reached the server while offline; once back online the queued change is sent.
  expect(await mondayLunch()).toBeNull();
  await context.setOffline(false);
  await expect(page.getByText("Back online")).toBeVisible();
  await expect.poll(mondayLunch).toBe("Lentil stew");
  await expect(page.getByText("1 change waiting to be saved")).toHaveCount(0);
});

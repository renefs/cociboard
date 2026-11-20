import type { APIRequestContext, Page } from "@playwright/test";
import { RECIPES } from "./data";
import { today } from "./dates";
import { slot } from "./helpers";
import { expect, test } from "./fixtures";

// The production service worker (precached shell, network-first API reads) is what makes the
// app usable offline, so this is the one spec that lets it run.
test.use({ serviceWorkers: "allow" });

const { weekStart } = today();

interface Week {
  days: { lunch: { name: string } | null; dinner: { name: string } | null }[];
}
interface Shopping {
  items: { key: string; checked: boolean }[];
}

async function serverWeek(request: APIRequestContext): Promise<Week> {
  return (await (await request.get(`/api/weeks/${weekStart}`)).json()) as Week;
}
async function mondayMeals(request: APIRequestContext): Promise<{ lunch: string | null; dinner: string | null }> {
  const monday = (await serverWeek(request)).days[0];
  return { lunch: monday?.lunch?.name ?? null, dinner: monday?.dinner?.name ?? null };
}
async function lentilsChecked(request: APIRequestContext): Promise<boolean | undefined> {
  const list = (await (await request.get(`/api/weeks/${weekStart}/shopping-list`)).json()) as Shopping;
  return list.items.find((item) => item.key.includes("lentils"))?.checked;
}

/** Loads the app, lets the service worker take control and caches the shopping list. */
async function openWithWorker(page: Page): Promise<void> {
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
  // Open the shopping list once online, so that the worker holds a copy of it for later.
  await page.getByRole("button", { name: "Shopping list" }).click();
  const dialog = page.getByRole("dialog", { name: /^Shopping list/ });
  await expect(dialog.getByRole("checkbox", { name: /^200 g lentils/ })).toBeVisible();
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toHaveCount(0);
}

async function planLentilStew(page: Page, day: string, meal: "lunch" | "dinner"): Promise<void> {
  await page.getByRole("button", { name: "Add Lentil stew to the plan" }).click();
  await page.getByRole("button", { name: `Add ${meal} on ${day}` }).click();
  await expect(slot(page, day, meal).getByRole("button", { name: new RegExp(`^Lentil stew, ${day} ${meal}`) })).toBeVisible();
}

async function tickLentils(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Shopping list" }).click();
  const dialog = page.getByRole("dialog", { name: /^Shopping list/ });
  await dialog.getByRole("checkbox", { name: /^200 g lentils/ }).click();
  await expect(dialog.getByRole("checkbox", { name: /^200 g lentils/ })).toBeChecked();
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toHaveCount(0);
}

test.beforeEach(async ({ resetData }) => {
  await resetData({
    recipes: RECIPES,
    meals: [{ week_start: weekStart, day: 2, slot: "lunch", recipe_ref: 1 }], // Lentil stew on Wednesday
    pantry: ["olive oil"],
  });
});

test("a change made offline is kept and reaches the server when the connection returns", async ({
  page,
  context,
  request,
}) => {
  await openWithWorker(page);

  await context.setOffline(true);
  await expect(page.getByText(/^You're offline/)).toBeVisible();

  // The change shows at once and is queued.
  await planLentilStew(page, "Monday", "lunch");
  await expect(page.getByText("1 change waiting to be saved")).toBeVisible();

  // Nothing reached the server while offline; once back online the queued change is sent.
  expect((await mondayMeals(request)).lunch).toBeNull();
  await context.setOffline(false);
  await expect(page.getByText("Back online")).toBeVisible();
  await expect.poll(async () => (await mondayMeals(request)).lunch).toBe("Lentil stew");
  await expect(page.getByText("1 change waiting to be saved")).toHaveCount(0);
});

test("changes made offline survive a reload while offline and are sent in order afterwards", async ({
  page,
  context,
  request,
}) => {
  await openWithWorker(page);
  await context.setOffline(true);
  await expect(page.getByText(/^You're offline/)).toBeVisible();

  // Two plan changes and a shopping tick. The plan ones are order-sensitive: the slot is
  // filled and then emptied, so a reversed order would leave Lentil stew on the server.
  await planLentilStew(page, "Monday", "lunch");
  await page.getByRole("button", { name: "Remove Lentil stew from Monday lunch" }).click();
  await expect(slot(page, "Monday", "lunch").getByRole("button", { name: "Add lunch on Monday" })).toBeVisible();
  await planLentilStew(page, "Monday", "dinner");
  await tickLentils(page);
  await expect(page.getByText("4 changes waiting to be saved")).toBeVisible();

  // Close the app's page state: reload while still offline (the worker serves the shell).
  await page.reload();
  await expect(page.getByRole("heading", { name: "Weekly planner" })).toBeVisible();
  await expect(page.getByText(/^You're offline/)).toBeVisible();

  // Everything is still shown as the user left it, and still waiting.
  await expect(slot(page, "Monday", "dinner").getByRole("button", { name: /^Lentil stew, Monday dinner/ })).toBeVisible();
  await expect(slot(page, "Monday", "lunch").getByRole("button", { name: "Add lunch on Monday" })).toBeVisible();
  await expect(page.getByText("4 changes waiting to be saved")).toBeVisible();
  await page.getByRole("button", { name: "Shopping list" }).click();
  await expect(
    page.getByRole("dialog", { name: /^Shopping list/ }).getByRole("checkbox", { name: /^200 g lentils/ }),
  ).toBeChecked();
  await page.keyboard.press("Escape");

  // The server has none of it.
  expect(await mondayMeals(request)).toEqual({ lunch: null, dinner: null });
  expect(await lentilsChecked(request)).toBe(false);

  await context.setOffline(false);
  await expect.poll(() => mondayMeals(request)).toEqual({ lunch: null, dinner: "Lentil stew" });
  await expect.poll(() => lentilsChecked(request)).toBe(true);
  await expect(page.getByText(/changes? waiting to be saved/)).toHaveCount(0);
  // The screen ends up matching the server.
  await expect(slot(page, "Monday", "dinner").getByRole("button", { name: /^Lentil stew, Monday dinner/ })).toBeVisible();
  await expect(slot(page, "Monday", "lunch").getByRole("button", { name: "Add lunch on Monday" })).toBeVisible();
});

test("changes made offline are sent when the app is closed and opened again online", async ({
  page,
  context,
  request,
}) => {
  await openWithWorker(page);
  await context.setOffline(true);
  await expect(page.getByText(/^You're offline/)).toBeVisible();
  await planLentilStew(page, "Tuesday", "lunch");
  await planLentilStew(page, "Tuesday", "dinner");
  await expect(page.getByText("2 changes waiting to be saved")).toBeVisible();

  // Close the page (a new page of the same browser profile shares the stored changes).
  await page.close();
  expect((await serverWeek(request)).days[1]).toMatchObject({ lunch: null, dinner: null });

  await context.setOffline(false);
  const reopened = await context.newPage();
  await reopened.goto("/");
  await expect(reopened.getByRole("heading", { name: "Weekly planner" })).toBeVisible();

  await expect.poll(async () => (await serverWeek(request)).days[1]?.lunch?.name).toBe("Lentil stew");
  await expect.poll(async () => (await serverWeek(request)).days[1]?.dinner?.name).toBe("Lentil stew");
  await expect(slot(reopened, "Tuesday", "dinner").getByRole("button", { name: /^Lentil stew, Tuesday dinner/ })).toBeVisible();
  await expect(reopened.getByText(/changes? waiting to be saved/)).toHaveCount(0);
});

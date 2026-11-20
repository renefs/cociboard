import { expect, type Locator, type Page } from "@playwright/test";

/** A slot of the weekly grid, e.g. `slot(page, "Monday", "lunch")`. */
export function slot(page: Page, day: string, meal: "lunch" | "dinner"): Locator {
  return page.getByRole("group", { name: `${day} ${meal}`, exact: true });
}

/** The dnd-kit live region: where drag and drop announcements are spoken. */
export function dragAnnouncements(page: Page): Locator {
  return page.locator("[id^='DndLiveRegion']");
}

/**
 * A real mouse drag (dnd-kit's pointer sensor needs the pointer to move a few pixels
 * before it picks the item up, and a few moves over the target to register it). Both ends
 * must be on screen at once, so pick recipes near the top of the list.
 */
export async function dragWithMouse(page: Page, from: Locator, to: Locator): Promise<void> {
  await from.scrollIntoViewIfNeeded();
  const source = await from.boundingBox();
  const target = await to.boundingBox();
  if (!source || !target) throw new Error("drag source or target is not on screen");
  const start = { x: source.x + source.width / 2, y: source.y + source.height / 2 };
  const end = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 12, start.y + 12, { steps: 4 });
  await page.mouse.move(end.x, end.y, { steps: 12 });
  await page.mouse.move(end.x + 1, end.y + 1, { steps: 2 });
  await page.mouse.up();
  // The drag chip animates back over the grid after the drop and takes the clicks meant for
  // the slots below it, so the drag ends when it is gone. It has no role: a CSS locator.
  await expect(page.locator(".drag-chip")).toHaveCount(0);
}

/** The week's variety score as announced by the variety button (e.g. 90), or undefined. */
export async function varietyScore(page: Page): Promise<number | undefined> {
  const button = page.getByRole("region", { name: "Variety" }).getByRole("button");
  await expect(button).toBeVisible();
  const label = (await button.getAttribute("aria-label")) ?? (await button.innerText());
  const match = /^(\d+) Variety/.exec(label);
  return match ? Number(match[1]) : undefined;
}

/**
 * Presses `key` until the drag announcement contains `text`. The first arrow press after
 * picking something up doesn't always move it, so the target is checked, not counted.
 */
export async function pressUntilAnnounced(page: Page, key: string, text: string): Promise<void> {
  const live = dragAnnouncements(page);
  await expect(async () => {
    if (!(await live.innerText()).includes(text)) await page.keyboard.press(key);
    await expect(live).toContainText(text, { timeout: 400 });
  }).toPass({ timeout: 6_000 });
}

/**
 * Picks `item` up with Space and waits for the first announcement. dnd-kit ignores a pick-up
 * while the previous drop is still animating, so the key is pressed again until it takes.
 */
export async function pickUpWithKeyboard(page: Page, item: Locator, text: string | RegExp): Promise<void> {
  const live = dragAnnouncements(page);
  await expect(async () => {
    await item.focus();
    await page.keyboard.press("Space");
    await expect(live).toContainText(text, { timeout: 700 });
  }).toPass({ timeout: 6_000 });
  // dnd-kit's keyboard sensor starts listening for keys in a `setTimeout` after the pick-up,
  // which can be after the announcement renders. A key pressed before that reaches the
  // focused button instead, so wait for a timer queued now, which runs after dnd-kit's.
  await page.evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
}

type Tab = "Today" | "Week" | "Recipes" | "Shopping";

/** Goes to a section on a phone (bottom tab bar). On a desktop everything is already there. */
export async function showTab(page: Page, isMobile: boolean, tab: Tab): Promise<void> {
  if (!isMobile) return;
  await page.getByRole("navigation", { name: "Main sections" }).getByRole("button", { name: tab }).click();
}

/** A toast message (they are announced through a polite live region with no role). */
export function toast(page: Page, text: string | RegExp): Locator {
  return page.getByText(text);
}

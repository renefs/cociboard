import { expect, test as base, type Page } from "@playwright/test";
import { backupDocument, type Seed } from "./data";

interface Options {
  /** UI language, written to the same localStorage key the language switcher uses. */
  language: "en" | "es";
}

interface Fixtures {
  /** Automatic: restores the known data before every test. */
  freshData: void;
  /** Replace all data with the known catalogue (plus `seed`) through the restore endpoint. */
  resetData: (seed?: Seed) => Promise<void>;
}

/**
 * Every test starts from the same state: an automatic fixture restores a known backup
 * document through `POST /api/backup/restore` (a transactional full reset), so tests don't
 * depend on each other or on their order.
 */
export const test = base.extend<Options & Fixtures>({
  language: ["en", { option: true }],

  resetData: async ({ request, baseURL }, use) => {
    await use(async (seed) => {
      const response = await request.post(`${baseURL}/api/backup/restore`, { data: backupDocument(seed) });
      expect(response.ok(), await response.text()).toBe(true);
    });
  },

  // Automatic: every test starts from the known state, whether it asks for it or not.
  freshData: [
    async ({ resetData }, use) => {
      await resetData();
      await use();
    },
    { auto: true },
  ],

  page: async ({ page, language }, use) => {
    await page.addInitScript((lang) => {
      try {
        // Only a default: an explicit choice made in the test survives a reload.
        if (!window.localStorage.getItem("cociboard.language")) window.localStorage.setItem("cociboard.language", lang);
      } catch {
        // storage unavailable: the app falls back to the browser language
      }
    }, language);
    // The app saves optimistically: a test can end while its last change is still on the
    // way to the server, and that request must not land after the next test's reset.
    let inFlight = 0;
    const isApi = (url: string) => new URL(url).pathname.startsWith("/api/");
    page.on("request", (request) => {
      if (isApi(request.url())) inFlight++;
    });
    const done = (request: { url(): string }) => {
      if (isApi(request.url())) inFlight--;
    };
    page.on("requestfinished", done);
    page.on("requestfailed", done);

    await use(page);

    let quietSince = Date.now();
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline && !page.isClosed()) {
      if (inFlight > 0) quietSince = Date.now();
      else if (Date.now() - quietSince >= 200) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  },
});

export { expect };

/** Opens the planner (the current week) and waits for the grid to load. */
export async function openPlanner(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /weekly planner|planificador/i })).toBeVisible();
}

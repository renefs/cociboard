import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { defineConfig, devices } from "@playwright/test";

// End-to-end tests (ADR-0028): the built frontend, served by the real backend on a real
// SQLite file. The config does NOT build the frontend: run `npm run build` first (`make e2e`
// and the CI job do). Ports can be overridden so the suite never collides with a dev server.
const PORT = Number(process.env["COCIBOARD_E2E_PORT"] ?? 8766);
const AUTH_PORT = Number(process.env["COCIBOARD_E2E_AUTH_PORT"] ?? 8767);
export const TIMEZONE = "Europe/Madrid";
export const AUTH_URL = `http://127.0.0.1:${AUTH_PORT}`;
export const E2E_PASSWORD = "e2e-household-password";
export const E2E_TMP = join(tmpdir(), `cociboard-e2e-${PORT}`);

const dist = resolve(import.meta.dirname, "dist");
const ci = Boolean(process.env["CI"]);

/** A backend serving `dist` with its own throwaway database, wiped on every start. */
function server(port: number, name: string, extraEnv: Record<string, string> = {}) {
  const dir = join(E2E_TMP, name);
  return {
    command:
      `rm -rf "${dir}" && mkdir -p "${dir}" && ` +
      `exec uv run --frozen --directory ../backend uvicorn cociboard.main:app --port ${port} --log-level warning`,
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      COCIBOARD_DATABASE_URL: `sqlite:///${join(dir, "e2e.db")}`,
      COCIBOARD_STATIC_DIR: dist,
      COCIBOARD_SEED_ON_STARTUP: "false",
      COCIBOARD_BACKUP_INTERVAL_HOURS: "0",
      COCIBOARD_RECIPE_IMPORT: "false",
      TZ: TIMEZONE,
      ...extraEnv,
    },
  };
}

export default defineConfig({
  testDir: "./e2e",
  globalTeardown: "./e2e/global-teardown.ts",
  // One database is shared by every test (each test resets it through the API), so tests
  // cannot run in parallel.
  workers: 1,
  fullyParallel: false,
  retries: ci ? 2 : 0,
  forbidOnly: ci,
  reporter: ci ? [["list"], ["html", { open: "never" }]] : "list",
  timeout: 30_000,
  expect: { timeout: 7_000 },
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    locale: "en-GB",
    timezoneId: TIMEZONE,
    trace: "on-first-retry",
    // A stuck action fails with its own line instead of eating the whole test timeout.
    actionTimeout: 10_000,
    // The service worker would cache API reads across tests; the offline spec opts back in.
    serviceWorkers: "block",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
      testIgnore: /\.phone\.spec\.ts$/,
    },
    {
      name: "phone",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 375, height: 812 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2,
      },
      testIgnore: /\.desktop\.spec\.ts$/,
    },
  ],
  webServer: [
    server(PORT, "main"),
    server(AUTH_PORT, "auth", { COCIBOARD_PASSWORD: E2E_PASSWORD }),
  ],
});

import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { TIMEZONE } from "./playwright.config";

// Screenshots for the user guide (userguide/, published to GitHub Pages). Not a test suite:
// `make docs-screenshots` builds the frontend and runs this config, which drives the real app
// (the built frontend served by the real backend, seeded with the starter recipes) and writes
// PNG files into userguide/docs/<language>/images/. Like the E2E config it never builds.
const PORT = Number(process.env["COCIBOARD_DOCS_PORT"] ?? 8768);
const AUTH_PORT = Number(process.env["COCIBOARD_DOCS_AUTH_PORT"] ?? 8769);
export const DOCS_AUTH_URL = `http://127.0.0.1:${AUTH_PORT}`;
export const DOCS_TMP = join(tmpdir(), `cociboard-userguide-${PORT}`);
const dist = resolve(import.meta.dirname, "dist");

function server(port: number, name: string, extraEnv: Record<string, string> = {}) {
  const dir = join(DOCS_TMP, name);
  return {
    command:
      `rm -rf "${dir}" && mkdir -p "${dir}" && ` +
      `exec uv run --frozen --directory ../backend uvicorn cociboard.main:app --port ${port} --log-level warning`,
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      COCIBOARD_DATABASE_URL: `sqlite:///${join(dir, "userguide.db")}`,
      COCIBOARD_STATIC_DIR: dist,
      COCIBOARD_SEED_ON_STARTUP: "true",
      COCIBOARD_BACKUP_INTERVAL_HOURS: "0",
      TZ: TIMEZONE,
      ...extraEnv,
    },
  };
}

const desktop = { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const phone = {
  ...devices["Desktop Chrome"],
  viewport: { width: 375, height: 812 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
};

export default defineConfig<{ language: "en" | "es" }>({
  testDir: "./userguide",
  globalTeardown: "./userguide/teardown.ts",
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    timezoneId: TIMEZONE,
    actionTimeout: 10_000,
    serviceWorkers: "block",
    // Screenshots must not catch a transition halfway.
    reducedMotion: "reduce",
  },
  projects: [
    { name: "desktop-en", use: { ...desktop, locale: "en-GB", language: "en" }, testMatch: /desktop\.ts$/ },
    { name: "desktop-es", use: { ...desktop, locale: "es-ES", language: "es" }, testMatch: /desktop\.ts$/ },
    { name: "phone-en", use: { ...phone, locale: "en-GB", language: "en" }, testMatch: /phone\.ts$/ },
    { name: "phone-es", use: { ...phone, locale: "es-ES", language: "es" }, testMatch: /phone\.ts$/ },
  ],
  webServer: [server(PORT, "main"), server(AUTH_PORT, "auth", { COCIBOARD_PASSWORD: "userguide-password" })],
});

import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { configDefaults } from "vitest/config";
import pkg from "./package.json" with { type: "json" };
import { serviceWorker } from "./plugins/serviceWorker.ts";

// The API target can be overridden, e.g. COCIBOARD_API_URL=http://localhost:8765 npm run dev.
export default defineConfig(({ mode }) => ({
  plugins: [react(), serviceWorker({ version: pkg.version })],
  server: {
    proxy: {
      "/api": loadEnv(mode, ".", "COCIBOARD_")["COCIBOARD_API_URL"] ?? "http://localhost:8000",
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    // The Playwright specs in e2e/ run with `make e2e`, not here.
    exclude: [...configDefaults.exclude, "e2e/**", "playwright.config.ts"],
    globals: false,
    restoreMocks: true,
  },
}));

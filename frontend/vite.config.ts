/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

// The API target can be overridden, e.g. COCIBOARD_API_URL=http://localhost:8765 npm run dev.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  server: {
    proxy: {
      "/api": loadEnv(mode, ".", "COCIBOARD_")["COCIBOARD_API_URL"] ?? "http://localhost:8000",
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: false,
    restoreMocks: true,
  },
}));

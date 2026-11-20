import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "node_modules", "coverage"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { "react-hooks": reactHooks },
    rules: { ...reactHooks.configs.recommended.rules },
  },
  {
    // Playwright fixtures take a callback named `use`, which the hooks rule mistakes for React's.
    files: ["e2e/**/*.ts", "userguide/**/*.ts"],
    rules: { "react-hooks/rules-of-hooks": "off" },
  },
  {
    files: ["src/sw/sw.ts"],
    languageOptions: { globals: { ...globals.serviceworker } },
  },
  {
    files: ["*.config.{js,ts}", "plugins/*.ts"],
    languageOptions: { globals: { ...globals.node } },
  },
);

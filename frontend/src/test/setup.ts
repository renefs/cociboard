import "@testing-library/jest-dom/vitest";
import { act, cleanup } from "@testing-library/react";
import { afterEach, beforeEach } from "vitest";
import i18n from "../i18n";

// Component tests assert English text, whatever the test machine's language is.
beforeEach(async () => {
  window.localStorage.clear();
  await act(() => i18n.changeLanguage("en"));
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, "matchMedia");
});

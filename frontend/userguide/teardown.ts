import { rmSync } from "node:fs";
import { DOCS_TMP } from "../playwright.userguide.config";

/** Removes the throwaway databases once the screenshots are taken. */
export default function globalTeardown(): void {
  rmSync(DOCS_TMP, { recursive: true, force: true });
}

import { rmSync } from "node:fs";
import { E2E_TMP } from "../playwright.config";

/** Removes the throwaway databases once the run is over. */
export default function globalTeardown(): void {
  rmSync(E2E_TMP, { recursive: true, force: true });
}

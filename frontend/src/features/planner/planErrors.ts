import type { TFunction } from "i18next";
import { ApiError } from "../../api/client";

/** User-facing text for a failed plan mutation (the change has been rolled back). */
export function describePlanError(error: unknown, t: TFunction): string {
  if (error instanceof ApiError) {
    if (error.status === 422) return t("planner.errors.unprocessable");
    if (error.status === 409) return t("planner.errors.conflict");
    if (error.status === 404) return t("planner.errors.notFound");
  }
  return t("planner.errors.generic");
}

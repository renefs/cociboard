import { ApiError } from "../../api/client";

/** User-facing text for a failed plan mutation (the change has been rolled back). */
export function describePlanError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 422) return "That recipe doesn't fit that slot. Nothing was changed.";
    if (error.status === 409) return "The plan changed meanwhile; reload and try again.";
    if (error.status === 404) return "That recipe or slot no longer exists. Your plan was refreshed.";
  }
  return "Couldn't save your change, so it was undone. Check your connection and try again.";
}

import { API_CACHE_NAME } from "../sw/shared";

/** Delete the offline copy of API responses (its data belongs to a session that has ended). */
export async function clearApiCache(): Promise<void> {
  if (typeof caches === "undefined") return;
  try {
    await caches.delete(API_CACHE_NAME);
  } catch {
    // Storage blocked: there is nothing cached to protect.
  }
}

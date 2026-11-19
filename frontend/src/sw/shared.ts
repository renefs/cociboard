// Constants shared by the service worker, the build plugin and the page.

/** Cache Storage entry holding the last good GET /api responses (deleted on logout / 401). */
export const API_CACHE_NAME = "cociboard-api";

/** Versioned shell caches are named `${SHELL_CACHE_PREFIX}${buildId}`. */
export const SHELL_CACHE_PREFIX = "cociboard-shell-";

/** Message the page posts to a waiting worker to make it take over. */
export const SKIP_WAITING_MESSAGE = { type: "SKIP_WAITING" } as const;

export function isSkipWaitingMessage(data: unknown): boolean {
  return typeof data === "object" && data !== null && (data as { type?: unknown }).type === SKIP_WAITING_MESSAGE.type;
}

/** Files copied from `public/` as they are (not hashed, so not found in the bundle). */
export const PUBLIC_FILES: readonly string[] = [
  "/manifest.webmanifest",
  "/icon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
  "/apple-touch-icon.png",
];

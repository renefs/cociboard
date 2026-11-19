import { PUBLIC_FILES } from "./shared";

export type Route = "precache" | "network-first-api" | "navigation" | "bypass";

/** API paths that always go to the network and are never cached. */
function isApiBypass(path: string): boolean {
  return (
    path === "/api/auth" || path.startsWith("/api/auth/") || path.startsWith("/api/backup") || path === "/api/health"
  );
}

/**
 * Decide how the service worker answers a request. Pure so it can be unit tested.
 * `isNavigation` is true for page loads (`request.mode === "navigate"`).
 */
export function routeRequest(url: string | URL, method: string, origin: string, isNavigation = false): Route {
  const target = typeof url === "string" ? new URL(url, origin) : url;
  if (method.toUpperCase() !== "GET" || target.origin !== origin) return "bypass";
  const path = target.pathname;
  if (path === "/api" || path.startsWith("/api/")) {
    return isApiBypass(path) ? "bypass" : "network-first-api";
  }
  if (path.startsWith("/assets/") || PUBLIC_FILES.includes(path)) return "precache";
  return isNavigation ? "navigation" : "bypass";
}

/** Only a plain 200 from our own origin is worth keeping for offline reading. */
export function isCacheableApiResponse(response: { status: number; type: string }): boolean {
  return response.status === 200 && response.type === "basic";
}

/** Navigations to these paths return the app shell; their response refreshes the cached shell. */
export function isShellPath(pathname: string): boolean {
  return pathname === "/" || pathname === "/index.html";
}

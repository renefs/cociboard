/// <reference lib="webworker" />
// Cociboard service worker: precached app shell, network-first API reads for offline viewing.
// Built by plugins/serviceWorker.ts, which defines the two constants below.
import { isCacheableApiResponse, isShellPath, routeRequest } from "./routing";
import { API_CACHE_NAME, SHELL_CACHE_PREFIX, isSkipWaitingMessage } from "./shared";

declare const self: ServiceWorkerGlobalScope;
declare const __PRECACHE_ASSETS__: string[];
declare const __BUILD_ID__: string;

const SHELL_CACHE = `${SHELL_CACHE_PREFIX}${__BUILD_ID__}`;
const SHELL_URL = "/";

self.addEventListener("install", (event) => {
  // No skipWaiting here: the page asks for it (SKIP_WAITING) when the user taps Reload.
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      cache.addAll([SHELL_URL, ...__PRECACHE_ASSETS__].map((url) => new Request(url, { cache: "reload" }))),
    ),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith(SHELL_CACHE_PREFIX) && name !== SHELL_CACHE)
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (isSkipWaitingMessage(event.data)) void self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const route = routeRequest(request.url, request.method, self.location.origin, request.mode === "navigate");
  if (route === "precache") event.respondWith(cacheFirst(request));
  else if (route === "network-first-api") event.respondWith(networkFirstApi(request));
  else if (route === "navigation") event.respondWith(navigate(request));
  // "bypass": no respondWith, the browser handles the request as usual.
});

async function cacheFirst(request: Request): Promise<Response> {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) void cache.put(request, response.clone());
  return response;
}

async function networkFirstApi(request: Request): Promise<Response> {
  try {
    const response = await fetch(request);
    if (response.status === 401) {
      // The session ended: nothing read under it may stay on the device.
      await caches.delete(API_CACHE_NAME);
    } else if (isCacheableApiResponse(response)) {
      const cache = await caches.open(API_CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await (await caches.open(API_CACHE_NAME)).match(request);
    if (cached) return cached;
    throw error;
  }
}

async function navigate(request: Request): Promise<Response> {
  const shell = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok && isShellPath(new URL(request.url).pathname)) {
      await shell.put(SHELL_URL, response.clone());
    }
    return response;
  } catch (error) {
    // SPA: any page falls back to the app shell.
    const cached = await shell.match(SHELL_URL);
    if (cached) return cached;
    throw error;
  }
}

import { describe, expect, it } from "vitest";
import { isCacheableApiResponse, isShellPath, routeRequest } from "./routing";

const ORIGIN = "https://nas.example";
const route = (path: string, method = "GET", nav = false) => routeRequest(`${ORIGIN}${path}`, method, ORIGIN, nav);

describe("routeRequest", () => {
  it("bypasses non-GET requests and other origins", () => {
    expect(route("/api/weeks/2026-11-16", "PUT")).toBe("bypass");
    expect(route("/api/recipes", "POST")).toBe("bypass");
    expect(routeRequest("https://other.example/api/recipes", "GET", ORIGIN)).toBe("bypass");
  });

  it("never caches auth, backup and health", () => {
    for (const path of ["/api/auth/status", "/api/auth/login", "/api/backup", "/api/backup/download", "/api/health"]) {
      expect(route(path)).toBe("bypass");
    }
  });

  it("answers other API reads network-first", () => {
    expect(route("/api/recipes?archived=false")).toBe("network-first-api");
    expect(route("/api/weeks/2026-11-16")).toBe("network-first-api");
    expect(route("/api/authors")).toBe("network-first-api");
  });

  it("serves built assets, icons and the manifest from the precache", () => {
    for (const path of ["/assets/index-abc.js", "/icon.svg", "/icon-192.png", "/manifest.webmanifest", "/apple-touch-icon.png"]) {
      expect(route(path)).toBe("precache");
    }
  });

  it("treats page loads as navigations and ignores other requests", () => {
    expect(route("/", "GET", true)).toBe("navigation");
    expect(route("/some/deep/path", "GET", true)).toBe("navigation");
    // The Android share target opens the app at "/?share-url=..." and must get the shell.
    expect(route("/?share-url=https%3A%2F%2Fexample.com%2Fr&share-text=Stew", "GET", true)).toBe("navigation");
    expect(route("/sw.js")).toBe("bypass");
    expect(route("/favicon.ico")).toBe("bypass");
  });

  it("accepts a URL object", () => {
    expect(routeRequest(new URL(`${ORIGIN}/api/recipes`), "get", ORIGIN)).toBe("network-first-api");
  });
});

describe("isCacheableApiResponse", () => {
  it("keeps only plain 200 responses", () => {
    expect(isCacheableApiResponse({ status: 200, type: "basic" })).toBe(true);
    expect(isCacheableApiResponse({ status: 404, type: "basic" })).toBe(false);
    expect(isCacheableApiResponse({ status: 200, type: "opaque" })).toBe(false);
    expect(isCacheableApiResponse({ status: 401, type: "basic" })).toBe(false);
  });
});

describe("isShellPath", () => {
  it("recognises the shell document", () => {
    expect(isShellPath("/")).toBe(true);
    expect(isShellPath("/index.html")).toBe(true);
    expect(isShellPath("/other")).toBe(false);
  });
});

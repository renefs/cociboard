import { describe, expect, it } from "vitest";
import { PUBLIC_FILES } from "../src/sw/shared";
import { buildId, hashString, precacheUrls } from "./precache.ts";

describe("precacheUrls", () => {
  it("lists built assets and public files, without maps, the HTML or the worker", () => {
    const urls = precacheUrls(["index.html", "sw.js", "assets/index-abc.js", "assets/index-abc.js.map", "assets/a-1.css"]);
    expect(urls).toEqual(["/assets/a-1.css", "/assets/index-abc.js", ...PUBLIC_FILES]);
  });
});

describe("buildId", () => {
  const urls = ["/assets/a.js"];
  it("is stable for the same inputs", () => {
    expect(buildId("1.0.0", urls, "<html>")).toBe(buildId("1.0.0", urls, "<html>"));
  });
  it("changes with the version, the asset list and the shell HTML", () => {
    const base = buildId("1.0.0", urls, "<html>");
    expect(buildId("1.0.1", urls, "<html>")).not.toBe(base);
    expect(buildId("1.0.0", ["/assets/b.js"], "<html>")).not.toBe(base);
    expect(buildId("1.0.0", urls, "<html2>")).not.toBe(base);
  });
  it("hashes to a short alphanumeric string", () => {
    expect(hashString("x")).toMatch(/^[0-9a-z]+$/);
  });
});

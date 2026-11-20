import { describe, expect, it } from "vitest";
import { extractUrl, hasShareParams, searchWithoutShare, sharedUrlFromSearch } from "./shareTarget";

describe("extractUrl", () => {
  it("finds a link inside shared text, without trailing punctuation", () => {
    expect(extractUrl("Great lentil stew https://example.com/stew")).toBe("https://example.com/stew");
    expect(extractUrl("Try this: (https://example.com/a?b=1&c=2).")).toBe("https://example.com/a?b=1&c=2");
    expect(extractUrl("see http://example.com/x, thanks")).toBe("http://example.com/x");
  });

  it("returns null when there is no http(s) link", () => {
    expect(extractUrl("")).toBeNull();
    expect(extractUrl("just a title")).toBeNull();
    expect(extractUrl("ftp://example.com/file")).toBeNull();
    expect(extractUrl("javascript:alert(1)")).toBeNull();
    expect(extractUrl("https://")).toBeNull();
  });
});

describe("sharedUrlFromSearch", () => {
  it("prefers share-url over a link in share-text", () => {
    const search = "?share-url=https%3A%2F%2Fa.example%2Fr&share-text=Stew%20https%3A%2F%2Fb.example%2Fr";
    expect(sharedUrlFromSearch(search)).toBe("https://a.example/r");
  });

  it("falls back to share-text, where Android puts the link", () => {
    const search = "?share-title=Stew&share-text=Lentil%20stew%20https%3A%2F%2Fb.example%2Fr";
    expect(sharedUrlFromSearch(search)).toBe("https://b.example/r");
    expect(sharedUrlFromSearch("?share-url=not-a-link&share-text=https%3A%2F%2Fb.example%2F")).toBe(
      "https://b.example/",
    );
  });

  it("ignores everything else", () => {
    expect(sharedUrlFromSearch("")).toBeNull();
    expect(sharedUrlFromSearch("?week=2026-11-16&view=recipes")).toBeNull();
    expect(sharedUrlFromSearch("?share-text=hello")).toBeNull();
  });
});

describe("searchWithoutShare", () => {
  it("removes only the share parameters", () => {
    expect(searchWithoutShare("?week=2026-11-16&share-url=x&share-text=y&share-title=z&view=week")).toBe(
      "?week=2026-11-16&view=week",
    );
    expect(searchWithoutShare("?share-text=y")).toBe("");
    expect(searchWithoutShare("")).toBe("");
  });

  it("detects share parameters", () => {
    expect(hasShareParams("?share-title=x")).toBe(true);
    expect(hasShareParams("?week=2026-11-16")).toBe(false);
  });
});

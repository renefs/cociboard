import { PUBLIC_FILES } from "../src/sw/shared.ts";

/** Public URLs of the built files the worker should precache (hashed bundle output + public files). */
export function precacheUrls(bundleFileNames: readonly string[]): string[] {
  const built = bundleFileNames
    .filter((name) => !name.endsWith(".map") && name !== "index.html" && name !== "sw.js")
    .map((name) => `/${name}`)
    .sort();
  return [...built, ...PUBLIC_FILES];
}

/** A small, stable 53-bit string hash (cyrb53); not cryptographic, only to name a release. */
export function hashString(input: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** Identifies a release: changes whenever the version, the asset list or the shell HTML does. */
export function buildId(version: string, urls: readonly string[], indexHtml: string): string {
  return hashString([version, ...urls, indexHtml].join("\n"));
}

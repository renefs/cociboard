// Android's share sheet opens the installed app at `/?share-title=...&share-text=...&share-url=...`
// (the `share_target` of manifest.webmanifest). Many apps put the link inside the text, e.g.
// "Great lentil stew https://example.com/stew".

export const SHARE_PARAMS = ["share-title", "share-text", "share-url"] as const;

const URL_IN_TEXT = /https?:\/\/[^\s<>"'`]+/i;
const TRAILING_PUNCTUATION = /[.,;:!?)\]}»”’]+$/;

/** The first http(s) link in `text`, without trailing punctuation; null when there is none. */
export function extractUrl(text: string): string | null {
  const match = URL_IN_TEXT.exec(text);
  if (!match) return null;
  const candidate = match[0].replace(TRAILING_PUNCTUATION, "");
  try {
    const parsed = new URL(candidate);
    return parsed.hostname === "" ? null : candidate;
  } catch {
    return null;
  }
}

/** The link shared with the app: `share-url` first, then a link inside `share-text`. */
export function sharedUrlFromSearch(search: string): string | null {
  const params = new URLSearchParams(search);
  return extractUrl(params.get("share-url") ?? "") ?? extractUrl(params.get("share-text") ?? "");
}

/** The query string without the share parameters; other parameters (`week`, `view`) stay. */
export function searchWithoutShare(search: string): string {
  const params = new URLSearchParams(search);
  for (const name of SHARE_PARAMS) params.delete(name);
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** Whether the address carries any share parameter. */
export function hasShareParams(search: string): boolean {
  const params = new URLSearchParams(search);
  return SHARE_PARAMS.some((name) => params.has(name));
}

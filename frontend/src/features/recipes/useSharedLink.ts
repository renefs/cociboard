import { useEffect, useState } from "react";
import { hasShareParams, searchWithoutShare, sharedUrlFromSearch } from "./shareTarget";

/**
 * The link shared with the app through the Android share sheet (`?share-url=` / `?share-text=`).
 * Read once on mount; the share parameters are then removed from the address bar (other
 * parameters such as `week` and `view` stay), so a reload does not import it again.
 */
export function useSharedLink(): string | null {
  const [link] = useState(() => sharedUrlFromSearch(window.location.search));
  useEffect(() => {
    const { pathname, search, hash } = window.location;
    if (hasShareParams(search)) {
      window.history.replaceState(window.history.state, "", `${pathname}${searchWithoutShare(search)}${hash}`);
    }
  }, []);
  return link;
}

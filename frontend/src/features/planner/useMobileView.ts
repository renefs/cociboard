import { useCallback, useEffect, useState } from "react";
import { searchForView, viewAfter, viewFromSearch, type MobileView, type ViewAction } from "./mobileView";

export interface MobileViewState {
  view: MobileView;
  setView: (view: MobileView) => void;
  /** Move to the view an action leads to. */
  go: (action: ViewAction) => void;
}

/**
 * The shown view on phones, kept in `?view=` with `replaceState`: switching tabs does not add
 * history entries (Back keeps leaving the app, or the previous week). Below the desktop width
 * only; on desktop the parameter is neither read into the layout nor written.
 */
export function useMobileView(narrow: boolean): MobileViewState {
  const [view, setViewState] = useState<MobileView>(() => viewFromSearch(window.location.search));

  useEffect(() => {
    const onPop = () => setViewState(viewFromSearch(window.location.search));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const setView = useCallback(
    (next: MobileView) => {
      setViewState(next);
      if (!narrow) return;
      const search = searchForView(window.location.search, next);
      if (search !== window.location.search) {
        window.history.replaceState(null, "", `${window.location.pathname}${search}${window.location.hash}`);
      }
    },
    [narrow],
  );

  const go = useCallback((action: ViewAction) => setView(viewAfter(action, view)), [setView, view]);

  return { view, setView, go };
}

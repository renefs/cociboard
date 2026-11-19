// Pure rules for the phone layout: which single view is shown below 900px and how it is
// kept in the URL (`?view=today|week|recipes|shopping`).

export const MOBILE_VIEWS = ["today", "week", "recipes", "shopping"] as const;
export type MobileView = (typeof MOBILE_VIEWS)[number];

/** The view a phone opens on: what are we eating today? */
export const DEFAULT_VIEW: MobileView = "today";

/** The layout is one view at a time below this width, in CSS px (the desktop grid starts at 900). */
export const NARROW_QUERY = "(max-width: 899px)";

export function isMobileView(value: string | null): value is MobileView {
  return value !== null && (MOBILE_VIEWS as readonly string[]).includes(value);
}

/** A `?view=` value, or `null` when it is missing or not a view. */
export function parseView(value: string | null): MobileView | null {
  return isMobileView(value) ? value : null;
}

/** The view for a URL query string; the default when the parameter is missing or invalid. */
export function viewFromSearch(search: string): MobileView {
  return parseView(new URLSearchParams(search).get("view")) ?? DEFAULT_VIEW;
}

/** The query string for `view`: other parameters are kept, the default view is implicit. */
export function searchForView(search: string, view: MobileView): string {
  const params = new URLSearchParams(search);
  if (view === DEFAULT_VIEW) params.delete("view");
  else params.set("view", view);
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** Things that move the user to another view. */
export type ViewAction =
  /** "Add" on a recipe starts select mode, which happens on the week. */
  | "start-select"
  /** Leaving select mode keeps the user where they are. */
  | "cancel-select"
  /** The Shopping list button of the toolbar. */
  | "open-shopping"
  /** "Plan the week" from an empty Today view. */
  | "plan-week";

/** The view an action leads to, given the current one. */
export function viewAfter(action: ViewAction, current: MobileView): MobileView {
  switch (action) {
    case "start-select":
    case "plan-week":
      return "week";
    case "open-shopping":
      return "shopping";
    case "cancel-select":
      return current;
  }
}

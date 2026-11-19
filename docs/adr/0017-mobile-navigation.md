# ADR-0017: Mobile navigation and the Today view

## Status
Accepted

## Context
Below 900px the planner stacked: the week (seven day cards with two slots each) first and the
recipe panel after it. Using **Add** on a recipe meant scrolling past the whole week and back,
there was no quick answer to "what are we eating today?", and the shopping list was a modal
opened from the toolbar, awkward in a supermarket.

## Decision
- **One view at a time below 900px**, switched with a fixed bottom **tab bar** (Today, Week,
  Recipes, Shopping). Tabs over a longer stacked page: each task (look at today, edit the
  week, pick recipes, shop) gets the full screen and no scrolling past the others, and the
  bar is reachable with a thumb. At 900px and above nothing changes: the recipe panel, week
  and dialogs stay on one screen.
- The breakpoint is the same 899/900px boundary the CSS uses; JavaScript reads it through a
  `useMediaQuery` hook (`NARROW_QUERY`), so tests mock `matchMedia`.
- **Today** reads the **real current week** (`now`), independent of the week being browsed,
  and tomorrow's day, which on a Sunday is Monday of the next week (a second, cached week
  query). It shows recipe, prep time, ingredients, special meal and note; tapping a recipe
  opens the existing details modal. Empty today offers "Plan the week" (to the Week tab).
- **URL**: the view is `?view=today|week|recipes|shopping`, next to `?week=`. It is written
  with `history.replaceState` so tab switches do not flood Back (week navigation still
  pushes). The default (`today`) is left out of the URL. On desktop the parameter is ignored
  and never written. Parsing and serialising live in the pure `mobileView.ts`.
- **Add** on a recipe starts select mode and switches to the Week tab, where the existing
  logic scrolls the first valid slot into view and the select banner stays. Cancelling stays
  on Week. The Week tab otherwise scrolls today's card into view (instantly with
  `prefers-reduced-motion`).
- **Inline shopping list**: the body of `ShoppingListDialog` became `ShoppingListView`,
  used by the dialog on desktop and by the Shopping tab (`inline`, no inner scroll box). The
  toolbar's Shopping list button switches to the tab on phones.
- **One DndContext**: Week and Recipes stay mounted and are hidden with `hidden`, so select
  mode, keyboard drag and optimistic plan state keep working across tabs; Today and Shopping
  are mounted only while active (no needless requests). Dropping on the hidden recipe panel
  is not possible on phones; tap and keyboard alternatives remain.
- **Accessibility**: the bar is a `<nav>` with `aria-current="page"`, 60px tall buttons with
  icon and label, visible focus, `env(safe-area-inset-bottom)`. Focus moves to the new view's
  `h2` on change; nothing else is announced. Toasts and page content get bottom space for the
  bar.

## Consequences
- Phones need a tap to see another part of the app instead of scrolling; the Week tab is no
  longer followed by the recipes.
- Hidden views stay in the DOM (Week, Recipes), a small cost for keeping state and drag and
  drop intact.
- Today makes up to two week requests of its own (current week, plus next week on Sundays).
- Changing the breakpoint means changing both the CSS media queries and `NARROW_QUERY`.

# ADR-0033: Recipe rows, a Filters panel and a calmer slot picker

## Status
Accepted

## Context
Phase 3 of the visual refresh (ADR-0031, ADR-0032). Each recipe in the panel was a bordered
card with up to twelve things on it: the name, a star, a drag handle, a big red "Add" button,
a meal-type badge, time, servings, protein with an emoji, a "this week" badge, the history,
a string of property emoji and an ingredient preview with "View all". Above the list were four
rows of chips (meal type, sort, favourites) and a "Properties" disclosure. The slot picker and
the phone's Today cards reused the same cards, so they were dense in the same way.

## Decision
- **One compact row** (`RecipeCard`, used by the panel, the phone Recipes view and the picker;
  the "comfortable" and "compact" densities are gone). Line 1 is the name (the button that
  opens the details) and the row's actions; line 2 is a muted meta line that wraps: the protein
  dot with its short name, the prep time, "Lunch only" / "Dinner only" when the meal type is not
  "both", and either "×N this week" (plain text, no longer an outlined pill) or the history
  ("Never planned", "Last made 5 weeks ago", in `--color-ok`). Property emoji, servings, the
  ingredient preview and "View all" are removed from the row and stay in the recipe details;
  search still matches ingredients. Rows sit in one container, separated by 1px lines, with
  `--color-surface-sunken` on hover; archived rows use the same look.
- **Row actions.** The star is a ghost Lucide icon button (filled when a favourite) before the
  action; its accessible names are unchanged. In the panel the action is a round 36px outline
  `+` button (44px on coarse pointers) with the name "Add {name} to the plan"; while the recipe
  is being placed it shows an X, is filled, and reads "Cancel ... to the plan", with
  `aria-pressed` as before. The drag handle is a Lucide grip, revealed on row hover or focus
  within for a mouse and always visible on touch (it used to be hidden there); it keeps its
  name. Rows are still draggable as a whole.
- **Short protein label.** `PROTEIN_META` gained `shortLabelKey`; only `none` differs
  ("No protein" / "Sin proteína"). Rows, Today cards and week slot cards use it (the slot
  card keeps the full label as its tooltip), so "No main protein" no longer wraps.
- **Filters.** Search (with an icon, on the sunken surface), then one row: a segmented
  control for All / Lunch / Dinner (same group name and `aria-pressed` buttons as before), a
  Favourites toggle chip and a **Filters** button. The button opens an inline disclosure panel
  (`aria-expanded`, `aria-controls`, Escape closes it and returns focus) with the sort (A–Z,
  Best for variety only when usage is known, Not made lately) and the property chips, which
  keep their emoji because they name filters, and a "Clear filters" link when something in the
  panel is active. A badge on the button counts the sort (when it is not A–Z) plus the selected
  properties (`activeFilterCount`, a pure function). The visible text is "Filters 2" and the
  name "Filters 2 active": a hidden "active" follows the number so the name contains the visible
  text (axe `label-content-name-mismatch`). The row wraps instead of scrolling, so Filters is
  never hidden off screen on a phone. Under the row, one muted line ("33 recipes · A–Z") is the
  only status region, so the count is announced once. "New recipe" is a secondary button in the
  panel head on desktop and primary on a phone.
- **Slot picker.** Same rows. The reason is a third line, in `--color-ok`, or in
  `--color-warning` with an `AlertTriangle` (`aria-hidden`; the old warning sign was hidden too)
  when negative. A good pick gets the `--color-ok-tint` background, a small "Good pick" tag after
  the name and a primary "Choose" button; other rows get an outline "Choose". "Choose {name}" is
  unchanged. The special meals stay as chips at the top.
- **Today cards.** The ingredient chips are replaced by the meta line (protein dot and short name,
  prep time, "7 ingredients"). The line is inside the button that opens the recipe, so its
  accessible name still holds everything the card shows (v0.28.4). There was no "change" action
  and none was added.

## Consequences
- A row shows what is needed to choose at a glance; servings, properties and ingredients need
  one click into the details. The Legend below the list still explains the property emoji.
- Sort and property filters are one click further away, in return for four rows less of chips.
  E2E specs and the user guide open the Filters panel first.
- When a recipe is planned this week the row shows "×N this week" instead of the history; the
  history is in the details.
- The grip is now visible on touch screens, where dragging starts by pressing and holding the
  row anyway; it costs a little width.
- New i18n keys: `recipes.filters`, `filtersActive`, `filtersPanel`, `resultsLine`, `mealOnly`,
  `ingredientCount` and `meta.proteinShort.none`; `recipes.propertiesSelected` is gone.

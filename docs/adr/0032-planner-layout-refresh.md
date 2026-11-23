# ADR-0032: Planner layout refresh: matrix grid, phone list, toolbar with a More menu

## Status
Accepted

## Context
Phase 1 of the visual refresh (ADR-0031) changed colours, font and chrome only. The planner
itself still looked like the first milestones: each day was a card holding two "slot wells",
each holding a recipe card (three nested boxes). Seven narrow columns hyphenated recipe names
("Judías ver-des") and every card carried four to eight emoji. On a phone each day was a large
card with two side-by-side wells, so one day filled the screen, and the toolbar (five equal
buttons) took half of it.

## Decision
- **Desktop grid as a flat matrix.** A narrow first column with the row labels (Sun *Lunch*,
  Moon *Dinner*), then seven day columns; rows are the day header, lunch and dinner. The
  DOM order is unchanged (day `<section>` with its `<h3>` and its two slots), so keyboard
  navigation, dnd ids and the accessible names stay as they were. Alignment comes from CSS
  grid: `.week-grid` has `auto repeat(7, minmax(0, 1fr))` columns and every day section spans
  three rows with `grid-template-rows: subgrid`. The row-label column is the first child,
  presentational and `aria-hidden` (each slot group already has a name such as "Monday
  lunch"); it loses its words and keeps the icons below 64rem of planner width.
- **One box per meal.** The day card and the slot well are gone. A filled slot is one card
  (surface, 1px border, 12px radius, light shadow); an empty one is a dashed outline with
  "+ Add lunch". The drag, select, blocked, pulse and highlight states are drawn on that same
  box, so they work for both. Today's header is a filled primary pill and today's cards use
  `--color-today`.
- **Icons out of the cards.** A card shows the name (in full: `hyphens: manual`, a break inside
  a word only as a last resort, three-line clamp, `title` kept) and one meta line: a protein
  dot, the protein name and the prep time. Meal-type and property emoji stay in the recipe
  details. The meta line sits next to the slot button, not in it, so the button's accessible
  name still begins with the visible name (WCAG 2.5.3); the button's `::after` stretches over
  the card, so the whole card is still the target. The variety warning is a Lucide
  `AlertTriangle` with the same accessible text; the remove button is a Lucide `X`, shown on
  hover or focus for a mouse (`(hover: hover) and (pointer: fine)`) and always on touch.
- **Protein colours.** `PROTEIN_META` gained a `darkColor` (as the meal types did in phase 1)
  and `proteinDotStyle` sets `--protein-color` / `--protein-color-dark` inline; the stylesheet
  picks one per scheme. `contrast.test.ts` requires at least 3:1 (non-text) on the surface,
  today, page and sunken colours in both themes.
- **Phone: a compact list.** Below 52rem of planner width (container query) each day is one row
  card: a 52px column with the abbreviated weekday and the day number (filled for today), and
  two stacked lines of at least 44px: Sun or Moon, the name (one or two lines), the protein
  dot. The same DOM is used; the full weekday and date stay for assistive technology and the
  abbreviation and number are `aria-hidden`. About four days fit under the toolbar.
- **Toolbar.** The "Weekly planner" `<h2>` stays for landmarks but is visually hidden. One row:
  the week navigation on the left; on the right "Fill the week" (the former *Suggest*,
  primary), "Shopping list", Share and a **More** button. More is a disclosure like the settings
  and share menus (`aria-expanded`, `aria-controls`, Escape and outside click close it, focus
  moves in and back, `clampShiftStart`) holding "Copy last week" and "Clear week", with the
  same disabled rules and the same confirm dialog. A disabled primary button goes flat and grey
  (sunken background, muted text) so it is not mistaken for a faded brand button. On a phone
  the navigation is one row (chevrons at the sides) and the actions a second one; Shopping list
  and Share shrink to icons and every control is at least 44px.
- **Variety summary.** The same button and panel, restyled as a quiet row: the score in the
  verdict colour (tabular numbers), the verdict text, a thin stacked bar of the week's proteins
  (segments sized by `proteinSegments`, `aria-hidden`: the counts are in the panel) and a
  chevron. It is its own full-width row above the grid; on a phone the verdict text is dropped.

## Consequences
- Names are readable at 1280px and wider; the matrix needs about 52rem of planner width, so
  between 900px and roughly 1190px (the recipe sidebar takes a quarter of the window) the
  planner shows the compact list, in one or two columns, instead of seven cramped columns.
  Nothing scrolls horizontally at 1024px.
- "Copy last week" and "Clear week" are one click further away; the E2E specs and the user
  guide open the More menu first (`openWeekActions`).
- The meta line lives outside the slot button, so a screen reader reads the protein and the
  prep time after the button on desktop; on phones they are visually hidden but still read.
- Subgrid and container-query range syntax need current browsers (Chrome 117, Safari 16,
  Firefox 71 / 118), which the PWA already assumes.
- Recipe emoji are still used by the recipe panel, filters and picker until phase 3.

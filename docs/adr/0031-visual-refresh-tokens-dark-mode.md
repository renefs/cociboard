# ADR-0031: Visual refresh: warm-neutral tokens, dark mode, Figtree, line icons

## Status
Accepted

## Context
The look dated from the first milestones: a cream page, a terracotta header with white
outlined buttons, emoji as interface icons and the system font. The header carried four
controls (household preferences, backup, language, log out) that are rarely used and crowded a
375px screen. There was no dark theme, and several colours were hard-coded in the stylesheets
and in `recipeMeta.ts`, so a second theme would have meant editing every file.

The refresh is planned in three phases, each shippable on its own and without behaviour
changes: phase 1 (this ADR) covers tokens, dark mode, the font, chrome icons and the header;
phase 2 will rework the planner grid layout; phase 3 the recipe cards, filters and picker.

## Decision
- **Tokens.** `styles/tokens.css` holds every colour: warm neutrals (page, surface, a
  "sunken" surface for slot wells, inputs and chips, two border strengths, text, muted text)
  with terracotta as the accent only, plus status colours (ok, danger, warning) and the
  variety verdict colours. Stylesheets use tokens only (print.css aside, which is for paper).
  Existing token names were kept as aliases (`--color-slot-bg`, `--color-chip-bg`, ...).
- **Dark theme.** The same tokens are redefined under
  `@media screen and (prefers-color-scheme: dark)` with `color-scheme: dark`. It follows the
  OS; there is no in-app toggle yet. It is screen-only, so printing always uses the light
  colours. The theme-color meta tags follow the scheme.
- **Meal-type badges** are the only recipe accent colours rendered. They carry a lighter
  `darkColor`; the stylesheet picks `--badge-color` or `--badge-color-dark` by scheme.
- **Contrast.** `contrast.test.ts` now reads `tokens.css` and checks WCAG AA in both themes
  (text, muted text and primary on every surface, status and verdict colours, accent colours),
  and the Playwright suite runs an axe scan in the dark scheme.
- **Font.** Figtree (`@fontsource-variable/figtree`, `wght.css`: the latin and latin-ext
  subsets, selected by `unicode-range`) is imported in `main.tsx`; Vite emits the woff2 files
  into `/assets`, so the service worker precaches them and the app looks the same offline.
- **Icons.** `lucide-react` provides the line icons of the interface chrome (tab bar, planner
  toolbar, week navigation, close buttons, prep time, settings). They are decorative
  (`aria-hidden`), take `currentColor`, and every control keeps its accessible name. Recipe
  metadata (food, protein and property emoji in `recipeMeta.ts`) stays as it is until phase 3.
- **Settings menu.** The header is light (surface, 1px border) with a brand mark and one
  settings button. It opens a disclosure panel, built like the share menu (`aria-expanded`,
  `aria-controls`, Escape and outside click close it, focus moves in and back, `clampShiftStart`
  keeps it on screen) with household preferences, backup, the language switcher (now a
  segmented control) and, when a password is set, log out. The panel is not `role="menu"`
  because it contains a button group.

## Consequences
- A new colour is added in one place with its dark value and is covered by the contrast test.
- Dark mode costs no JavaScript; a manual toggle can be added later by scoping the dark block
  to a `data-theme` attribute.
- The header is calmer and fits 375px, at the cost of one extra click to reach backup,
  preferences and the language switcher. The user guide and the E2E specs open the menu first.
- About 30 kB of font and a small icon dependency are added; both are bundled, so there are no
  runtime requests to third parties.
- Emoji recipe icons and the grid and card layouts still look the old way until phases 2 and 3.

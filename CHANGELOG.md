# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.5.1] - 2026-10-24

Fixes from [review 0001](docs/reviews/0001-v0.5.0-review.md).

### Fixed
- Plan requests of one week are now sent one at a time in call order (FIFO per week) while
  optimistic updates stay immediate, so quick consecutive changes no longer race and cause
  spurious 404/500 errors, rollbacks or flicker (review finding 1).
- A unique-constraint violation on a slot (for example a concurrent write from a second tab)
  in assign, move, suggest and replace now answers `409` ("The plan changed meanwhile; reload
  and try again") instead of 500, after rolling the session back. The UI shows the same
  message and refetches (review finding 2).
- `update_recipe` compares meal types with `!=` instead of `is not` (review finding 3).

## [0.5.0] - 2026-10-24

### Added
- Recipe management in the UI: **New recipe** and **Edit** in a validated form (name 1-80,
  meal type as a segmented control with icons, main protein select with icons, prep minutes,
  description, ingredient rows with add/remove, Enter-for-new-row and multi-line paste
  splitting, property toggle chips). Inline errors; a duplicate name (409) is shown on the
  name field and 422 responses are mapped to fields. The form is a full-screen sheet on phones.
- Recipe details modal (ingredients, description, labelled properties, prep time, protein)
  reachable from recipe cards and from a planned slot's **View details**, with **Edit** and
  **Delete**. Delete asks for confirmation and shows how many planned meals use the recipe.
- `GET /api/recipes/{id}/usage` returns `{ count }` of planned slots using a recipe.
- Changing a recipe's meal type so that it no longer fits planned slots answers `409` with a
  structured `detail` listing `{ week_start, day, slot }`; `PATCH ...?force=true` removes those
  planned meals and applies the change. The form lists the meals and offers "Remove them and save".
- Loading skeletons for the recipe list and week grid; offline/error states with **Retry**;
  empty states ("Clear filters" when nothing matches, "Add your first recipe" for an empty catalogue).
- ADR-0008 (recipe edits versus planned meals), README architecture diagram (Mermaid) and a
  "How to plan a week" guide.

### Changed
- Accessibility: toasts are announced through an always-mounted `aria-live` region, form
  controls have programmatic labels, errors and descriptions are linked with `aria-describedby`,
  focus is kept visible on every control (including the segmented meal type), placeholders and
  badge/accent colours were darkened to reach WCAG AA contrast (a unit test guards the palette),
  and animations (sheets, skeleton shimmer, smooth scrolling) honour `prefers-reduced-motion`.
- Modals render in a portal on `document.body`; forms do not close on a backdrop click so typed
  input is not lost by accident.
- `ApiError` carries the response `detail`; `updateRecipe` takes an optional `force` flag.

## [0.4.0] - 2026-10-24

### Added
- Variety analysis (`variety.py`, pure and unit-tested): repeated recipes (info for batch
  cooking), the same main protein in consecutive meals, one protein in more than four meals,
  too few vegetable-forward meals and too little fish. A 0-100 score (`null` for an empty
  plan). `GET /api/weeks/{week_start}/variety`, and `variety` in every week plan response.
- Suggestions (`suggest.py`): `POST /api/weeks/{week_start}/suggest` fills only empty slots
  with compatible recipes, greedily maximising the variety score and avoiding repeats
  (optional `seed` for repeatable results). `GET .../days/{day}/{slot}/candidates` ranks the
  compatible recipes with `score_delta`, a short `reason` and `good_pick`.
- `DELETE /api/weeks/{week_start}` clears a week; `PUT /api/weeks/{week_start}` replaces a
  week atomically (used by Undo).
- Week navigation in the planner header (previous, This week, next, date range), the week in
  the URL (`?week=YYYY-MM-DD`, Back and Forward work) and prefetching of neighbouring weeks.
- Toolbar with Suggest and Clear week (confirmation dialog); both offer Undo in a toast.
- Variety summary: colour-coded score badge, expandable issue list (click an issue to
  highlight its slots), warning markers with accessible text on affected slots and a
  per-protein count.
- Recipe panel: "×N this week" usage badges and a "Best for variety" sort.
- Tap-to-assign picker ranked by variety, with the reason as a hint and "Good pick" marks.
- `COCIBOARD_API_URL` overrides the API target of the Vite dev proxy.
- ADR-0007 (variety rules, scoring and suggestions).

### Changed
- Recipe names in slots no longer break mid-word: automatic hyphenation, three-line clamp and
  the full name as tooltip; in the seven-column grid the remove button moved above the name
  so names get the full column width.
- The planner header shows a compact date range ("26 Oct – 1 Nov 2026").
- The picker loads its recipes from the candidates endpoint instead of the full catalogue.

## [0.3.0] - 2026-10-24

### Added
- Weekly planner: a 7-day grid with lunch and dinner slots. Day columns on wide screens,
  a list of day cards on tablets and phones; today is highlighted.
- Drag and drop with @dnd-kit (mouse, press-and-hold touch and keyboard): drag recipes from
  the panel into slots, move or swap assigned recipes between slots, drop an assigned
  recipe on the recipe list to remove it. Compatible slots highlight; incompatible slots
  are dimmed with a "Not for lunch/dinner" hint and refuse the drop. Screen-reader
  announcements in English.
- Tap-to-assign: slot picker (bottom sheet on mobile, dialog on desktop) with search that
  lists only compatible recipes, actions for filled slots (Replace, Remove, View details)
  and a select mode started from a recipe's Add button.
- Compact recipe cards for the panel with a one-line ingredient summary that expands.
- Optimistic updates with rollback and an error message when saving fails.
- Backend: `MealAssignment` model, `week_start_for` and validation helpers, and
  `/api/weeks` routes (`current`, get, assign, clear, move/swap) with full tests. Deleting
  a recipe removes its assignments.
- ADR-0005 (planner interaction design) and ADR-0006 (week plan data model).

### Changed
- The recipe panel renders the compact card inside the planner; the app layout moved to a
  planner-first grid.
- Version bumped to 0.3.0.

## [0.2.0] - 2026-10-24

### Added
- Recipe domain: `MealType` (lunch, dinner, both), `MealSlot`, `Protein`, `RecipeProperty`
  and the pure, unit-tested `fits_slot` rule.
- SQLite persistence with SQLModel (JSON columns for ingredients and properties) and
  separate API schemas with validation.
- CRUD API under `/api/recipes` with `slot`, `q` and repeated `property` filters and
  404 / 409 / 422 handling.
- Idempotent seed of 24 Spanish/Mediterranean-friendly recipes, run on startup when the
  database is empty (`COCIBOARD_SEED_ON_STARTUP`) and via `make seed`.
- Frontend recipe panel: search, All / Lunch / Dinner chips, property filter, recipe cards
  with collapsible ingredients, labelled property icons and a legend.
- TanStack Query for data fetching; responsive layout with a recipe sidebar from 900px and a
  placeholder for the weekly planner.
- ADR-0003 (recipe data model) and ADR-0004 (TanStack Query and icons).

### Changed
- Version bumped to 0.2.0.

## [0.1.0] - 2026-10-24

### Added
- Monorepo scaffold with `backend/` (FastAPI, uv) and `frontend/` (React 18, TypeScript, Vite).
- `GET /api/health` endpoint returning status and version.
- Frontend app shell with header and a footer showing the backend version, with an offline fallback.
- Typed API client, design tokens (CSS custom properties) and a mobile-first layout.
- Tooling: ruff, mypy (strict), pytest, ESLint, `tsc --noEmit` (strict), Vitest.
- Makefile (`install`, `dev`, `test`, `lint`, `typecheck`, `check-version`, `check`).
- README, ADR-0001 (tech stack) and ADR-0002 (versioning and change log).

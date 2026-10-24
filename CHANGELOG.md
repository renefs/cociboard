# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

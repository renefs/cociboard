# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

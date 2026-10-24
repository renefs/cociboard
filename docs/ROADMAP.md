# Cociboard Roadmap

Cociboard is a web app for planning varied weekly menus from a personal recipe list.
A weekly grid (Monday–Sunday) has two slots per day — **lunch** and **dinner** — and
recipes are dragged (or tapped, on touch devices) from the recipe area into the slots.

This roadmap was written in the planning phase. Each milestone ships as one commit
with a version bump and a CHANGELOG entry.

## Milestones

### v0.1.0 — Project scaffold
- Monorepo layout: `backend/` (FastAPI) and `frontend/` (React + TypeScript + Vite).
- Tooling: uv, ruff, mypy (strict), pytest; npm, ESLint, `tsc --noEmit` (strict), Vitest.
- `GET /api/health` returns status and version; the frontend shows the app shell and
  fetches the health endpoint through the Vite dev proxy.
- Docs: README, CHANGELOG, CLAUDE.md conventions, ADR-0001 (tech stack), ADR-0002
  (versioning and change log), Makefile with `dev`, `test`, `lint`, `typecheck`.

### v0.2.0 — Recipes
- Recipe domain: name, meal type (`lunch` / `dinner` / `both`), ingredients,
  properties (e.g. vegetarian, vegan, gluten-free, quick, spicy), main protein
  (for variety analysis), optional prep time.
- SQLite persistence (SQLModel), CRUD API under `/api/recipes`, idempotent seed with
  ~24 varied recipes covering every meal type.
- Frontend recipe panel: cards with name, meal-type badge, ingredient list and
  property icons with accessible labels/tooltips; search and meal-type filters.

### v0.3.0 — Weekly planner with drag and drop
- Weekly grid, 7 days × {lunch, dinner}; responsive (columns on desktop, stacked day
  cards on mobile).
- Drag and drop with @dnd-kit (mouse, touch and keyboard sensors).
- Tap-to-assign alternative: select a recipe, then tap a slot (and slot → picker).
- Slot compatibility: dinner-only recipes cannot go into lunch slots and vice versa;
  incompatible slots are visibly disabled during a drag.
- Week plans persisted per ISO week under `/api/weeks/{week_start}`; move between
  slots, remove from a slot.

### v0.4.0 — Variety and week management
- Variety analysis (backend, unit-tested): repeated recipes in the week, same main
  protein on consecutive meals, too many of one protein; a variety score.
- UI: inline warnings on affected slots, a variety summary, recipe usage counts in
  the recipe panel.
- Week navigation (previous / next / this week), clear week, "suggest" auto-fill of
  empty slots that maximises variety.

### v0.5.0 — Recipe management and polish
- Create / edit / delete recipes from the UI (validated forms).
- Accessibility pass (focus states, ARIA, contrast), empty and error states,
  loading states, final docs. Review fixes from the planning/review model.

## Model usage
- Planning and review: Opus.
- Development: Sonnet (one subagent per milestone).

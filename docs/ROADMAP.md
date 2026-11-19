# Cociboard Roadmap

Cociboard is a web app for planning varied weekly menus from a personal recipe list.
A weekly grid (Monday–Sunday) has two slots per day — **lunch** and **dinner** — and
recipes are dragged (or tapped, on touch devices) from the recipe area into the slots.

This roadmap was written in the planning phase (v0.1.0–v0.5.0); the later milestones
were added as they shipped. Each milestone ships as one commit with a version bump and a
CHANGELOG entry.

## Milestones

### v0.1.0 — Project scaffold (done)
- Monorepo layout: `backend/` (FastAPI) and `frontend/` (React + TypeScript + Vite).
- Tooling: uv, ruff, mypy (strict), pytest; npm, ESLint, `tsc --noEmit` (strict), Vitest.
- `GET /api/health` returns status and version; the frontend shows the app shell and
  fetches the health endpoint through the Vite dev proxy.
- Docs: README, CHANGELOG, CLAUDE.md conventions, ADR-0001 (tech stack), ADR-0002
  (versioning and change log), Makefile with `dev`, `test`, `lint`, `typecheck`.

### v0.2.0 — Recipes (done)
- Recipe domain: name, meal type (`lunch` / `dinner` / `both`), ingredients,
  properties (e.g. vegetarian, vegan, gluten-free, quick, spicy), main protein
  (for variety analysis), optional prep time.
- SQLite persistence (SQLModel), CRUD API under `/api/recipes`, idempotent seed with
  ~24 varied recipes covering every meal type.
- Frontend recipe panel: cards with name, meal-type badge, ingredient list and
  property icons with accessible labels/tooltips; search and meal-type filters.

### v0.3.0 — Weekly planner with drag and drop (done)
- Weekly grid, 7 days × {lunch, dinner}; responsive (columns on desktop, stacked day
  cards on mobile).
- Drag and drop with @dnd-kit (mouse, touch and keyboard sensors).
- Tap-to-assign alternative: select a recipe, then tap a slot (and slot → picker).
- Slot compatibility: dinner-only recipes cannot go into lunch slots and vice versa;
  incompatible slots are visibly disabled during a drag.
- Week plans persisted per ISO week under `/api/weeks/{week_start}`; move between
  slots, remove from a slot.

### v0.4.0 — Variety and week management (done)
- Variety analysis (backend, unit-tested): repeated recipes in the week, same main
  protein on consecutive meals, too many of one protein; a variety score.
- UI: inline warnings on affected slots, a variety summary, recipe usage counts in
  the recipe panel.
- Week navigation (previous / next / this week), clear week, "suggest" auto-fill of
  empty slots that maximises variety.

### v0.5.0 — Recipe management and polish (done)
- Create / edit / delete recipes from the UI (validated forms).
- Accessibility pass (focus states, ARIA, contrast), empty and error states,
  loading states, final docs. Review fixes from the planning/review model.
- v0.5.1: plan requests are sent one at a time per week, and concurrent writes to
  the same slot are handled.

### v0.6.0 — Spanish interface (done)
- English and Spain Spanish UI with react-i18next and typed catalogues (a missing key
  is a compile error); recipe content is not translated (ADR-0009).
- Language detection (saved choice, then browser languages, then English) and an
  EN | ES | Auto switcher in the header.
- Locale-aware dates and weekday names; translated announcements, toasts and
  validation messages; proper plural rules.
- The backend sends codes and params (variety issues, suggestion reasons) instead of
  localised text.
- `AGENTS.md` with the conventions for AI coding agents.
- Patch releases: lifespan type annotation fix (v0.6.1); new seed recipes, bringing
  the catalogue to 33 (v0.6.2–v0.6.4); accent-insensitive recipe search (v0.6.5).

### v0.7.0 — Docker deployment (done)
- One multi-stage, multi-arch (amd64/arm64) image: the backend serves the built
  frontend through `COCIBOARD_STATIC_DIR`, with a health check (ADR-0010).
- `docker-compose.yml` with a `./data` volume for SQLite and settings from `.env`
  (port, `PUID`/`PGID`, time zone, seeding on startup).
- An entrypoint that makes `/data` writable and drops root, so NAS-owned bind mounts
  (e.g. Synology) work; README deployment steps, including Synology.

### v0.8.0 — Prebuilt image on GitHub Container Registry (done)
- GitHub Actions workflow that builds the image for amd64 and arm64 and pushes it to
  the private `ghcr.io/renefs/cociboard` package (`main`, version tags, `latest`,
  `sha-<commit>`) (ADR-0011).
- `docker-compose.ghcr.yml` runs the prebuilt image; `COCIBOARD_TAG` picks the tag.
- README steps for logging in to ghcr.io, updating, and running on Synology.

### v0.9.0 — Shopping list (done)
- Ingredients of the week's planned meals, merged by case/accent-folded name, shown in a
  dialog with the recipes that use each one (ADR-0012).
- Ticking items off (shared across devices), manual extra items, uncheck all, copy and
  share as plain text.
- Ideas for later: a "from today" filter, pantry staples, categories/aisles.

### v0.10.0 — Schema migrations (done)
- Alembic migrations inside the package, run automatically on start (ADR-0013):
  `0001_initial` (v0.8.0 schema) and `0002_shopping_list` (idempotent).
- Databases created before migrations existed (v0.8.0, v0.9.0) are stamped and upgraded.
- Automatic backup next to the SQLite file before changing existing data (last 3 kept).
- `make migrate` and `make migration m="..."`; a test fails when models and migrations differ.

### v0.11.0 — Archived recipes and backups (done)
- Archive instead of delete: archived recipes leave the catalogue and suggestions but stay in
  the weeks where they were planned; restore from the **Archived (N)** list (ADR-0014).
- Delete confirmation explains the impact on past weeks and recommends archiving.
- Backup dialog in the header: download everything as JSON, restore from a file (replace-all in
  one transaction, validated first, server-side `pre-restore` copy).

### v0.12.0 — Planning across weeks (done)
- Variety and suggestions see the two previous weeks: Monday-lunch protein boundary warning,
  score-neutral "planned recently" tips, suggestions that avoid recent recipes (ADR-0015).
- **Copy last week** fills the empty slots from the previous week, skipping archived recipes.

## Model usage
- Planning and review: Opus.
- Development: Sonnet (one subagent per milestone).

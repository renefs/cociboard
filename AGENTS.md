# AGENTS.md

Instructions for AI coding agents working on Cociboard. Humans should start with
`README.md`; this file is the short, binding version for agents.

Cociboard is a weekly menu planner. A Monday–Sunday grid has a lunch and a dinner slot
per day; recipes are dragged (or tapped) from the recipe panel into the slots, and a
variety analysis helps keep the week varied. Scope and history: `docs/ROADMAP.md`,
`CHANGELOG.md`, `docs/adr/`.

## Ground rules
- Code, comments, commits and docs are in **English**. The app UI is bilingual (English and
  Spanish); see the i18n rule under Code conventions.
- Work in small steps: write each file as soon as it is designed and run the relevant
  tests before moving on. Don't draft a whole feature before touching the disk.
- Don't push, rewrite history or move existing tags unless the user asks.
- Ports 8000 (backend) and 5173 (frontend) may be in use by someone's dev servers. Don't
  kill them; run your own on other ports, e.g. backend on 8765 and
  `COCIBOARD_API_URL=http://localhost:8765 npm run dev -- --port 5199` for the frontend.
  Use a throwaway database (`COCIBOARD_DATABASE_URL=sqlite:////tmp/x.db`) and delete it
  afterwards.

## Setup and commands
Run from the repository root:

| Command | What it does |
|---|---|
| `make install` | `uv sync` (backend, Python 3.12) and `npm install` (frontend) |
| `make dev` | Backend on :8000 with reload, Vite on :5173 proxying `/api` |
| `make seed` | Add the seed recipes to the database (idempotent) |
| `make lint` | ruff check + ruff format --check, ESLint |
| `make typecheck` | mypy --strict, `tsc --noEmit` |
| `make test` | pytest, vitest run |
| `make check-version` | Verify the version matches in every file that holds it |
| `make check` | All of the above. **Must pass before any commit.** |

Single tests: `cd backend && uv run pytest tests/test_weeks_api.py -k move` or
`cd frontend && npx vitest run src/features/planner/dragLogic.test.ts`.
To fix formatting: `cd backend && uv run ruff format .`.

## Layout
- `backend/src/cociboard/`
  - `domain.py`: enums (`MealType`, `MealSlot`, `Protein`, `RecipeProperty`) and pure
    rules such as `fits_slot` and week date helpers
  - `variety.py`, `suggest.py`: pure variety scoring and suggestion logic
  - `models.py`: SQLModel tables; `schemas.py`: Pydantic API schemas (kept separate)
  - `repository.py` (recipes), `planner.py` (week plans): persistence and rules
  - `routers/`: thin FastAPI routes that translate domain errors to HTTP status codes
  - `seed.py`: starter recipes
- `backend/tests/`: pytest, with an in-memory SQLite fixture in `conftest.py`
- `frontend/src/`
  - `api/`: `client.ts` (typed fetch) and `types.ts` (mirrors `schemas.py`)
  - `i18n/`: i18next setup, language switcher, `locales/en.ts` and `es.ts`
  - `features/recipes/`, `features/planner/`, `features/variety/`: components, hooks
    and pure logic modules, with tests alongside (`*.test.ts(x)`)
  - `styles/tokens.css`: design tokens (colours must stay WCAG AA; `contrast.test.ts`
    checks them)
- `Dockerfile`, `docker-compose.yml`, `docker/entrypoint.sh`: production deployment (one
  image; the backend serves `frontend/dist` via `COCIBOARD_STATIC_DIR`, ADR-0010)
- `docs/adr/`: decision records; `docs/reviews/`: code reviews

## Code conventions
- Fully typed. mypy strict and TypeScript strict; no `Any` without a reason, no
  `@ts-ignore`, no `# type: ignore` without a comment.
- Business rules live in pure, unit-tested functions (`domain.py`, `variety.py`,
  `suggest.py`, `dragLogic.ts`, `planTransforms.ts`, …), never inside route handlers or
  components.
- When an API schema changes, update `frontend/src/api/types.ts` and the README API
  table in the same change.
- Data fetching uses TanStack Query. Plan changes are optimistic, and their requests are
  sent one at a time per week (`useWeekPlan.ts`); keep both properties.
- Recipe icons and labels come from the single map in `recipeMeta.ts` (icon plus a `labelKey`
  into the catalogue); every icon needs an accessible label.
- **No hard-coded user-visible strings** (text, `aria-label`, `title`, placeholders, toasts,
  announcements). Add every key to `frontend/src/i18n/locales/en.ts` **and** `es.ts` (a
  missing key is a compile error), write whole sentences per key (slot-specific sentences get
  `lunch` / `dinner` variants), use `_one` / `_other` for plurals and `<Trans>` for markup.
  Pure modules that return text take a `t` (`TFunction`) and, for dates, a `locale`; format
  dates and weekday names only through the locale-aware `weekMath.ts` helpers. Recipe
  content is data and is never translated. The backend sends codes and params, not
  localised text (ADR-0009). Spanish is Spain Spanish ("comida", "cena").
- Match the surrounding code's style, naming and comment density.

## UX requirements
- Usability comes first. Every feature must work on a 375px touch screen and on a
  desktop.
- Drag and drop always has an alternative: tap-to-assign / select mode and the keyboard.
- Accessibility: semantic HTML, visible focus, `aria-live` for announcements, and
  respect for `prefers-reduced-motion`.
- Check UI changes in a real browser at 1440px and 375px when you can, and say so when
  you couldn't.

## Testing
- Add or update tests with every change: backend endpoints and rules in pytest, and
  frontend pure logic plus component behaviour in Vitest with React Testing Library.
- jsdom can't simulate dnd-kit pointer drags reliably, so test drag behaviour through
  the pure `resolveDrop` / `handleDragEnd` functions.

## Versions, change log and commits
- SemVer. The version is in `VERSION`, `backend/pyproject.toml`,
  `backend/src/cociboard/__init__.py`, `frontend/package.json`,
  `frontend/package-lock.json`, `backend/uv.lock` and the README's "Current version"
  line. Bump all of them together, then run `make check-version`.
- macOS: `sed -i` needs an empty suffix argument (`sed -i '' ...`).
- Each milestone or fix:
  1. bump the version (minor for features, patch for fixes);
  2. add a `CHANGELOG.md` entry (Keep a Changelog format);
  3. add an ADR in `docs/adr/NNNN-title.md` (Status, Context, Decision, Consequences)
     for any significant technical or design decision;
  4. make **one** commit, `feat: <summary> (vX.Y.Z)` or `fix: <summary> (vX.Y.Z)`,
     with a body listing the changes;
  5. tag it `vX.Y.Z`.
- Don't commit `.claude/`, databases (`*.db`), `node_modules/`, `.venv/` or `dist/`.

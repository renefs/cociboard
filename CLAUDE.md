# Cociboard — project conventions

Weekly menu planner. Read `docs/ROADMAP.md` for scope and milestones.

## Language
All code, comments, commit messages and documentation are in **English**.

## Layout
- `backend/` — FastAPI app, Python 3.12, managed with `uv`. Package `cociboard` under
  `backend/src/cociboard/`, tests under `backend/tests/`.
- `frontend/` — React 18 + TypeScript (strict) + Vite. Tests next to code
  (`*.test.ts(x)`) using Vitest + React Testing Library.
- `docs/` — `ROADMAP.md`, `adr/NNNN-title.md` (Architecture/Design Decision Records).

## Quality gates (all must pass before a milestone commit)
- `make lint` — ruff (backend), ESLint (frontend)
- `make typecheck` — mypy --strict (backend), `tsc --noEmit` (frontend)
- `make test` — pytest (backend), vitest run (frontend)

## Practices
- Fully typed: no `Any` without justification, no `// @ts-ignore`.
- API schemas are Pydantic models; frontend mirrors them in `src/api/types.ts`.
- Business rules (meal compatibility, variety analysis) live in pure, unit-tested
  functions, not in route handlers or components.
- Mobile first: every feature must work on a 375px-wide touch screen and on desktop.
  Drag and drop always has a tap/keyboard alternative.
- Accessible: semantic HTML, labels for icons, visible focus.

## Versioning and change log
- SemVer. The version lives in `VERSION` (root) and must match
  `backend/pyproject.toml` and `frontend/package.json`. `make check-version` verifies it.
- Every milestone: bump version, add a `CHANGELOG.md` entry (Keep a Changelog format),
  add an ADR for any significant technical or design decision, then make **one**
  descriptive commit: `feat: <summary> (vX.Y.Z)` with a body listing the changes,
  and tag it `vX.Y.Z`.

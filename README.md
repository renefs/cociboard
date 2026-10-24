# Cociboard

A web app for planning varied weekly menus from a personal recipe list. A weekly grid
(Monday–Sunday) has a lunch and a dinner slot per day; recipes are dragged (or tapped,
on touch devices) into the slots. See [docs/ROADMAP.md](docs/ROADMAP.md) for scope.

Current version: **0.1.0** (project scaffold).

## Stack

- Backend: Python 3.12, FastAPI, pydantic-settings, managed with [uv](https://docs.astral.sh/uv/)
- Frontend: React 18, TypeScript (strict), Vite, plain CSS with design tokens
- Quality: ruff, mypy (strict), pytest; ESLint, `tsc --noEmit`, Vitest + Testing Library

Rationale: [docs/adr/0001-tech-stack.md](docs/adr/0001-tech-stack.md).

## Setup

Requirements: `uv`, Node.js 20+ and npm, `make`.

```sh
make install
```

uv fetches Python 3.12 automatically (see `backend/.python-version`).

## Commands

| Command | Description |
| --- | --- |
| `make install` | Install backend and frontend dependencies |
| `make dev` | Run backend (`:8000`, uvicorn `--reload`) and frontend (`:5173`, Vite) together; Vite proxies `/api` to the backend. Ctrl+C stops both |
| `make test` | pytest and vitest |
| `make lint` | ruff and ESLint |
| `make typecheck` | mypy --strict and `tsc --noEmit` |
| `make check-version` | Verify `VERSION`, `backend/pyproject.toml` and `frontend/package.json` agree |
| `make check` | All gates above |

Open http://localhost:5173 after `make dev`. Configuration of the backend is via
`COCIBOARD_*` environment variables (e.g. `COCIBOARD_DATABASE_URL`).

## Project structure

```
VERSION                 single source of the release version
Makefile
backend/
  pyproject.toml
  src/cociboard/        FastAPI app (main.py), settings (config.py), schemas
  tests/
frontend/
  src/api/              typed API client and types mirroring backend schemas
  src/styles/           design tokens and global CSS
  src/App.tsx           app shell
docs/
  ROADMAP.md
  adr/                  architecture decision records
CHANGELOG.md
CLAUDE.md               project conventions
```

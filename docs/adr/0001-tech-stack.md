# ADR-0001: Tech stack

## Status
Accepted

## Context
Cociboard is a small, single-user weekly menu planner with a rich, touch-friendly
drag-and-drop UI and a modest data model (recipes, week plans). It needs a typed API,
simple persistence, fast iteration and good test tooling. It must work on a 375px touch
screen as well as on desktop.

## Decision
- Backend: **FastAPI** with Pydantic models, **SQLModel on SQLite** for persistence
  (introduced in v0.2.0), managed with **uv**, linted with ruff, type-checked with mypy
  strict, tested with pytest.
- Frontend: **React 18 + TypeScript (strict) + Vite**, plain CSS with custom properties,
  tested with **Vitest** and React Testing Library.
- Drag and drop: **@dnd-kit** (planned for v0.3.0) for its mouse, touch and keyboard
  sensors.
- Vite dev server proxies `/api` to the backend, so the frontend uses same-origin URLs.

Alternatives considered:
- **Flask**: mature, but no built-in request/response validation or OpenAPI; FastAPI gives
  typed schemas that the frontend types can mirror.
- **Next.js**: SSR and routing are unnecessary for a client-rendered single-page tool and
  would add a Node runtime to deployment.
- **react-beautiful-dnd**: deprecated and weak touch/keyboard story; @dnd-kit is
  maintained and supports multiple sensors.

## Consequences
- Two toolchains (Python and Node) to maintain; a Makefile wraps them behind common targets.
- Pydantic schemas and `src/api/types.ts` must be kept in sync manually.
- SQLite keeps deployment trivial but limits concurrent writers, which is acceptable here.

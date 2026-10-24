# ADR-0002: Versioning and change log

## Status
Accepted

## Context
The project ships in small milestones, each of which should be traceable, reproducible
and documented. Version numbers appear in several places (backend package, frontend
package, API health response) and can drift apart.

## Decision
- Use **Semantic Versioning**. The root `VERSION` file is the reference.
- `backend/pyproject.toml`, `backend/src/cociboard/__init__.py` (`__version__`) and
  `frontend/package.json` must equal `VERSION`; `make check-version` enforces this and is
  part of `make check`. A backend test also asserts that package metadata equals `__version__`.
- Keep `CHANGELOG.md` in **Keep a Changelog** format.
- Each milestone is exactly one commit, `feat: <summary> (vX.Y.Z)`, with a descriptive
  body, tagged `vX.Y.Z`. Significant decisions get an ADR in `docs/adr/`.

## Consequences
- Bumping a version means editing four places; the check fails loudly if one is missed.
- A linear history of one commit per milestone makes releases easy to review and revert.
- `GET /api/health` reports the version actually running, useful for diagnosing
  mismatched frontend and backend deployments.

# ADR-0010: Docker Compose deployment

## Status
Accepted

## Context
Cociboard ran only from the development setup (`make dev`: uvicorn plus the Vite dev
server). It should be easy to self-host on a home server, in particular a Synology NAS
with Container Manager, and on any other machine with Docker Compose. Constraints from
those hosts:
- Synology models are x86-64 or ARM64, and building on the NAS itself is the simplest
  path (no registry to publish to).
- Container Manager creates a "project" from a folder containing `docker-compose.yml`.
  Older DSM versions ship an older `docker-compose`, so the file must stay plain.
- Bind-mounted folders on a NAS belong to a NAS user (Synology uids start at 1026, group
  `users` is 100), not to the uid baked into an image.
- The planner decides "today" and the current week with `date.today()`, so the server's
  time zone matters.

## Decision
- **One image, one service.** A multi-stage `Dockerfile`: `node:22-bookworm-slim` builds
  `frontend/dist`; `python:3.12-slim-bookworm` with uv installs the locked backend
  dependencies (`uv sync --frozen --no-dev`); the runtime stage copies the virtualenv and
  the built frontend. FastAPI serves the frontend from `COCIBOARD_STATIC_DIR` with
  `StaticFiles(html=True)`, mounted after the API router. Same origin, so no CORS and no
  reverse proxy inside the stack. All base images are multi-arch.
- **SQLite in a bind mount.** `./data:/data` next to the compose file, so it is visible
  in File Station and easy to back up. No named volumes, no database service.
- **PUID/PGID.** The entrypoint starts as root, `chown`s `/data` to `PUID:PGID` and
  `exec`s the server through `setpriv` (util-linux, already in the base image) as that
  user. Running with `user:` skips the step.
- **Plain compose file.** No `version:` key and no recent-only features (`develop`,
  `include`, profiles); the health check lives in the `Dockerfile`. Settings come from an
  optional `.env` with defaults in the compose file. `tzdata` is installed and `TZ` is a
  setting.
- uvicorn runs with `--proxy-headers` so the app works behind DSM's reverse proxy.

## Consequences
- `docker compose up -d --build` (or Container Manager → Project → Create) is the whole
  deployment, on amd64 and arm64.
- Building on the NAS takes a few minutes (npm install and frontend build). Publishing a
  prebuilt image to a registry would remove that, but needs a registry and CI; left for
  later.
- One uvicorn process with SQLite: fine for a household, not for many concurrent users.
- The image does not run tests or lint; `make check` remains the gate before a release.

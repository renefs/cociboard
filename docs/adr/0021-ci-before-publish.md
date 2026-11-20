# ADR-0021: CI before publish

## Status
Accepted

## Context
Until now the only workflow built and pushed the image to ghcr.io on every push to `main`
and on version tags (ADR-0011). Nothing ran the test suite, so a broken commit, a stale
lock file or a tag that did not match `VERSION` could still produce a published image that
a NAS then pulls. The Docker build itself only proves that the frontend compiles and the
dependencies install, not that the app starts.

## Decision
- **`ci.yml`** runs `make check` (version consistency, lint, type checks, tests) on Ubuntu
  with Python 3.12 (`backend/.python-version`), uv 0.11.7 (the version the Dockerfile uses)
  and Node 22. `uv sync --locked` and `npm ci` fail when a lock file is stale. It runs on
  pull requests, on pushes to branches other than `main`, manually, and as a reusable
  workflow (`workflow_call`). `TZ=UTC` and `LANG=C.UTF-8` mimic a bare runner so tests that
  depend on the developer's locale show up. Runs are cancelled when a newer one starts on
  the same ref, except on `main`.
- **`docker-publish.yml`** calls `ci.yml` as its first job, and `publish` has
  `needs: check`, so a failing check never publishes. `main` and tags get CI through this
  call only, so it does not run twice.
- On tag pushes the publish job fails unless the tag equals `v$(cat VERSION)`.
- **Container smoke test** before pushing: the amd64 image is built and loaded, started
  with a throwaway volume, and must answer `/api/health` (bounded wait) with the expected
  version and serve the frontend at `/`. The multi-arch build that follows reuses the same
  gha layer cache. Logs are printed when it fails.
- `make check-version` (via `scripts/check-version.sh`) now also checks both version
  fields of `frontend/package-lock.json`, the `cociboard` entry of `backend/uv.lock` and the
  README "Current version" line.
- Dependabot proposes weekly, grouped updates for GitHub Actions, npm, uv and the Docker
  base images.
- Permissions are least privilege: `contents: read` everywhere, `packages: write` only on
  the publish job.

## Consequences
- A red check or a broken container blocks publishing; the cost is a few minutes more per
  release build.
- Only the amd64 image is smoke tested; arm64 shares the same Dockerfile and the Python and
  Node layers are multi-arch, so this is accepted rather than running under emulation.
- Actions are pinned to major versions, not commit SHAs; Dependabot keeps them current.
- Branch protection (requiring the `CI` check on pull requests) is a repository setting and
  is not configured by this change.

## Amendment (v0.18.1)
The first Dependabot pull requests showed that CI never built the image: a bump to
`python:3.15-slim-bookworm` (the backend requires Python `<3.14`) and one to `node:26`
passed the checks. Changes:
- **`ci.yml` has an `image` job**, parallel to `check`, that builds the amd64 image
  (`load: true`, no push) and runs `scripts/smoke-test.sh`. The smoke test moved out of
  `docker-publish.yml` into that script (`CONTAINER_ENGINE` selects docker or podman), so
  pull requests and releases run the same check. The publish job needs the whole called
  workflow, so it still cannot run when the image job fails. Both builds use the default gha
  cache scope, so the publish build reuses the layers.
- **Dependabot policy:** the Docker `python` image ignores versions `>=3.14` (tied to
  `requires-python`), and `node` ignores semver-major updates (done by hand, following the
  LTS line); patch and minor updates still come. For npm and uv, minor and patch updates
  are grouped in one pull request and each major is its own pull request, so a breaking
  major (an `ERESOLVE` failure, say) cannot block the safe updates.

## Alternatives considered
- **One workflow with `workflow_run`:** the publish workflow would trigger after CI
  finishes. It runs in the context of the default branch, gets awkward for tags and makes
  the link between a commit and its image indirect. A reusable workflow with `needs` is
  explicit and shows in one run.
- **Running the checks inside the Docker build:** keeps one place, but dev dependencies,
  test tooling and lock-file checks would bloat the build, and failures would be less
  readable than in a dedicated job.
- **Smoke test with `docker compose`:** heavier than a single `docker run`, and compose
  needs an env file; the container check is the part that matters.

## Update (ADR-0028)
The called workflow gained an `e2e` job (Playwright, Chromium). `publish` still `needs: check`,
and `check` is the job that calls `ci.yml`, so it succeeds only when every job of the called
workflow does: the E2E tests are part of the gate for publishing, next to `make check` and the
container smoke test.

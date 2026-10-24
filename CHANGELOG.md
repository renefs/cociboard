# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-10-24

### Added
- Monorepo scaffold with `backend/` (FastAPI, uv) and `frontend/` (React 18, TypeScript, Vite).
- `GET /api/health` endpoint returning status and version.
- Frontend app shell with header and a footer showing the backend version, with an offline fallback.
- Typed API client, design tokens (CSS custom properties) and a mobile-first layout.
- Tooling: ruff, mypy (strict), pytest, ESLint, `tsc --noEmit` (strict), Vitest.
- Makefile (`install`, `dev`, `test`, `lint`, `typecheck`, `check-version`, `check`).
- README, ADR-0001 (tech stack) and ADR-0002 (versioning and change log).

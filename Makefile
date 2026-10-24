.PHONY: install dev seed test lint typecheck check-version check

VERSION := $(shell cat VERSION)

install:
	cd backend && uv sync
	cd frontend && npm install

# Runs backend (http://localhost:8000) and frontend (http://localhost:5173) together.
# The Vite dev server proxies /api to the backend. Ctrl+C stops both.
dev:
	@trap 'kill 0' INT TERM EXIT; \
	(cd backend && uv run uvicorn cociboard.main:app --reload --port 8000) & \
	(cd frontend && npm run dev) & \
	wait

# Top up the recipe catalogue with the seed recipes (idempotent).
seed:
	cd backend && uv run python -m cociboard.seed

test:
	cd backend && uv run pytest
	cd frontend && npm test

lint:
	cd backend && uv run ruff check . && uv run ruff format --check .
	cd frontend && npm run lint

typecheck:
	cd backend && uv run mypy src tests
	cd frontend && npm run typecheck

check-version:
	@py=$$(sed -n 's/^version = "\(.*\)"/\1/p' backend/pyproject.toml | head -1); \
	js=$$(node -p "require('./frontend/package.json').version"); \
	init=$$(sed -n 's/^__version__ = "\(.*\)"/\1/p' backend/src/cociboard/__init__.py); \
	echo "VERSION=$(VERSION) pyproject=$$py package.json=$$js __init__=$$init"; \
	if [ "$(VERSION)" != "$$py" ] || [ "$(VERSION)" != "$$js" ] || [ "$(VERSION)" != "$$init" ]; then \
		echo "Version mismatch" >&2; exit 1; \
	fi

check: check-version lint typecheck test

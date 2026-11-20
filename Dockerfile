# syntax=docker/dockerfile:1
# Single image: the FastAPI backend serves the API at /api and the built frontend at /.
# Base images are multi-arch, so this builds on amd64 and arm64 hosts (Synology included).

# --- Frontend build ---------------------------------------------------------------
# The output is static files, so this stage runs on the build machine's platform even
# in a cross-platform build (no emulated npm install).
FROM --platform=$BUILDPLATFORM node:22-bookworm-slim AS frontend
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# --- Backend dependencies -----------------------------------------------------------
FROM python:3.15-slim-bookworm AS backend
COPY --from=ghcr.io/astral-sh/uv:0.11.7 /uv /bin/uv
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never
WORKDIR /app
COPY backend/pyproject.toml backend/uv.lock backend/.python-version ./
RUN uv sync --frozen --no-dev --no-install-project
COPY backend/src ./src
RUN uv sync --frozen --no-dev --no-editable

# --- Runtime --------------------------------------------------------------------------
FROM python:3.15-slim-bookworm
RUN apt-get update \
    && apt-get install -y --no-install-recommends tzdata \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=backend /app/.venv /app/.venv
COPY --from=frontend /src/frontend/dist /app/static
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod 0755 /usr/local/bin/entrypoint.sh && mkdir -p /data

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PUID=1000 \
    PGID=1000 \
    TZ=Etc/UTC \
    COCIBOARD_DATABASE_URL=sqlite:////data/cociboard.db \
    COCIBOARD_STATIC_DIR=/app/static \
    COCIBOARD_CORS_ORIGINS=[]

VOLUME ["/data"]
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=4)"]

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["uvicorn", "cociboard.main:app", "--host", "0.0.0.0", "--port", "8000", \
     "--proxy-headers", "--forwarded-allow-ips", "*"]

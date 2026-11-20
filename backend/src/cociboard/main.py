"""FastAPI application factory."""

import asyncio
import logging
import mimetypes
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager, suppress

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlmodel import Session
from starlette.responses import Response
from starlette.types import Scope

from cociboard import __version__
from cociboard.auth import build_auth_state
from cociboard.auth_middleware import AuthMiddleware
from cociboard.autobackup import AutoBackupService, BackupState
from cociboard.config import Settings, get_settings
from cociboard.db import get_engine, init_db
from cociboard.recipe_import.fetch import ImportLimiter
from cociboard.routers import auth, backup, pantry, recipes, shopping, weeks
from cociboard.schemas import HealthResponse
from cociboard.seed import seed_if_empty

# Python's table may not know the web app manifest type (it depends on the platform).
mimetypes.add_type("application/manifest+json", ".webmanifest")

# Files the browser must revalidate on every load, or a new release would not be noticed.
REVALIDATE_PATHS = {"", ".", "index.html", "sw.js", "manifest.webmanifest"}

router = APIRouter(prefix="/api")
router.include_router(auth.router)
router.include_router(recipes.router)
router.include_router(weeks.router)
router.include_router(shopping.router)
router.include_router(pantry.router)
router.include_router(backup.router)


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    """Report service status and version."""
    return HealthResponse(status="ok", version=__version__)


class FrontendFiles(StaticFiles):
    """Serves the built frontend with cache headers suited to a PWA.

    The shell, the service worker and the manifest are always revalidated (``no-cache``),
    while content-hashed ``assets/*`` never change and may be cached for a year.
    """

    async def get_response(self, path: str, scope: Scope) -> Response:
        response = await super().get_response(path, scope)
        if response.status_code == 200:
            if path in REVALIDATE_PATHS:
                response.headers["Cache-Control"] = "no-cache"
            elif path.startswith("assets/"):
                response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        return response


def configure_logging() -> None:
    """Show the app's own INFO logs (migrations, backups) next to uvicorn's.

    Uvicorn only configures its own loggers, so without a handler the ``cociboard``
    loggers would print warnings and errors only. Does nothing if a handler is set.
    """
    logger = logging.getLogger("cociboard")
    if logger.handlers:
        return
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(levelname)s:     %(name)s: %(message)s"))
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Migrate and check the database, seed an empty one, run the automatic backups."""
    configure_logging()
    init_db()
    settings = get_settings()
    if settings.seed_on_startup:
        with Session(get_engine()) as session:
            seed_if_empty(session)
    service = AutoBackupService(get_engine(), settings, app.state.backup_state)
    task = asyncio.create_task(service.run_forever()) if service.enabled else None
    try:
        yield
    finally:
        if task is not None:
            task.cancel()
            with suppress(asyncio.CancelledError):
                await task


def create_app(settings: Settings | None = None) -> FastAPI:
    """Build the FastAPI application."""
    settings = settings or get_settings()
    app = FastAPI(title="Cociboard", version=__version__, lifespan=lifespan)
    app.state.auth = build_auth_state(settings)
    app.state.backup_state = BackupState()
    app.state.import_limiter = ImportLimiter()
    if app.state.auth is not None:
        # Added before CORS so CORS is outermost and 401/403 answers carry its headers.
        app.add_middleware(AuthMiddleware, auth=app.state.auth, cors_origins=settings.cors_origins)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(router)
    if settings.static_dir is not None:
        # Mounted after the API so /api routes take precedence; serves index.html at /.
        app.mount("/", FrontendFiles(directory=settings.static_dir, html=True), name="static")
    return app


app = create_app()

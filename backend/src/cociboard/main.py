"""FastAPI application factory."""

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlmodel import Session

from cociboard import __version__
from cociboard.config import Settings, get_settings
from cociboard.db import get_engine, init_db
from cociboard.routers import recipes, weeks
from cociboard.schemas import HealthResponse
from cociboard.seed import seed_if_empty

router = APIRouter(prefix="/api")
router.include_router(recipes.router)
router.include_router(weeks.router)


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    """Report service status and version."""
    return HealthResponse(status="ok", version=__version__)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncGenerator[None, None]:
    """Create tables and optionally seed an empty database."""
    init_db()
    if get_settings().seed_on_startup:
        with Session(get_engine()) as session:
            seed_if_empty(session)
    yield


def create_app(settings: Settings | None = None) -> FastAPI:
    """Build the FastAPI application."""
    settings = settings or get_settings()
    app = FastAPI(title="Cociboard", version=__version__, lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(router)
    if settings.static_dir is not None:
        # Mounted after the API so /api routes take precedence; serves index.html at /.
        app.mount("/", StaticFiles(directory=settings.static_dir, html=True), name="static")
    return app


app = create_app()

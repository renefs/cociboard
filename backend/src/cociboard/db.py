"""Database engine, session dependency and schema initialisation."""

from collections.abc import Iterator
from functools import lru_cache

from sqlalchemy import Engine
from sqlmodel import Session, SQLModel, create_engine

from cociboard import models  # noqa: F401  (registers tables on the metadata)
from cociboard.config import get_settings


@lru_cache
def get_engine() -> Engine:
    """Return the process-wide engine built from settings."""
    url = get_settings().database_url
    connect_args = {"check_same_thread": False} if url.startswith("sqlite") else {}
    return create_engine(url, connect_args=connect_args)


def init_db(engine: Engine | None = None) -> None:
    """Create all tables if they do not exist."""
    SQLModel.metadata.create_all(engine or get_engine())


def get_session() -> Iterator[Session]:
    """FastAPI dependency yielding a session bound to the engine."""
    with Session(get_engine()) as session:
        yield session

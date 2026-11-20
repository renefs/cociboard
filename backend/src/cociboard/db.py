"""Database engine, session dependency and schema migration."""

from collections.abc import Iterator
from functools import lru_cache
from typing import Any

from sqlalchemy import Engine, event
from sqlmodel import Session, create_engine

from cociboard import models  # noqa: F401  (registers tables on the metadata)
from cociboard.config import get_settings
from cociboard.integrity import run_integrity_check
from cociboard.migrate import run_migrations


def enable_sqlite_foreign_keys(engine: Engine) -> None:
    """Enforce foreign keys on every new SQLite connection (SQLite ignores them by default).

    The pragma is per connection and a no-op inside a transaction, so it is issued as soon as
    the connection opens. Does nothing for other databases.
    """
    if engine.url.get_backend_name() != "sqlite":
        return

    @event.listens_for(engine, "connect")
    def _foreign_keys_on(
        dbapi_connection: Any,  # DBAPI connections are untyped
        _record: object,
    ) -> None:
        cursor = dbapi_connection.cursor()
        try:
            cursor.execute("PRAGMA foreign_keys=ON")
        finally:
            cursor.close()


@lru_cache
def get_engine() -> Engine:
    """Return the process-wide engine built from settings."""
    url = get_settings().database_url
    connect_args = {"check_same_thread": False} if url.startswith("sqlite") else {}
    engine = create_engine(url, connect_args=connect_args)
    enable_sqlite_foreign_keys(engine)
    return engine


def init_db(engine: Engine | None = None) -> None:
    """Bring the schema up to date, then check the data (see ``integrity``)."""
    engine = engine or get_engine()
    run_migrations(engine)
    run_integrity_check(engine)


def get_session() -> Iterator[Session]:
    """FastAPI dependency yielding a session bound to the engine."""
    with Session(get_engine()) as session:
        yield session

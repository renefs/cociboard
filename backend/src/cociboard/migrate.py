"""Run Alembic migrations on startup, with a safety backup of existing SQLite files."""

import logging
import sqlite3
from datetime import UTC, datetime
from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import Engine, inspect

logger = logging.getLogger("cociboard.migrate")

BASELINE_REVISION = "0001_initial"
CORE_TABLES = frozenset({"recipe", "mealassignment"})
KNOWN_TABLES = CORE_TABLES | {"shoppingcheck", "shoppingextra"}
BACKUPS_KEPT = 3


class MigrationError(RuntimeError):
    """The database is in a state the migrations cannot safely handle."""


def _config() -> Config:
    config = Config()
    config.set_main_option("script_location", "cociboard:migrations")
    return config


def _sqlite_file(engine: Engine) -> Path | None:
    """Path of the SQLite database file, or None for other or in-memory databases."""
    url = engine.url
    if url.get_backend_name() != "sqlite" or url.database in (None, "", ":memory:"):
        return None
    if url.database.startswith("file:"):
        return None
    return Path(url.database)


def _backup(engine: Engine, path: Path, label: str) -> Path:
    """Copy the database with the SQLite online backup API and prune old backups."""
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    target = path.with_name(f"{path.name}.bak-{label}-{stamp}")
    source = sqlite3.connect(path)
    try:
        dest = sqlite3.connect(target)
        try:
            source.backup(dest)
        finally:
            dest.close()
    finally:
        source.close()
    logger.info("Backed up database to %s", target)
    # Timestamps sort lexicographically; the label can differ, so sort by mtime then name.
    backups = sorted(
        path.parent.glob(f"{path.name}.bak-*"), key=lambda p: (p.stat().st_mtime_ns, p.name)
    )
    for old in backups[:-BACKUPS_KEPT]:
        old.unlink()
        logger.info("Removed old backup %s", old)
    return target


def run_migrations(engine: Engine) -> None:
    """Bring the database behind ``engine`` to the latest schema revision.

    Empty databases are created from scratch; databases made by ``create_all`` before
    migrations existed (v0.8.0 and v0.9.0) are stamped as the baseline and upgraded.
    A file-based SQLite database with data is backed up first when changes are pending.
    """
    config = _config()
    head = ScriptDirectory.from_config(config).get_current_head()

    with engine.connect() as connection:
        tables = set(inspect(connection).get_table_names())
        current = MigrationContext.configure(connection).get_current_revision()

    legacy = current is None and bool(tables - {"alembic_version"})
    if legacy:
        missing = CORE_TABLES - tables
        unexpected = tables - KNOWN_TABLES - {"alembic_version"}
        if missing or unexpected:
            raise MigrationError(
                "Database has tables but no migration history, and does not look like a "
                f"Cociboard database (missing: {sorted(missing)}, "
                f"unexpected: {sorted(unexpected)}). Refusing to migrate it."
            )

    if current == head:
        logger.info("Database schema is up to date (revision %s)", head)
        return

    path = _sqlite_file(engine)
    if path is not None and tables:
        _backup(engine, path, "legacy" if legacy else str(current))

    with engine.connect() as connection:
        config.attributes["connection"] = connection
        if legacy:
            logger.info("Existing unversioned database: stamping %s", BASELINE_REVISION)
            command.stamp(config, BASELINE_REVISION)
        command.upgrade(config, "head")
        connection.commit()
    logger.info("Database migrated from %s to %s", current or "none", head)

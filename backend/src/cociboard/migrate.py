"""Run Alembic migrations on startup, with a safety backup of existing SQLite files."""

import logging

from alembic import command
from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import Engine, inspect

from cociboard.dbfiles import backup_sqlite, sqlite_file

logger = logging.getLogger("cociboard.migrate")

BASELINE_REVISION = "0001_initial"
CORE_TABLES = frozenset({"recipe", "mealassignment"})
KNOWN_TABLES = CORE_TABLES | {"shoppingcheck", "shoppingextra"}


class MigrationError(RuntimeError):
    """The database is in a state the migrations cannot safely handle."""


def _config() -> Config:
    config = Config()
    config.set_main_option("script_location", "cociboard:migrations")
    return config


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

    if sqlite_file(engine) is not None and tables:
        backup_sqlite(engine, "legacy" if legacy else str(current))

    with engine.connect() as connection:
        config.attributes["connection"] = connection
        if legacy:
            logger.info("Existing unversioned database: stamping %s", BASELINE_REVISION)
            command.stamp(config, BASELINE_REVISION)
        command.upgrade(config, "head")
        connection.commit()
    logger.info("Database migrated from %s to %s", current or "none", head)

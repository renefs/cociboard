"""Run Alembic migrations on startup, with a safety backup of existing SQLite files."""

import logging

from alembic import command
from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import Connection, Engine, inspect

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


def _set_foreign_keys(connection: Connection, on: bool) -> None:
    """Switch the SQLite foreign key pragma; only effective outside a transaction."""
    connection.commit()
    connection.exec_driver_sql(f"PRAGMA foreign_keys={'ON' if on else 'OFF'}")
    connection.commit()


def _foreign_keys_enabled(connection: Connection) -> bool:
    row = connection.exec_driver_sql("PRAGMA foreign_keys").fetchone()
    connection.rollback()
    return bool(row and row[0])


def _restore_foreign_keys(connection: Connection, was_on: bool) -> None:
    """Put the pragma back as it was (on for the app's engine), or drop the connection.

    A connection left with enforcement off would go back into the pool and silently disable
    foreign keys for the app. If the state cannot be verified, invalidate the connection so
    the pool opens a fresh one (which the ``connect`` listener sets up).
    """
    try:
        connection.rollback()
        _set_foreign_keys(connection, was_on)
        if _foreign_keys_enabled(connection) != was_on:
            raise RuntimeError("could not restore the foreign key setting")
    except Exception:
        logger.exception("Could not restore the foreign key setting; discarding the connection")
        connection.invalidate()


def _warn_foreign_key_violations(connection: Connection) -> None:
    violations = connection.exec_driver_sql("PRAGMA foreign_key_check").fetchall()
    connection.rollback()
    if violations:
        logger.warning(
            "foreign_key_check found %d violation(s) after the migration; "
            "the integrity check at startup deals with them",
            len(violations),
        )


def run_migrations(engine: Engine) -> None:
    """Bring the database behind ``engine`` to the latest schema revision.

    Empty databases are created from scratch; databases made by ``create_all`` before
    migrations existed (v0.8.0 and v0.9.0) are stamped as the baseline and upgraded.
    A file-based SQLite database with data is backed up first when changes are pending.

    On SQLite the migration runs with ``PRAGMA foreign_keys=OFF`` (batch operations recreate
    tables, which enforced keys would break; Alembic's guidance), set before any transaction
    starts on the connection. Afterwards ``foreign_key_check`` reports violations and the
    pragma is switched back on for that pooled connection.
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

    is_sqlite = engine.url.get_backend_name() == "sqlite"
    with engine.connect() as connection:
        was_on = False
        if is_sqlite:
            was_on = _foreign_keys_enabled(connection)
            _set_foreign_keys(connection, False)
        try:
            config.attributes["connection"] = connection
            if legacy:
                logger.info("Existing unversioned database: stamping %s", BASELINE_REVISION)
                command.stamp(config, BASELINE_REVISION)
            command.upgrade(config, "head")
            connection.commit()
            if is_sqlite:
                _warn_foreign_key_violations(connection)
        finally:
            if is_sqlite:
                _restore_foreign_keys(connection, was_on)
    logger.info("Database migrated from %s to %s", current or "none", head)

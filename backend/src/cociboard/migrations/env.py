"""Alembic environment: wires the Cociboard models and database URL into migrations.

Used both by the ``alembic`` CLI (URL from settings) and programmatically by
``cociboard.migrate`` (an open connection passed through ``config.attributes``).
"""

from logging.config import fileConfig

from alembic import context
from sqlalchemy import Connection, create_engine
from sqlmodel import SQLModel

from cociboard import models  # noqa: F401  (registers tables on the metadata)
from cociboard.config import get_settings

config = context.config
if config.config_file_name is not None and "connection" not in config.attributes:
    fileConfig(config.config_file_name, disable_existing_loggers=False)

target_metadata = SQLModel.metadata


def _url() -> str:
    return config.get_main_option("sqlalchemy.url") or get_settings().database_url


def _configure(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        render_as_batch=True,  # SQLite cannot ALTER most things in place
        compare_type=True,
    )


def run_migrations_offline() -> None:
    """Emit SQL to stdout without a database connection."""
    context.configure(
        url=_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        render_as_batch=True,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run against the given connection, or open one from the configured URL."""
    existing: Connection | None = config.attributes.get("connection")
    if existing is not None:
        _configure(existing)
        with context.begin_transaction():
            context.run_migrations()
        return
    engine = create_engine(_url())
    try:
        with engine.connect() as connection:
            _configure(connection)
            with context.begin_transaction():
                context.run_migrations()
            connection.commit()
    finally:
        engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()

"""Schema migrations: fresh, legacy (v0.8.0 / v0.9.0) and versioned databases."""

import os
import sqlite3
from pathlib import Path

import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import Engine, create_engine, inspect, text
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel

from cociboard import models  # noqa: F401  (registers tables on the metadata)
from cociboard.migrate import MigrationError, run_migrations

V08_SCHEMA = """
CREATE TABLE recipe (
    id INTEGER NOT NULL, name VARCHAR(80) NOT NULL, description VARCHAR,
    meal_type VARCHAR(6) NOT NULL, protein VARCHAR(7) NOT NULL, prep_minutes INTEGER,
    ingredients JSON NOT NULL, properties JSON NOT NULL, created_at DATETIME NOT NULL,
    PRIMARY KEY (id)
);
CREATE UNIQUE INDEX ix_recipe_name ON recipe (name);
CREATE TABLE mealassignment (
    id INTEGER NOT NULL, week_start DATE NOT NULL, day INTEGER NOT NULL,
    slot VARCHAR(6) NOT NULL, recipe_id INTEGER NOT NULL, PRIMARY KEY (id),
    CONSTRAINT uq_week_day_slot UNIQUE (week_start, day, slot),
    FOREIGN KEY(recipe_id) REFERENCES recipe (id)
);
CREATE INDEX ix_mealassignment_recipe_id ON mealassignment (recipe_id);
CREATE INDEX ix_mealassignment_week_start ON mealassignment (week_start);
INSERT INTO recipe (id, name, meal_type, protein, ingredients, properties, created_at)
    VALUES (1, 'Lentils', 'lunch', 'legumes', '["lentils"]', '[]', '2026-01-01 00:00:00');
INSERT INTO mealassignment (id, week_start, day, slot, recipe_id)
    VALUES (1, '2026-11-16', 0, 'lunch', 1);
"""


def _engine(path: Path) -> Engine:
    return create_engine(f"sqlite:///{path}")


def _head() -> str | None:
    config = Config()
    config.set_main_option("script_location", "cociboard:migrations")
    return ScriptDirectory.from_config(config).get_current_head()


def _version(engine: Engine) -> str | None:
    with engine.connect() as conn:
        return MigrationContext.configure(conn).get_current_revision()


def _backups(path: Path) -> list[Path]:
    return sorted(path.parent.glob(f"{path.name}.bak-*"))


def _count(path: Path | Engine, table: str) -> int:
    engine = path if isinstance(path, Engine) else _engine(path)
    with engine.connect() as conn:
        return int(conn.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar_one())


def _diff(engine: Engine) -> list[object]:
    with engine.connect() as conn:
        ctx = MigrationContext.configure(conn, opts={"compare_type": True})
        return list(compare_metadata(ctx, SQLModel.metadata))


def test_fresh_database_matches_models(tmp_path: Path) -> None:
    db = tmp_path / "fresh.db"
    engine = _engine(db)
    run_migrations(engine)
    assert _version(engine) == _head()
    assert _diff(engine) == []
    assert _backups(db) == []  # empty database: nothing to back up


def test_v08_database_is_migrated_and_backed_up(tmp_path: Path) -> None:
    db = tmp_path / "v08.db"
    raw = sqlite3.connect(db)
    raw.executescript(V08_SCHEMA)
    raw.commit()
    raw.close()

    engine = _engine(db)
    run_migrations(engine)

    assert _version(engine) == _head()
    assert _count(engine, "recipe") == 1
    assert _count(engine, "mealassignment") == 1
    assert {"shoppingcheck", "shoppingextra"} <= set(inspect(engine).get_table_names())
    assert _diff(engine) == []

    backups = _backups(db)
    assert len(backups) == 1
    assert ".bak-legacy-" in backups[0].name
    backup = sqlite3.connect(backups[0])
    try:
        assert backup.execute("SELECT name FROM recipe").fetchall() == [("Lentils",)]
        names = {r[0] for r in backup.execute("SELECT name FROM sqlite_master")}
        assert "shoppingcheck" not in names
    finally:
        backup.close()


def test_v09_database_is_stamped_and_upgraded(tmp_path: Path) -> None:
    db = tmp_path / "v09.db"
    engine = _engine(db)
    SQLModel.metadata.create_all(engine)
    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO shoppingextra (week_start, name, checked, created_at) "
                "VALUES ('2026-11-16', 'Milk', 0, '2026-11-19 10:00:00')"
            )
        )

    run_migrations(engine)

    assert _version(engine) == _head()
    assert _count(engine, "shoppingextra") == 1
    assert _diff(engine) == []
    assert len(_backups(db)) == 1


def test_second_run_is_a_noop(tmp_path: Path) -> None:
    db = tmp_path / "twice.db"
    raw = sqlite3.connect(db)
    raw.executescript(V08_SCHEMA)
    raw.commit()
    raw.close()
    engine = _engine(db)
    run_migrations(engine)
    before = _backups(db)

    run_migrations(engine)

    assert _backups(db) == before
    assert _version(engine) == _head()


def test_backup_rotation_keeps_three(tmp_path: Path) -> None:
    db = tmp_path / "rot.db"
    raw = sqlite3.connect(db)
    raw.executescript(V08_SCHEMA)
    raw.commit()
    raw.close()
    for i in range(4):
        old = tmp_path / f"rot.db.bak-legacy-2026010{i + 1}T000000Z"
        old.write_bytes(b"old")
        mtime = 1_700_000_000 + i
        os.utime(old, (mtime, mtime))

    run_migrations(_engine(db))

    backups = _backups(db)
    assert len(backups) == 3
    assert not (tmp_path / "rot.db.bak-legacy-20260101T000000Z").exists()
    assert not (tmp_path / "rot.db.bak-legacy-20260102T000000Z").exists()


def test_in_memory_database_is_migrated_without_backup() -> None:
    # A single shared connection keeps the in-memory database alive between calls.
    engine = create_engine("sqlite://", poolclass=StaticPool)
    run_migrations(engine)
    assert _version(engine) == _head()


def test_unknown_database_is_refused(tmp_path: Path) -> None:
    db = tmp_path / "other.db"
    raw = sqlite3.connect(db)
    raw.execute("CREATE TABLE something_else (id INTEGER)")
    raw.commit()
    raw.close()
    with pytest.raises(MigrationError):
        run_migrations(_engine(db))
    assert _backups(db) == []


def test_downgrade_to_base_and_upgrade_again(tmp_path: Path) -> None:
    engine = _engine(tmp_path / "down.db")
    run_migrations(engine)
    config = Config()
    config.set_main_option("script_location", "cociboard:migrations")
    with engine.connect() as conn:
        config.attributes["connection"] = conn
        command.downgrade(config, "base")
        conn.commit()
    assert set(inspect(engine).get_table_names()) <= {"alembic_version"}

    run_migrations(engine)
    assert _version(engine) == _head()
    assert _diff(engine) == []


def test_configure_logging_shows_info_once() -> None:
    import logging

    from cociboard.main import configure_logging

    logger = logging.getLogger("cociboard")
    saved_handlers, saved_level = list(logger.handlers), logger.level
    logger.handlers.clear()
    try:
        configure_logging()
        configure_logging()
        assert len(logger.handlers) == 1
        assert logging.getLogger("cociboard.migrate").isEnabledFor(logging.INFO)
    finally:
        logger.handlers[:] = saved_handlers
        logger.setLevel(saved_level)


def test_v010_database_gains_archived_at(tmp_path: Path) -> None:
    db = tmp_path / "v010.db"
    engine = _engine(db)
    config = Config()
    config.set_main_option("script_location", "cociboard:migrations")
    with engine.connect() as conn:
        config.attributes["connection"] = conn
        command.upgrade(config, "0002_shopping_list")
        conn.commit()
    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO recipe (name, meal_type, protein, ingredients, properties, "
                "created_at) VALUES ('Lentils', 'lunch', 'legumes', '[\"x\"]', '[]', "
                "'2026-01-01 00:00:00')"
            )
        )
    assert "archived_at" not in {c["name"] for c in inspect(engine).get_columns("recipe")}

    run_migrations(engine)

    assert _version(engine) == _head()
    assert _diff(engine) == []
    with engine.connect() as conn:
        archived = conn.execute(text("SELECT archived_at FROM recipe")).scalar_one()
    assert archived is None
    assert len(_backups(db)) == 1

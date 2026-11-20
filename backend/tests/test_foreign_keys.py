"""Enforced foreign keys (ADR-0022): listener, API flows, migrations, startup check."""

import json
import logging
import sqlite3
from datetime import date
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock

import pytest
from alembic import command
from fastapi.testclient import TestClient
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, select

from cociboard.db import enable_sqlite_foreign_keys
from cociboard.domain import MealSlot, MealType, Protein
from cociboard.integrity import (
    FkViolation,
    plan_integrity_fix,
    quick_check_ok,
    run_integrity_check,
)
from cociboard.migrate import run_migrations
from cociboard.models import MealAssignment, Recipe

MONDAY = "2026-10-26"


def _pragma(engine: Engine) -> int:
    with engine.connect() as conn:
        return int(conn.exec_driver_sql("PRAGMA foreign_keys").scalar_one())


def _file_engine(path: Path) -> Engine:
    engine = create_engine(f"sqlite:///{path}")
    enable_sqlite_foreign_keys(engine)
    return engine


def make(client: TestClient, name: str) -> int:
    r = client.post(
        "/api/recipes",
        json={
            "name": name,
            "meal_type": "both",
            "protein": "fish",
            "ingredients": ["Sal"],
            "properties": [],
        },
    )
    assert r.status_code == 201, r.text
    return int(r.json()["id"])


def put(client: TestClient, day: int, slot: str, recipe_id: int) -> None:
    r = client.put(f"/api/weeks/{MONDAY}/days/{day}/{slot}", json={"recipe_id": recipe_id})
    assert r.status_code == 200, r.text


def test_listener_turns_foreign_keys_on(tmp_path: Path) -> None:
    assert _pragma(_file_engine(tmp_path / "a.db")) == 1
    assert _pragma(create_engine(f"sqlite:///{tmp_path / 'b.db'}")) == 0  # SQLite's default


def test_listener_ignores_other_backends() -> None:
    engine = MagicMock()
    engine.url.get_backend_name.return_value = "postgresql"
    enable_sqlite_foreign_keys(engine)
    engine.assert_not_called()


def test_assignment_with_missing_recipe_fails_at_the_database(session: Session) -> None:
    session.add(
        MealAssignment(week_start=date(2026, 10, 26), day=0, slot=MealSlot.lunch, recipe_id=999)
    )
    with pytest.raises(IntegrityError):
        session.commit()
    session.rollback()


def test_delete_planned_recipe_with_foreign_keys_on(client: TestClient, session: Session) -> None:
    a, b = make(client, "A"), make(client, "B")
    put(client, 0, "lunch", a)
    put(client, 1, "lunch", a)
    put(client, 0, "dinner", b)
    assert client.get(f"/api/recipes/{a}/usage").json()["count"] == 2

    assert client.delete(f"/api/recipes/{a}").status_code == 204

    assert [m.recipe_id for m in session.exec(select(MealAssignment))] == [b]


def test_archive_replace_copy_and_shopping_with_foreign_keys_on(client: TestClient) -> None:
    a, b = make(client, "A"), make(client, "B")
    put(client, 0, "lunch", a)
    put(client, 0, "dinner", b)
    assert client.patch(f"/api/recipes/{a}", json={"archived": True}).status_code == 200
    slots = [
        {"day": 2, "slot": "lunch", "recipe_id": b},
        {"day": 3, "slot": "dinner", "special": "eating_out"},
    ]
    assert client.put(f"/api/weeks/{MONDAY}", json={"slots": slots}).status_code == 200
    assert (
        client.post("/api/weeks/2026-11-02/copy", json={"from_week_start": MONDAY}).status_code
        == 200
    )
    base = f"/api/weeks/{MONDAY}/shopping-list"
    assert client.put(f"{base}/checks", json={"key": "sal", "checked": True}).status_code == 200
    assert client.post(f"{base}/extras", json={"name": "Pan"}).status_code == 201
    assert client.delete(f"/api/weeks/{MONDAY}").status_code == 200
    assert client.delete(f"/api/recipes/{b}").status_code == 204


def test_restore_with_foreign_keys_on(client: TestClient, session: Session) -> None:
    a = make(client, "Alpha")
    put(client, 0, "lunch", a)
    doc = client.get("/api/backup").json()
    make(client, "Extra")
    put(client, 1, "lunch", a)

    r = client.post("/api/backup/restore", content=json.dumps(doc))

    assert r.status_code == 200, r.text
    assert [x.name for x in session.exec(select(Recipe))] == ["Alpha"]
    assert len(session.exec(select(MealAssignment)).all()) == 1


def test_migrations_run_with_foreign_keys_off_and_restore_them(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    engine = _file_engine(tmp_path / "m.db")
    seen: list[int] = []
    real_upgrade = command.upgrade

    def spy(config: Any, revision: str) -> None:
        connection = config.attributes["connection"]
        seen.append(int(connection.exec_driver_sql("PRAGMA foreign_keys").scalar_one()))
        connection.rollback()
        real_upgrade(config, revision)

    monkeypatch.setattr(command, "upgrade", spy)

    run_migrations(engine)

    assert seen == [0]
    assert _pragma(engine) == 1
    assert _pragma(engine) == 1  # and still on for the next pooled connection


def test_failed_migration_does_not_leak_foreign_keys_off(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    engine = _file_engine(tmp_path / "m.db")

    def boom(config: Any, revision: str) -> None:
        raise RuntimeError("boom")

    monkeypatch.setattr(command, "upgrade", boom)
    with pytest.raises(RuntimeError):
        run_migrations(engine)
    assert _pragma(engine) == 1


def test_migrations_on_in_memory_engine_keep_the_pooled_connection() -> None:
    engine = create_engine("sqlite://", poolclass=StaticPool)
    enable_sqlite_foreign_keys(engine)
    run_migrations(engine)
    assert _pragma(engine) == 1
    with engine.connect() as conn:  # the in-memory database is still there
        assert conn.execute(text("SELECT count(*) FROM recipe")).scalar_one() == 0


def test_plan_integrity_fix_splits_orphans_from_the_rest() -> None:
    plan = plan_integrity_fix(
        [
            FkViolation("mealassignment", 3, "recipe", 0),
            FkViolation("mealassignment", 1, "recipe", 0),
            FkViolation("mealassignment", 3, "recipe", 0),
            FkViolation("shoppingcheck", 2, "recipe", 0),
            FkViolation("mealassignment", 4, "other", 0),
            FkViolation("mealassignment", None, "recipe", 0),
        ]
    )
    assert plan.orphan_rowids == (1, 3)
    assert [(v.table, v.parent) for v in plan.unexpected] == [
        ("shoppingcheck", "recipe"),
        ("mealassignment", "other"),
        ("mealassignment", "recipe"),
    ]
    assert plan_integrity_fix([]).orphan_rowids == ()


def test_quick_check_ok() -> None:
    assert quick_check_ok(["ok"])
    assert not quick_check_ok(["row 1 missing from index x"])
    assert not quick_check_ok([])


def _db_with_orphan(path: Path) -> Engine:
    engine = _file_engine(path)
    run_migrations(engine)
    with Session(engine) as s:
        s.add(
            Recipe(
                name="Real",
                meal_type=MealType.both,
                protein=Protein.fish,
                ingredients=[],
                properties=[],
            )
        )
        s.commit()
    raw = sqlite3.connect(path)  # FK off: simulates data written before enforcement
    raw.execute(
        "INSERT INTO mealassignment (week_start, day, slot, recipe_id) "
        "VALUES ('2026-10-26', 0, 'lunch', 1), ('2026-11-02', 1, 'dinner', 77), "
        "('2026-11-09', 2, 'dinner', 78)"
    )
    raw.commit()
    raw.close()
    return engine


def test_integrity_check_backs_up_then_removes_only_orphans(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    db = tmp_path / "o.db"
    engine = _db_with_orphan(db)

    with caplog.at_level(logging.INFO):
        run_integrity_check(engine)

    with Session(engine) as s:
        rows = s.exec(select(MealAssignment)).all()
    assert [r.recipe_id for r in rows] == [1]
    copies = list(tmp_path.glob("o.db.bak-integrity-*"))
    assert len(copies) == 1
    saved = sqlite3.connect(copies[0])
    try:
        assert saved.execute("SELECT count(*) FROM mealassignment").fetchone()[0] == 3
    finally:
        saved.close()
    text_ = caplog.text
    assert "quick_check ok" in text_
    assert "Removed 2 planned meal(s)" in text_
    assert "2026-11-02" in text_ and "2026-11-09" in text_

    run_integrity_check(engine)  # clean now: no further copy
    assert len(list(tmp_path.glob("o.db.bak-integrity-*"))) == 1


def test_integrity_check_keeps_the_rows_when_the_backup_fails(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    engine = _db_with_orphan(tmp_path / "o.db")

    def fail(*args: Any, **kwargs: Any) -> None:
        raise OSError("no space")

    monkeypatch.setattr("cociboard.integrity.backup_sqlite", fail)
    run_integrity_check(engine)  # does not raise
    with Session(engine) as s:
        assert len(s.exec(select(MealAssignment)).all()) == 3
    assert "Integrity check failed" in caplog.text


def test_integrity_check_reports_a_bad_quick_check(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    engine = _file_engine(tmp_path / "q.db")
    run_migrations(engine)
    monkeypatch.setattr("cociboard.integrity.quick_check_ok", lambda rows: False)
    run_integrity_check(engine)
    assert any(r.levelno == logging.ERROR for r in caplog.records)


def test_integrity_check_ignores_in_memory_engines_without_files() -> None:
    engine = create_engine("sqlite://", poolclass=StaticPool)
    SQLModel.metadata.create_all(engine)
    run_integrity_check(engine)

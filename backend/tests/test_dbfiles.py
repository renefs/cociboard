"""Backup copy kinds: naming, separate rotation, custom directory."""

import os
import sqlite3
from pathlib import Path

import pytest
from sqlalchemy import Engine, create_engine

from cociboard.dbfiles import BackupKind, backup_sqlite, kind_of_copy, kind_of_label, list_copies


def _engine(tmp_path: Path) -> Engine:
    path = tmp_path / "live.db"
    conn = sqlite3.connect(path)
    conn.execute("CREATE TABLE t (x INTEGER)")
    conn.commit()
    conn.close()
    return create_engine(f"sqlite:///{path}")


def _old(directory: Path, name: str, mtime: int) -> Path:
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / name
    path.write_bytes(b"old")
    os.utime(path, (mtime, mtime))
    return path


@pytest.mark.parametrize(
    ("label", "kind"),
    [
        ("pre-restore", BackupKind.pre_restore),
        ("auto", BackupKind.auto),
        ("legacy", BackupKind.migration),
        ("integrity", BackupKind.migration),
        ("0001_initial", BackupKind.migration),
        ("0005_recipe_steps_servings_source", BackupKind.migration),
    ],
)
def test_kind_of_label(label: str, kind: BackupKind) -> None:
    assert kind_of_label(label) == kind


def test_kind_of_copy_reads_old_and_new_names() -> None:
    p = Path("/d")
    assert (
        kind_of_copy(p / "x.db.bak-pre-restore-20260101T000000Z", "x.db") == BackupKind.pre_restore
    )
    assert kind_of_copy(p / "x.db.bak-auto-20260101T000000Z", "x.db") == BackupKind.auto
    assert kind_of_copy(p / "x.db.bak-legacy-20260101T000000Z", "x.db") == BackupKind.migration
    assert kind_of_copy(p / "x.db.bak-0002_a-20260101T000000Z", "x.db") == BackupKind.migration
    assert kind_of_copy(p / "other.db.bak-auto-20260101T000000Z", "x.db") is None
    assert kind_of_copy(p / "x.db", "x.db") is None


def test_each_kind_rotates_on_its_own_with_old_named_files(tmp_path: Path) -> None:
    engine = _engine(tmp_path)
    migration = [
        _old(tmp_path, f"live.db.bak-0003_x-2026010{i}T000000Z", 1_600_000_000 + i)
        for i in range(1, 4)
    ]
    restore = [
        _old(tmp_path, f"live.db.bak-pre-restore-2026010{i}T000000Z", 1_650_000_000 + i)
        for i in range(1, 4)
    ]
    auto = [
        _old(tmp_path, f"live.db.bak-auto-2026010{i}T000000Z", 1_700_000_000 + i)
        for i in range(1, 4)
    ]

    new_auto = backup_sqlite(engine, "auto", keep=3)
    assert new_auto is not None
    assert not auto[0].exists() and all(p.exists() for p in auto[1:])
    assert all(p.exists() for p in migration + restore)

    backup_sqlite(engine, "pre-restore")
    assert not restore[0].exists()
    assert all(p.exists() for p in migration)

    backup_sqlite(engine, "integrity")
    assert not migration[0].exists()
    assert len(list_copies(tmp_path / "live.db", tmp_path, BackupKind.auto)) == 3
    assert len(list_copies(tmp_path / "live.db", tmp_path, BackupKind.pre_restore)) == 3
    assert len(list_copies(tmp_path / "live.db", tmp_path, BackupKind.migration)) == 3


def test_auto_default_keeps_seven_and_keep_is_at_least_one(tmp_path: Path) -> None:
    engine = _engine(tmp_path)
    for i in range(1, 9):
        _old(tmp_path, f"live.db.bak-auto-2026010{i}T000000Z", 1_700_000_000 + i)
    backup_sqlite(engine, "auto")
    assert len(list_copies(tmp_path / "live.db", tmp_path, BackupKind.auto)) == 7
    backup_sqlite(engine, "auto", keep=0)
    assert len(list_copies(tmp_path / "live.db", tmp_path, BackupKind.auto)) == 1


def test_custom_directory_is_created_and_only_auto_goes_there(tmp_path: Path) -> None:
    engine = _engine(tmp_path)
    target = tmp_path / "nested" / "backups"
    created = backup_sqlite(engine, "auto", directory=target, keep=2)
    assert created is not None and created.parent == target
    assert (target / created.name).is_file()
    migration = backup_sqlite(engine, "legacy")
    assert migration is not None and migration.parent == tmp_path
    assert list_copies(tmp_path / "live.db", target, BackupKind.migration) == []


def test_failed_copy_leaves_no_partial_file(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    engine = _engine(tmp_path)

    def boom(self: sqlite3.Connection, target: sqlite3.Connection) -> None:
        raise sqlite3.OperationalError("database or disk is full")

    class Failing(sqlite3.Connection):
        backup = boom  # type: ignore[assignment]  # simulate a failing copy

    real_connect = sqlite3.connect
    monkeypatch.setattr(
        "cociboard.dbfiles.sqlite3.connect",
        lambda path, *a, **k: real_connect(path, *a, factory=Failing, **k),
    )
    with pytest.raises(sqlite3.OperationalError):
        backup_sqlite(engine, "auto")
    assert list(tmp_path.glob("live.db.bak-*")) == []

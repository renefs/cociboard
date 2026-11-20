"""Automatic backups: the due decision, the service, the loop and the status endpoint."""

import asyncio
import errno
import os
import sqlite3
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import cast

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Engine, create_engine
from sqlmodel import Session

from cociboard.autobackup import (
    AutoBackupService,
    BackupState,
    backup_due,
    build_status,
    classify_error,
    database_modified,
)
from cociboard.config import Settings, get_settings
from cociboard.db import get_session
from cociboard.dbfiles import BackupKind, list_copies
from cociboard.main import create_app

NOW = datetime(2026, 11, 20, 12, 0, tzinfo=UTC)
HOUR = timedelta(hours=1)


def test_due_when_no_copy_exists_yet() -> None:
    assert backup_due(NOW, None, NOW - 100 * HOUR, 24)


def test_never_due_when_disabled() -> None:
    assert not backup_due(NOW, None, NOW, 0)
    assert not backup_due(NOW, NOW - 100 * HOUR, NOW, 0)


def test_not_due_before_the_interval() -> None:
    assert not backup_due(NOW, NOW - 23 * HOUR, NOW - HOUR, 24)


def test_due_after_the_interval_when_the_database_changed() -> None:
    assert backup_due(NOW, NOW - 24 * HOUR, NOW - 2 * HOUR, 24)
    assert backup_due(NOW, NOW - 48 * HOUR, NOW - 47 * HOUR, 24)


def test_not_due_when_nothing_changed_since_the_last_copy() -> None:
    assert not backup_due(NOW, NOW - 48 * HOUR, NOW - 49 * HOUR, 24)
    assert not backup_due(NOW, NOW - 48 * HOUR, NOW - 48 * HOUR, 24)


@pytest.mark.parametrize(
    ("exc", "code"),
    [
        (OSError(errno.ENOSPC, "No space"), "disk_full"),
        (OSError(errno.EDQUOT, "Quota"), "disk_full"),
        (sqlite3.OperationalError("database or disk is full"), "disk_full"),
        (PermissionError(errno.EACCES, "denied"), "permission_denied"),
        (OSError(errno.EROFS, "read-only"), "permission_denied"),
        (OSError(errno.EIO, "io"), "unknown"),
        (ValueError("x"), "unknown"),
    ],
)
def test_classify_error(exc: BaseException, code: str) -> None:
    assert classify_error(exc) == code


def _db(tmp_path: Path) -> tuple[Path, Engine]:
    path = tmp_path / "live.db"
    conn = sqlite3.connect(path)
    conn.execute("CREATE TABLE t (x INTEGER)")
    conn.commit()
    conn.close()
    return path, create_engine(f"sqlite:///{path}")


def _service(
    engine: Engine, now: list[datetime], **settings: object
) -> tuple[AutoBackupService, BackupState]:
    state = BackupState()
    service = AutoBackupService(
        engine,
        Settings(seed_on_startup=False, **settings),  # type: ignore[arg-type]  # kwargs forwarded as given
        state,
        clock=lambda: now[0],
    )
    return service, state


def test_database_modified_includes_the_wal_file(tmp_path: Path) -> None:
    path, _ = _db(tmp_path)
    os.utime(path, (1_700_000_000, 1_700_000_000))
    wal = tmp_path / "live.db-wal"
    wal.write_bytes(b"")
    os.utime(wal, (1_700_005_000, 1_700_005_000))
    assert database_modified(path) == datetime.fromtimestamp(1_700_005_000, UTC)


def test_run_once_makes_the_first_copy_then_waits(tmp_path: Path) -> None:
    path, engine = _db(tmp_path)
    now = [datetime.now(UTC)]
    service, state = _service(engine, now)

    first = asyncio.run(service.run_once())

    assert first is not None and ".bak-auto-" in first.name
    assert asyncio.run(service.run_once()) is None  # interval not over
    assert len(list_copies(path, tmp_path, BackupKind.auto)) == 1
    assert state.last_error is None


def test_run_once_after_the_interval_needs_a_change(tmp_path: Path) -> None:
    path, engine = _db(tmp_path)
    now = [datetime.now(UTC)]
    service, _ = _service(engine, now, backup_interval_hours=1)
    first = asyncio.run(service.run_once())
    assert first is not None
    now[0] += timedelta(hours=5)
    assert asyncio.run(service.run_once()) is None  # quiet database: no identical copy

    future = (now[0] + timedelta(hours=1)).timestamp()
    os.utime(path, (future, future))
    # the stamp has second resolution: make the next copy name differ
    first.rename(first.with_name(first.name.replace("auto-", "auto-0")))
    assert asyncio.run(service.run_once()) is not None


def test_run_once_uses_the_configured_directory_and_keeps_n(tmp_path: Path) -> None:
    path, engine = _db(tmp_path)
    target = tmp_path / "copies"
    for i in range(1, 4):
        old = target / f"live.db.bak-auto-2026010{i}T000000Z"
        target.mkdir(exist_ok=True)
        old.write_bytes(b"old")
        os.utime(old, (1_600_000_000 + i, 1_600_000_000 + i))
    now = [datetime.now(UTC)]
    service, _ = _service(engine, now, backup_dir=target, backups_kept=2, backup_interval_hours=1)
    now[0] += timedelta(hours=2)
    future = now[0].timestamp()
    os.utime(path, (future, future))

    created = asyncio.run(service.run_once())

    assert created is not None and created.parent == target
    assert len(list_copies(path, target, BackupKind.auto)) == 2
    assert list(tmp_path.glob("live.db.bak-*")) == []


def test_run_once_failure_is_remembered_not_raised(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    _, engine = _db(tmp_path)
    now = [datetime.now(UTC)]
    service, state = _service(engine, now)

    def full(*args: object, **kwargs: object) -> None:
        raise OSError(errno.ENOSPC, "No space left on device")

    monkeypatch.setattr("cociboard.autobackup.backup_sqlite", full)

    assert asyncio.run(service.run_once()) is None
    assert state.last_error is not None
    assert state.last_error.code == "disk_full" and state.last_error.at == now[0]
    assert "Automatic backup failed (disk_full)" in caplog.text

    monkeypatch.undo()  # the disk has room again: success clears the failure
    assert asyncio.run(service.run_once()) is not None
    assert state.last_error is None


def test_run_forever_checks_repeatedly_and_stops_on_cancel(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _, engine = _db(tmp_path)
    sleeps: list[float] = []
    checks = 0

    async def scenario() -> None:
        nonlocal checks
        service, _ = _service(engine, [datetime.now(UTC)])
        real_once = service.run_once

        async def counting() -> Path | None:
            nonlocal checks
            checks += 1
            return await real_once()

        async def fake_sleep(seconds: float) -> None:
            sleeps.append(seconds)
            if len(sleeps) == 3:
                raise asyncio.CancelledError
            await asyncio.sleep(0)

        monkeypatch.setattr(service, "run_once", counting)
        service.sleep = fake_sleep
        with pytest.raises(asyncio.CancelledError):
            await service.run_forever()

    asyncio.run(scenario())
    assert checks == 3
    assert sleeps == [15 * 60] * 3


def test_enabled_needs_a_file_database_and_an_interval(tmp_path: Path) -> None:
    _, engine = _db(tmp_path)
    assert _service(engine, [NOW])[0].enabled
    assert not _service(engine, [NOW], backup_interval_hours=0)[0].enabled
    assert not _service(create_engine("sqlite://"), [NOW])[0].enabled


def test_build_status_reports_copies_without_paths(tmp_path: Path) -> None:
    path, _ = _db(tmp_path)
    target = tmp_path / "x"
    target.mkdir()
    copy = target / "live.db.bak-auto-20260101T000000Z"
    copy.write_bytes(b"x")
    os.utime(copy, (1_700_000_000, 1_700_000_000))
    status = build_status(Settings(backup_dir=target, backups_kept=5), path, None)
    assert status.model_dump(mode="json") == {
        "enabled": True,
        "interval_hours": 24,
        "kept": 5,
        "last_backup_at": "2023-11-14T22:13:20Z",
        "copies": 1,
        "last_error": None,
        "custom_dir": True,
    }
    assert str(tmp_path) not in status.model_dump_json()
    off = build_status(Settings(backup_interval_hours=0), path, None)
    assert not off.enabled and off.copies == 0 and not off.custom_dir
    assert build_status(Settings(), None, None).enabled is False


def test_settings_treat_empty_strings_as_defaults(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in ("BACKUP_INTERVAL_HOURS", "BACKUPS_KEPT", "BACKUP_DIR"):
        monkeypatch.setenv(f"COCIBOARD_{name}", "")
    settings = Settings()
    assert (settings.backup_interval_hours, settings.backups_kept, settings.backup_dir) == (
        24,
        7,
        None,
    )
    monkeypatch.setenv("COCIBOARD_BACKUP_INTERVAL_HOURS", "0")
    monkeypatch.setenv("COCIBOARD_BACKUPS_KEPT", "3")
    monkeypatch.setenv("COCIBOARD_BACKUP_DIR", "/data/backups")
    settings = Settings()
    assert settings.backup_interval_hours == 0 and settings.backups_kept == 3
    assert settings.backup_dir == Path("/data/backups")


def test_settings_reject_zero_copies_kept() -> None:
    with pytest.raises(ValueError):
        Settings(backups_kept=0)


@pytest.fixture
def file_client(tmp_path: Path) -> Iterator[tuple[TestClient, Path]]:
    path, engine = _db(tmp_path)
    with Session(engine) as session:
        app = create_app()
        app.dependency_overrides[get_session] = lambda: session
        app.dependency_overrides[get_settings] = lambda: Settings(seed_on_startup=False)
        yield TestClient(app), path


def test_status_endpoint(file_client: tuple[TestClient, Path]) -> None:
    client, path = file_client
    body = client.get("/api/backup/status").json()
    assert body == {
        "enabled": True,
        "interval_hours": 24,
        "kept": 7,
        "last_backup_at": None,
        "copies": 0,
        "last_error": None,
        "custom_dir": False,
    }
    copy = path.with_name("live.db.bak-auto-20260101T000000Z")
    copy.write_bytes(b"x")
    body = client.get("/api/backup/status").json()
    assert body["copies"] == 1 and body["last_backup_at"] is not None


def test_status_endpoint_shows_the_last_failure(file_client: tuple[TestClient, Path]) -> None:
    client, _ = file_client
    from cociboard.schemas import BackupFailureInfo

    cast(FastAPI, client.app).state.backup_state.last_error = BackupFailureInfo(
        at=NOW, code="permission_denied"
    )
    body = client.get("/api/backup/status").json()
    assert body["last_error"] == {"at": "2026-11-20T12:00:00Z", "code": "permission_denied"}


def test_status_endpoint_needs_login_when_auth_is_on(client: TestClient) -> None:
    app = create_app(Settings(seed_on_startup=False, password="secret"))
    assert TestClient(app).get("/api/backup/status").status_code == 401


def test_lifespan_starts_and_stops_the_backup_loop(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from cociboard.db import get_engine

    monkeypatch.setenv("COCIBOARD_DATABASE_URL", f"sqlite:///{tmp_path / 'life.db'}")
    monkeypatch.setenv("COCIBOARD_SEED_ON_STARTUP", "false")
    get_settings.cache_clear()
    get_engine.cache_clear()
    try:
        with TestClient(create_app()) as client:
            body = client.get("/api/backup/status").json()
            assert body["enabled"] is True
            for _ in range(50):  # the first check runs right after startup
                if client.get("/api/backup/status").json()["copies"] == 1:
                    break
                import time

                time.sleep(0.05)
            assert client.get("/api/backup/status").json()["copies"] == 1
        assert len(list(tmp_path.glob("life.db.bak-auto-*"))) == 1
    finally:
        get_engine().dispose()
        get_settings.cache_clear()
        get_engine.cache_clear()

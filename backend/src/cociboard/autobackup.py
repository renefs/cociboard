"""Automatic database copies: when one is due, the background loop and the status report.

A copy is due when none exists yet, or when the interval has passed *and* the database
changed since the last copy (ADR-0022). The decision is pure; files and the clock are
injected so the loop can be tested without waiting.
"""

import asyncio
import errno
import logging
import sqlite3
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path

from sqlalchemy import Engine

from cociboard.config import Settings
from cociboard.dbfiles import AUTO_LABEL, BackupKind, backup_sqlite, list_copies, sqlite_file
from cociboard.schemas import BackupErrorCode, BackupFailureInfo, BackupStatus

logger = logging.getLogger("cociboard.backup")

CHECK_INTERVAL_SECONDS = 15 * 60

Clock = Callable[[], datetime]
Sleep = Callable[[float], Awaitable[None]]


def backup_due(
    now: datetime,
    last_auto_backup: datetime | None,
    db_last_modified: datetime,
    interval_hours: int,
) -> bool:
    """Whether to make an automatic copy now.

    Never when disabled (``interval_hours <= 0``); always when there is no copy yet;
    otherwise only once the interval has passed and the database changed since the last copy.
    """
    if interval_hours <= 0:
        return False
    if last_auto_backup is None:
        return True
    if now - last_auto_backup < timedelta(hours=interval_hours):
        return False
    return db_last_modified > last_auto_backup


def classify_error(exc: BaseException) -> BackupErrorCode:
    """Map a failure to a code the UI can translate."""
    if isinstance(exc, sqlite3.OperationalError) and "disk is full" in str(exc).lower():
        return "disk_full"
    if isinstance(exc, OSError):
        if exc.errno in (errno.ENOSPC, errno.EDQUOT):
            return "disk_full"
        if isinstance(exc, PermissionError) or exc.errno in (
            errno.EACCES,
            errno.EPERM,
            errno.EROFS,
        ):
            return "permission_denied"
    return "unknown"


def backup_directory(db_path: Path, configured: Path | None) -> Path:
    """Where automatic copies live: the configured directory, else next to the database."""
    return configured if configured is not None else db_path.parent


def _mtime(path: Path) -> datetime | None:
    try:
        return datetime.fromtimestamp(path.stat().st_mtime, UTC)
    except OSError:
        return None


def database_modified(db_path: Path) -> datetime:
    """Latest change of the database: the newest of the main file and its ``-wal`` file."""
    times = [
        t
        for t in (_mtime(db_path), _mtime(db_path.with_name(db_path.name + "-wal")))
        if t is not None
    ]
    return max(times) if times else datetime.fromtimestamp(0, UTC)


def last_auto_copy(db_path: Path, directory: Path) -> datetime | None:
    """Modification time of the newest automatic copy, if any."""
    times = [t for t in (_mtime(p) for p in list_copies(db_path, directory, BackupKind.auto)) if t]
    return max(times) if times else None


@dataclass
class BackupState:
    """What the app remembers between checks: the last failure, cleared by a success."""

    last_error: BackupFailureInfo | None = None


def build_status(
    settings: Settings, db_path: Path | None, last_error: BackupFailureInfo | None
) -> BackupStatus:
    """Report for ``GET /api/backup/status``. Never reveals host paths."""
    enabled = db_path is not None and settings.backup_interval_hours > 0
    last: datetime | None = None
    count = 0
    if db_path is not None:
        directory = backup_directory(db_path, settings.backup_dir)
        copies = list_copies(db_path, directory, BackupKind.auto)
        count = len(copies)
        last = last_auto_copy(db_path, directory)
    return BackupStatus(
        enabled=enabled,
        interval_hours=settings.backup_interval_hours,
        kept=settings.backups_kept,
        last_backup_at=last,
        copies=count,
        last_error=last_error,
        custom_dir=settings.backup_dir is not None,
    )


class AutoBackupService:
    """Makes automatic copies of a file-based SQLite database when they are due."""

    def __init__(
        self,
        engine: Engine,
        settings: Settings,
        state: BackupState,
        *,
        clock: Clock | None = None,
        sleep: Sleep = asyncio.sleep,
        check_seconds: float = CHECK_INTERVAL_SECONDS,
    ) -> None:
        self.engine = engine
        self.settings = settings
        self.state = state
        self.clock: Clock = clock or (lambda: datetime.now(UTC))
        self.sleep = sleep
        self.check_seconds = check_seconds

    @property
    def enabled(self) -> bool:
        return sqlite_file(self.engine) is not None and self.settings.backup_interval_hours > 0

    def backup_if_due(self) -> Path | None:
        """Blocking: copy the database when :func:`backup_due` says so."""
        db_path = sqlite_file(self.engine)
        if db_path is None:
            return None
        directory = backup_directory(db_path, self.settings.backup_dir)
        due = backup_due(
            self.clock(),
            last_auto_copy(db_path, directory),
            database_modified(db_path),
            self.settings.backup_interval_hours,
        )
        if not due:
            return None
        return backup_sqlite(
            self.engine, AUTO_LABEL, directory=directory, keep=self.settings.backups_kept
        )

    async def run_once(self) -> Path | None:
        """One check, off the event loop. Failures are logged and remembered, never raised."""
        try:
            created = await asyncio.to_thread(self.backup_if_due)
        except Exception as exc:
            code = classify_error(exc)
            self.state.last_error = BackupFailureInfo(at=self.clock(), code=code)
            logger.error("Automatic backup failed (%s): %s", code, exc)
            return None
        if created is not None:
            self.state.last_error = None
        return created

    async def run_forever(self) -> None:
        """Check now, then every ``check_seconds`` until cancelled."""
        while True:
            await self.run_once()
            await self.sleep(self.check_seconds)
